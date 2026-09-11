import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

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
    const token = String(input.token || '').trim();
    const newPassword = String(input.password || '');

    if (!email || !token || !newPassword) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_fields' }));
      return;
    }

    const db = getPool();
    const result = await db.query('SELECT id, reset_token, reset_token_expires FROM public.auth_users WHERE email=$1', [email]);
    const user = result.rows[0];

    if (!user || user.reset_token !== token) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'invalid_token', details: 'Token de recuperação inválido ou expirado.' }));
      return;
    }

    const now = new Date();
    if (new Date(user.reset_token_expires) < now) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'expired_token', details: 'O link de recuperação expirou.' }));
      return;
    }

    if (newPassword.length < 8) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'weak_password', details: 'A nova senha deve possuir no mínimo 8 caracteres.' }));
      return;
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE public.auth_users SET password_hash=$1, reset_token=NULL, reset_token_expires=NULL WHERE id=$2', [hash, user.id]);
    
    // Revoke all existing active sessions upon password reset (OWASP Session Management)
    await db.query('DELETE FROM public.auth_sessions WHERE user_id=$1', [user.id]);

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'Senha alterada com sucesso! Todas as sessões anteriores foram desconectadas.' }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
