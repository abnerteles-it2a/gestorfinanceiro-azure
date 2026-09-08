import { Pool } from 'pg';

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
  try {
    const input = req.body || {};

    const email = String(input.email || '').trim().toLowerCase();
    const code = String(input.code || '').trim();

    if (!email || !code) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_fields', details: 'E-mail e código são obrigatórios.' }));
      return;
    }

    const db = getPool();
    const result = await db.query('SELECT id, verification_code FROM public.auth_users WHERE email=$1', [email]);
    const user = result.rows[0];

    if (!user) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'user_not_found' }));
      return;
    }

    if (user.verification_code !== code) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_code', details: 'Código de verificação incorreto.' }));
      return;
    }

    await db.query('UPDATE public.auth_users SET email_verified=true, verification_code=NULL WHERE id=$1', [user.id]);

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'E-mail verificado com sucesso!' }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
