import { jwtVerify } from 'jose';
import { Pool } from 'pg';
import { verifySession } from '../_auth_shared';
import { requireJwtSecret } from '../_config';
const isNoDb = (): boolean => !process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL;

const getDbInfo = () => {
  try {
    const raw = String(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '');
    if (!raw) return null;
    const u = new URL(raw);
    return { 
        host: u.hostname, 
        port: u.port ? Number(u.port) : null, 
        database: u.pathname ? u.pathname.replace(/^\//, '') : null, 
        sslmode: u.searchParams.get('sslmode') || null 
    };
  } catch {
    return null;
  }
};

let pool: Pool | null = null;
const getPool = () => {
  const g: any = globalThis as any;
  if (g.__gf_pg_pool) return g.__gf_pg_pool as Pool;
  if (pool) return pool;
  const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
  pool = new Pool({
    connectionString,
    max: 5,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connect', (client) => {
    client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
  });
  g.__gf_pg_pool = pool;
  return pool;
};

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const includeEnv = (url.searchParams.get('env') === '1') || (String(process.env.ENABLE_ENV_CHECK || '') === '1');

    const getEnvSummary = () => {
        if (!includeEnv) return undefined;
        const env = process.env || {};
        const present = (k: string) => typeof env[k] === 'string' && env[k]!.length > 0;
        const len = (k: string) => (typeof env[k] === 'string' ? env[k]!.length : 0);
        const num = (k: string) => {
          const v = env[k];
          if (typeof v === 'string' && v.trim() !== '') {
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
          }
          return null;
        };
        return {
          NEON_AUTH_SECRET: { present: present('NEON_AUTH_SECRET'), length: len('NEON_AUTH_SECRET') },
          STACK_SECRET_SERVER_KEY: { present: present('STACK_SECRET_SERVER_KEY'), length: len('STACK_SECRET_SERVER_KEY') },
          NEON_DATABASE_URL: { present: present('NEON_DATABASE_URL') },
          DATABASE_URL: { present: present('DATABASE_URL') },
          BLOB_READ_WRITE_TOKEN: { present: present('BLOB_READ_WRITE_TOKEN'), length: len('BLOB_READ_WRITE_TOKEN') },
          DOCS_MAX_SIZE_BYTES: num('DOCS_MAX_SIZE_BYTES'),
          DEV_ALLOW_UNAUTH_UPLOAD: present('DEV_ALLOW_UNAUTH_UPLOAD') ? String(env['DEV_ALLOW_UNAUTH_UPLOAD']) : '',
          NEON_SESSION_TTL_MINUTES: num('NEON_SESSION_TTL_MINUTES'),
          STACK_SESSION_TTL_MINUTES: num('STACK_SESSION_TTL_MINUTES'),
          db: getDbInfo()
        };
    };

    // 1. Handle No-DB mode
    if (isNoDb()) {
        let userId = 'no-db-user';
        let email = 'no-db@example.com';
        try {
            const auth = req.headers?.authorization || '';
            const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
            if (token) {
                const { payload } = await jwtVerify(token, new TextEncoder().encode(requireJwtSecret()));
                userId = String(payload.sub);
                email = String(payload.email);
            }
        } catch (e) {}
        
        res.statusCode = 200;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ 
            user: { id: userId, email, isAdmin: false }, 
            env: getEnvSummary() 
        }));
        return;
    }

    // 2. Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    // 3. Fetch User Data
    const db = getPool();
    const userRes = await db.query(`
      select u.id, u.email, u.is_admin, p.full_name, p.document, p.business_profile 
      from public.auth_users u 
      left join public.profiles p on u.id = p.user_id 
      where u.id=$1
    `, [userId]);

    const userRow = userRes.rows[0];
    if (!userRow) {
        res.statusCode = 404;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ error: 'user_not_found' }));
        return;
    }

    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ 
      user: { 
        id: userRow.id, 
        email: userRow.email, 
        isAdmin: !!userRow.is_admin,
        fullName: userRow.full_name || null,
        document: userRow.document || null,
        businessProfile: userRow.business_profile || null
      },
      env: getEnvSummary()
    }));

  } catch (e: any) {
    console.error('API /me Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
}
