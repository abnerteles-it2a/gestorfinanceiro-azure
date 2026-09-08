import { jwtVerify } from 'jose';
import { Pool } from 'pg';
import { verifySession } from '../_auth_shared';

const isNoDb = (): boolean => !process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL;
let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('Method Not Allowed');
    return;
  }

  try {
    // 2. Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    const body = req.body || {};
    const { fullName, document, businessProfile } = body;

    if (isNoDb()) {
      res.statusCode = 200;
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ success: true, message: 'profile_updated_mock' }));
      return;
    }

    const db = getPool();

    // Use upsert for profiles
    await db.query(`
      insert into public.profiles (user_id, full_name, document, business_profile)
      values ($1, $2, $3, $4)
      on conflict (user_id) do update set
        full_name = excluded.full_name,
        document = excluded.document,
        business_profile = excluded.business_profile
    `, [userId, fullName || null, document || null, businessProfile || null]);

    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (e: any) {
    console.error('Update Profile Error:', e);
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e?.message || 'internal_error' }));
  }
}
