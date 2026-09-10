import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { verifySession } from './_auth_shared';

import { getPool } from './_db';


export default async function handler(req: any, res: any) {
  try {
    // Parse Body if needed
    const bodyInput = req.body || {};

    // Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    if (!userId) { res.statusCode = 401; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
    
    const db = getPool();
    
    // --- Access Control Logic ---
    const profileRes = await db.query('select org_id, plan_id, is_admin from public.profiles where user_id=$1', [userId]);
    const profile = profileRes.rows[0] || null;
    let orgId = profile?.org_id;

    if (orgId) {
        const viewMode = req.headers['x-view-mode'];
        if (viewMode === 'personal') {
            orgId = null;
        }
    }

    const targetOrgId = orgId || null;
    let role = 'owner'; // Default for personal

    if (orgId) {
        const memberRes = await db.query('select role from public.org_members where org_id=$1 and user_id=$2', [orgId, userId]);
        if (memberRes.rows[0]) role = memberRes.rows[0].role;
        
        // Auto-Admin Logic
        if (role === 'member') {
            const countRes = await db.query('select count(*) as count from public.org_members where org_id=$1', [orgId]);
            const memberCount = parseInt(countRes.rows[0]?.count || '0');
            if (memberCount === 1) role = 'admin';
            else {
                const orgRes = await db.query('select p.tier from public.organizations o left join public.plans p on o.plan_id = p.id where o.id=$1', [orgId]);
                const planTier = String(orgRes.rows[0]?.tier || '').toLowerCase();
                if (['starter', 'plus', 'pro', 'pró'].includes(planTier)) role = 'admin';
            }
        }
    }
    // -----------------------------
    
    if (req.method === 'POST') {
        const { description, amount, transaction_type, account_id, to_account_id, category, date, payment_method, cost_center_id } = bodyInput;

        if (!amount || !transaction_type || !account_id || !date) {
            res.statusCode = 400; 
            res.end(JSON.stringify({ error: 'missing_fields' })); 
            return;
        }

        if (transaction_type === 'Transferência' && !to_account_id) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'missing_to_account_id', message: 'Conta de destino é obrigatória para transferências.' }));
            return;
        }

        // Permission Check for Cost Center
        if (orgId && role === 'member' && cost_center_id) {
            const permRes = await db.query('select role from public.cost_center_permissions where user_id=$1 and cost_center_id=$2', [userId, cost_center_id]);
            const perm = permRes.rows[0]?.role;
            if (!perm || (perm !== 'editor' && perm !== 'manager')) {
                 res.statusCode = 403; 
                 res.end(JSON.stringify({ error: 'permission_denied_cc' })); 
                 return;
            }
        }

        const idRes = await db.query('SELECT gen_random_uuid() as id');
        const newId = idRes.rows[0].id;

        await db.query(
            `INSERT INTO public.transactions 
            (id, user_id, date, account_id, to_account_id, transaction_type, category, description, amount, payment_method, cost_center_id, org_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [newId, userId, date, account_id, to_account_id || null, transaction_type, category || 'Outros', description || '', amount, payment_method || null, cost_center_id || null, targetOrgId]
        );

        res.statusCode = 201;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ success: true, id: newId }));
        return;
    }

    if (req.method === 'PUT') {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('id') || bodyInput.id;
        
        if (!id) {
             res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return;
        }

        // Fetch existing
        const txRes = await db.query('select * from public.transactions where id=$1', [id]);
        const tx = txRes.rows[0];
        if (!tx) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return; }

        // Check Edit Access
        let canEdit = false;
        if (targetOrgId) {
            if (tx.org_id === targetOrgId) {
                if (tx.user_id === userId) canEdit = true;
                if (role === 'admin' || role === 'owner') canEdit = true;
                if (!canEdit && role === 'member' && tx.cost_center_id) {
                    const permRes = await db.query('select role from public.cost_center_permissions where user_id=$1 and cost_center_id=$2', [userId, tx.cost_center_id]);
                    const perm = permRes.rows[0]?.role;
                    if (perm === 'editor' || perm === 'manager') canEdit = true;
                }
            }
        } else {
            if (tx.user_id === userId && !tx.org_id) canEdit = true;
        }

        if (!canEdit) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'permission_denied' }));
            return;
        }

        // Check New CC Permission
        if (bodyInput.cost_center_id && bodyInput.cost_center_id !== tx.cost_center_id) {
             if (role === 'member') {
                 const permRes = await db.query('select role from public.cost_center_permissions where user_id=$1 and cost_center_id=$2', [userId, bodyInput.cost_center_id]);
                 const perm = permRes.rows[0]?.role;
                 if (!perm || (perm !== 'editor' && perm !== 'manager')) {
                     res.statusCode = 403;
                     res.end(JSON.stringify({ error: 'permission_denied_new_cc' }));
                     return;
                 }
             }
        }

        const { description, amount, transaction_type, account_id, to_account_id, category, date, payment_method, cost_center_id } = bodyInput;
        
        if (targetOrgId) {
            await db.query(
                `UPDATE public.transactions 
                 SET description=$1, amount=$2, transaction_type=$3, account_id=$4, to_account_id=$5, category=$6, date=$7, payment_method=$8, cost_center_id=$9
                 WHERE id=$10 and org_id=$11`,
                [description, amount, transaction_type, account_id, to_account_id || null, category, date, payment_method, cost_center_id || null, id, targetOrgId]
            );
        } else {
            await db.query(
                `UPDATE public.transactions 
                 SET description=$1, amount=$2, transaction_type=$3, account_id=$4, to_account_id=$5, category=$6, date=$7, payment_method=$8, cost_center_id=$9
                 WHERE id=$10 and user_id=$11 and org_id is null`,
                [description, amount, transaction_type, account_id, to_account_id || null, category, date, payment_method, cost_center_id || null, id, userId]
            );
        }

        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
        return;
    }

    if (req.method === 'DELETE') {
        const url = new URL(req.url, 'http://localhost');
        const id = url.searchParams.get('id') || bodyInput.id;
        
        if (!id) {
             res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return;
        }

        const txRes = await db.query('select * from public.transactions where id=$1', [id]);
        const tx = txRes.rows[0];
        if (!tx) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return; }

        let canDelete = false;
        if (targetOrgId) {
            if (tx.org_id === targetOrgId) {
                if (tx.user_id === userId) canDelete = true;
                if (role === 'admin' || role === 'owner') canDelete = true;
                if (!canDelete && role === 'member' && tx.cost_center_id) {
                    const permRes = await db.query('select role from public.cost_center_permissions where user_id=$1 and cost_center_id=$2', [userId, tx.cost_center_id]);
                    const perm = permRes.rows[0]?.role;
                    if (perm === 'manager' || perm === 'editor') canDelete = true;
                }
            }
        } else {
            if (tx.user_id === userId && !tx.org_id) canDelete = true;
        }

        if (!canDelete) {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'permission_denied' }));
            return;
        }

        await db.query('DELETE FROM public.transactions WHERE id=$1', [id]);
        res.statusCode = 200;
        res.end(JSON.stringify({ success: true }));
        return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method_not_allowed' }));

  } catch (e: any) {
    console.error(e);
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
