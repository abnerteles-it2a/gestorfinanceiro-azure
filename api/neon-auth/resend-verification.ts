import { Pool } from 'pg';
import { sendEmail, generateVerificationCode } from '../utils/email';

let pool: Pool | null = null;
const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
};

const sendVerification = async (email: string, name: string, code: string) => sendEmail({
  to: email,
  subject: 'Novo código de verificação - Gestor Financeiro',
  html: `<div style="font-family:sans-serif"><p>Olá, ${name || 'cliente'}.</p><p>Seu novo código é:</p><p style="font-size:32px;font-weight:bold;letter-spacing:5px">${code}</p></div>`,
  text: `Seu novo código de verificação é: ${code}`,
});

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'missing_email' }));
    return;
  }

  try {
    const db = getPool();
    const result = await db.query('select auth_users.id, auth_users.email_verified, profiles.full_name from public.auth_users left join public.profiles on profiles.user_id = auth_users.id where auth_users.email=$1', [email]);
    const user = result.rows[0];
    if (!user || user.email_verified) {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return;
    }
    const code = generateVerificationCode();
    await db.query('update public.auth_users set verification_code=$1 where id=$2 and email_verified=false', [code, user.id]);
    await sendVerification(email, String(user.full_name || ''), code);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (error: any) {
    console.error('Verification resend failed:', error?.message);
    res.statusCode = 502;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'verification_delivery_failed' }));
  }
}
