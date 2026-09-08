import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3Client, getBucketName } from '../s3-client';
import { verifySession } from '../_auth_shared';

let poolInstance: Pool | null = null;
const getPool = () => {
  if (!poolInstance) {
    const rawConnectionString = String(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '');
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    if (connectionString) {
      poolInstance = new Pool({ 
        connectionString,
        ssl: { rejectUnauthorized: false }
      });
      // Ensure UTF-8 encoding for all connections
      poolInstance.on('connect', (client) => {
        client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
      });
    }
  }
  return poolInstance;
};

export default async function handler(req: any, res: any) {
  const pool = getPool();
  const s3Client = getS3Client();
  const bucketName = getBucketName();

  try {
    // 2. Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    let userId = '';
    
    if (!result) {
        if (String(process.env.DEV_ALLOW_UNAUTH_UPLOAD || '') === '1') {
            userId = '00000000-0000-0000-0000-000000000000';
        } else {
            return; // verifySession already handled error response
        }
    } else {
        userId = result.userId;
    }

    if (!s3Client || !bucketName) {
       console.error('S3_CLIENT_MISSING', { hasClient: !!s3Client, hasBucket: !!bucketName });
       // Fallback or error if S3 is not configured
       // If GET request and just listing from DB, it might fail on signing URLs if client is missing
    }

    if (req.method === 'GET') {
      if (pool) {
        await pool.query(`
        create table if not exists public.fiscal_documents (
          id uuid primary key,
          user_id uuid not null,
          org_id uuid,
          pathname text not null,
          url text not null,
          content_type text,
          size integer,
          checksum text,
          doc_type text,
          issue_date date,
          supplier text,
          amount numeric(14,2),
          notes text,
          created_at timestamptz default now(),
          is_folder boolean default false,
          parent_id uuid,
          name text,
          permissions jsonb default '{}'
        )`);
        // Migrations for existing tables
        try { await pool.query('alter table public.fiscal_documents add column if not exists is_folder boolean default false'); } catch {}
        try { await pool.query('alter table public.fiscal_documents add column if not exists parent_id uuid'); } catch {}
        try { await pool.query('alter table public.fiscal_documents add column if not exists name text'); } catch {}
        try { await pool.query('alter table public.fiscal_documents add column if not exists permissions jsonb default \'{}\''); } catch {}
        try { await pool.query('alter table public.fiscal_documents add column if not exists cost_center_id uuid'); } catch {}

        await pool.query('create index if not exists idx_fiscal_documents_user on public.fiscal_documents(user_id)');
        await pool.query('create index if not exists idx_fiscal_documents_org on public.fiscal_documents(org_id)');
        await pool.query('create index if not exists idx_fiscal_documents_created on public.fiscal_documents(created_at desc)');
        await pool.query('create index if not exists idx_fiscal_documents_org_created on public.fiscal_documents(org_id, created_at)');
        await pool.query('create index if not exists idx_fiscal_documents_user_created on public.fiscal_documents(user_id, created_at)');
        await pool.query('create index if not exists idx_fiscal_documents_parent on public.fiscal_documents(parent_id)');
        await pool.query('create index if not exists idx_fiscal_documents_cc on public.fiscal_documents(cost_center_id)');
      }
      const url = new URL(req.url, 'http://localhost');
      const orgIdParam = String(url.searchParams.get('orgId') || '');
      const parentIdParam = String(url.searchParams.get('parentId') || '');
      const countOnly = String(url.searchParams.get('count') || '') === '1';
      const page = Math.max(1, parseInt(String(url.searchParams.get('page') || '1'), 10) || 1);
      const perPage = Math.min(100, Math.max(1, parseInt(String(url.searchParams.get('per_page') || '20'), 10) || 20));
      const offset = (page - 1) * perPage;
      console.log('docs_list_params', { userId, orgIdParam, parentIdParam, page, perPage, offset, hasPool: !!pool });
      
      // Fast path: count all docs (files only, no folders) across the entire scope (ignore parent_id)
      if (countOnly) {
        let count = 0;
        let bytes = 0;
        if (pool) {
          const params: any[] = [];
          let where = '';
          if (orgIdParam) { params.push(orgIdParam); where = 'where org_id=$1'; }
          else { params.push(userId); where = 'where user_id=$1'; }
          const r = await pool.query(
            `select count(*)::int as c, coalesce(sum(size),0)::bigint as bytes
             from public.fiscal_documents
             ${where} and coalesce(is_folder,false)=false`,
            params
          );
          count = Number(r.rows[0]?.c || 0);
          bytes = Number(r.rows[0]?.bytes || 0);
        } else {
          const store: any[] = (globalThis as any).__docs_store || [];
          const filtered = store.filter(
            (d: any) =>
              (orgIdParam ? (d.org_id === orgIdParam || d.user_id === userId) : (d.user_id === userId && !d.org_id)) &&
              !d.is_folder
          );
          count = filtered.length;
          bytes = filtered.reduce((sum: number, d: any) => sum + Number(d.size || 0), 0);
        }
        res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ count, bytes })); return;
      }

      let rows: any[] = [];
      if (pool) {
        const params: any[] = [];
        let where = '';
        if (orgIdParam) { 
            // In Org Mode: Show Org docs (scoped by permissions)
            params.push(orgIdParam); 
            where = `where org_id=$1`;
            
            // Check if user is member (not owner/admin) to apply CC filters
            const memberCheck = await pool.query('select role from public.org_members where org_id=$1 and user_id=$2', [orgIdParam, userId]);
            const role = memberCheck.rows[0]?.role;
            if (role === 'member') {
                const permsRes = await pool.query('select cost_center_id from public.cost_center_permissions where user_id=$1 and org_id=$2', [userId, orgIdParam]);
                const allowedCCs = permsRes.rows.map(r => r.cost_center_id);
                if (allowedCCs.length > 0) {
                    const ccList = allowedCCs.map(id => `'${id}'`).join(',');
                    where += ` and (cost_center_id in (${ccList}) or cost_center_id is null)`;
                } else {
                    where += ` and cost_center_id is null`;
                }
            }
        } else { 
            // In Personal Mode: Show only User docs (no org_id)
            params.push(userId); 
            where = `where user_id=$1`; 
        }

        // Folder filtering
        if (parentIdParam && parentIdParam !== 'root') {
            params.push(parentIdParam);
            where += ` and parent_id=$${params.length}`;
        } else {
            where += ` and parent_id is null`;
        }

        const r = await pool.query(`select id,pathname,url,content_type,size,checksum,doc_type,issue_date,supplier,amount,notes,created_at,is_folder,parent_id,name,permissions,user_id,cost_center_id from public.fiscal_documents ${where} order by is_folder desc, created_at desc limit $${params.length+1} offset $${params.length+2}`, [...params, perPage, offset]);
        rows = r.rows || [];
      } else {
        const store: any[] = (globalThis as any).__docs_store || [];
        const filtered = store.filter(d => orgIdParam ? (d.org_id === orgIdParam || d.user_id === userId) : d.user_id === userId);
        rows = filtered.sort((a,b)=> new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(offset, offset + perPage);
      }

      // S3 List Fallback if DB is empty? 
      // For now, let's rely on DB. If DB is empty, user sees empty list.
      // S3 listing is expensive and complex to paginate alongside DB.
      
      const withSigned = await Promise.all(rows.map(async (d: any) => {
        try { 
          if (s3Client && bucketName) {
            const command = new GetObjectCommand({ Bucket: bucketName, Key: d.pathname });
            const signed = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            return { ...d, url: signed }; 
          }
          return d;
        } catch { return d; }
      }));
      
      res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ rows: withSigned, page, per_page: perPage })); return;
    }

    if (req.method === 'DELETE') {
      let raw = '';
      await new Promise<void>((resolve) => { req.on('data', (c: any) => { raw += c; }); req.on('end', resolve); });
      const input = raw ? JSON.parse(raw) : {};
      const pathname = String(input.pathname || '');
      const orgId = String(input.orgId || '');
      if (!pathname) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_pathname' })); return; }
      
      try {
        if (s3Client && bucketName) {
          await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: pathname }));
          // Also try to delete .meta.json if it exists (legacy support)
          try { await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: pathname + '.meta.json' })); } catch {}
        }
      } catch (e: any) {
        console.error('s3_delete_failed', e);
        // Continue to delete from DB even if S3 fails (orphan record)
      }

      try {
        if (pool) {
          const params: any[] = [pathname, userId];
          let where = 'where pathname=$1 and user_id=$2';
          if (orgId) { params.push(orgId); where = 'where pathname=$1 and (user_id=$2 or org_id=$3)'; }
          await pool.query(`delete from public.fiscal_documents ${where}`, params);
        } else {
          const store: any[] = (globalThis as any).__docs_store || [];
          const next = store.filter((d: any) => d.pathname !== pathname || (orgId ? !(d.user_id === userId || d.org_id === orgId) : d.user_id !== userId));
          (globalThis as any).__docs_store = next;
        }
      } catch {}
      res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ deleted: true })); return;
    }

    if (req.method === 'POST') {
      let input: any = {};
      if (req.body) {
         input = req.body;
      } else {
         let raw = '';
         await new Promise<void>((resolve) => { req.on('data', (c: any) => { raw += c; }); req.on('end', resolve); });
         input = raw ? JSON.parse(raw) : {};
      }
      
      console.log('upload_handler_post_input', { action: input.action, hasFilename: !!input.filename, hasKey: !!input.key, orgId: input.orgId });

      const action = String(input.action || '');

      // Flow 1: Get Presigned URL
      if (action === 'get_presigned_url') {
        const filename = String(input.filename || '').trim();
        const contentType = String(input.contentType || 'application/octet-stream');
        const orgId = String(input.orgId || '');
        
        if (!filename) { 
            console.error('upload_error_missing_filename', input);
            res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_filename', received: input })); return; 
        }
        if (!s3Client || !bucketName) { 
            const missing = [];
            if (!s3Client) missing.push('S3_CLIENT (AccessKey/Secret)');
            if (!bucketName) missing.push('BUCKET_NAME');
            console.error('upload_error_s3_not_configured', missing);
            res.statusCode = 500; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 's3_not_configured', missing })); return; 
        }

        const pathnameBase = filename.replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const key = (orgId ? `org_${orgId}/` : '') + `user_${userId}/` + `${Date.now()}_${pathnameBase}`;
        
        const command = new PutObjectCommand({ Bucket: bucketName, Key: key, ContentType: contentType });
        const url = await getSignedUrl(s3Client, command, { expiresIn: 600 }); // 10 minutes to upload

        res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ url, key }));
        return;
      }

      // Flow 3: Create Folder
      if (action === 'create_folder') {
          const name = String(input.name || '').trim();
          const orgId = String(input.orgId || '');
          const parentId = String(input.parentId || '');
          
          if (!name) {
              res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_name' })); return;
          }

          const id = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
          
          if (pool) {
              try {
                  const inserted = await pool.query(
                      'insert into public.fiscal_documents(id, user_id, org_id, pathname, url, is_folder, parent_id, name, permissions, created_at) values($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) returning *',
                      [id, userId, (orgId || null), `folder_${id}`, '', true, (parentId || null), name, JSON.stringify(input.permissions || {})]
                  );
                  res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ folder: inserted.rows[0] }));
                  return;
              } catch (e: any) {
                  console.error('db_create_folder_error', e);
                  res.statusCode = 500; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'db_create_folder_failed', message: e.message }));
                  return;
              }
          }
          res.statusCode = 501; res.end(JSON.stringify({ error: 'not_implemented_memory' })); return;
      }

      // Flow 4: Update Permissions
      if (action === 'update_permissions') {
          const id = String(input.id || '');
          const permissions = input.permissions || {};
          
          if (!id) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return; }
          
          if (pool) {
              try {
                  // Check if user owns the doc or is admin (TODO: proper check)
                  // For now, allow update
                  await pool.query('update public.fiscal_documents set permissions=$1 where id=$2 and (user_id=$3 or org_id is not null)', [JSON.stringify(permissions), id, userId]);
                  res.statusCode = 200; res.end(JSON.stringify({ success: true }));
                  return;
              } catch (e: any) {
                  res.statusCode = 500; res.end(JSON.stringify({ error: 'db_update_failed' })); return;
              }
          }
           res.statusCode = 501; res.end(JSON.stringify({ error: 'not_implemented_memory' })); return;
      }

      // Flow 2: Confirm Upload (Save to DB)
      if (action === 'confirm_upload') {
        const key = String(input.key || '');
        const orgId = String(input.orgId || '');
        const parentId = String(input.parentId || '');
        const docType = String(input.docType || '');
        const issueDate = String(input.issueDate || '');
        const supplier = String(input.supplier || '');
        const amount = input.amount == null ? null : Number(input.amount);
        const notes = String(input.notes || '');
        const contentType = String(input.contentType || 'application/octet-stream');
        const size = Number(input.size || 0);
        const permissions = input.permissions || {};
        const costCenterId = String(input.costCenterId || '').trim() || null;
        const filename = String(input.filename || key.split('/').pop() || 'Untitled');

        if (!key) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_key' })); return; }

        if (pool) {
          try {
            // Check storage limit
            const profileRes = await pool.query('select plan_id, preferences from public.profiles where user_id=$1', [userId]);
            const profile = profileRes.rows[0];
            const preferences = profile?.preferences || {};
            const isMei = !!preferences.isMei;
            
            let planTier = 'starter';
            if (orgId) {
                const orgRes = await pool.query('select p.tier from public.organizations o left join public.plans p on o.plan_id = p.id where o.id=$1', [orgId]);
                planTier = String(orgRes.rows[0]?.tier || 'starter').toLowerCase();
            } else if (profile?.plan_id) {
                const pRes = await pool.query('select tier from public.plans where id=$1', [profile.plan_id]);
                planTier = String(pRes.rows[0]?.tier || 'starter').toLowerCase();
            }

            const storageLimits: Record<string, number> = {
                starter: 100 * 1024 * 1024,
                plus: 1024 * 1024 * 1024,
                pro: 10 * 1024 * 1024 * 1024
            };
            const limit = storageLimits[planTier] || storageLimits.starter;

            const usageRes = await pool.query(`select coalesce(sum(size), 0)::bigint as total from public.fiscal_documents where ${orgId ? 'org_id=$1' : 'user_id=$1'}`, [orgId || userId]);
            const currentUsage = Number(usageRes.rows[0]?.total || 0);

            if (currentUsage + size > limit) {
                res.statusCode = 402;
                res.setHeader('content-type','application/json');
                res.end(JSON.stringify({ error: 'limit_reached_storage', limit, currentUsage, requested: size }));
                return;
            }

            const id = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
            const docUrl = `https://${bucketName}.s3.amazonaws.com/${key}`; // Base URL, will be signed on read

            const inserted = await pool.query(
              'insert into public.fiscal_documents(id,user_id,org_id,pathname,url,content_type,size,checksum,doc_type,issue_date,supplier,amount,notes,parent_id,name,permissions,cost_center_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *',
              [id, userId, (orgId || null), key, docUrl, contentType, size, null, (docType || null), (issueDate || null), (supplier || null), (amount == null ? null : amount), (notes || null), (parentId || null), filename, JSON.stringify(permissions), costCenterId]
            );
            res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ document: inserted.rows[0] }));
            return;
          } catch (e: any) {
            console.error('db_insert_error', e);
            res.statusCode = 500; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'db_insert_failed', message: e.message }));
            return;
          }
        } else {
           // In-memory fallback (no enforcement for simpler mock)
           const id = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
           const docUrl = `https://${bucketName}.s3.amazonaws.com/${key}`;
           const doc = { id, user_id: userId, org_id: (orgId || null), pathname: key, url: docUrl, content_type: contentType, size, checksum: null, doc_type: (docType || null), issue_date: (issueDate || null), supplier: (supplier || null), amount: (amount == null ? null : amount), notes: (notes || null), created_at: new Date().toISOString() };
           const store: any[] = (globalThis as any).__docs_store || [];
           store.push(doc);
           (globalThis as any).__docs_store = store;
           res.statusCode = 200; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ document: doc }));
           return;
        }
      }

      // Legacy Server-side Upload (Base64) - Optional, but keeping for compatibility if used elsewhere
      const filename = String(input.filename || '').trim();
      const contentBase64 = String(input.contentBase64 || '');
      
      if (filename && contentBase64) {
         // ... implement S3 upload for base64 ...
         // For now, let's just return error or implement if needed. 
         // Given the complexity, let's assume we can deprecate this or implement it simply.
         
         const buf = Buffer.from(contentBase64, 'base64');
         const pathnameBase = filename.replace(/[^a-zA-Z0-9_\-.]/g, '_');
         const key = (String(input.orgId || '') ? `org_${input.orgId}/` : '') + `user_${userId}/` + `${Date.now()}_${pathnameBase}`;
         
         if (s3Client && bucketName) {
            await s3Client.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: buf,
                ContentType: input.contentType || 'application/octet-stream'
            }));
            // Insert DB ...
            // Re-using logic would be better.
         }
      }
      
      console.error('upload_error_invalid_action', { action, inputKeys: Object.keys(input) });
      res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_action', received_action: action }));
      return;
    }
    
    res.statusCode = 405; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'method_not_allowed' }));

  } catch (e: any) {
    console.error('handler_error', e);
    res.statusCode = 500; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'internal_error', message: e.message }));
  }
}
