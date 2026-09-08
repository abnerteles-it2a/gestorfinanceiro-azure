import { Pool } from 'pg';
import { sendEmail, generateResetToken } from '../utils/email';

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

    if (!email) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'missing_email' }));
      return;
    }

    const db = getPool();
    const result = await db.query('SELECT id FROM public.auth_users WHERE email=$1', [email]);
    const user = result.rows[0];

    if (!user) {
      // For security, don't reveal if user exists. Just say "if exists, email sent"
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, message: 'Se o e-mail existir, um link de recuperação será enviado.' }));
      return;
    }

    const token = generateResetToken();
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await db.query('UPDATE public.auth_users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3', [token, expires, user.id]);

    // Use APP_URL if available, otherwise try to detect from request headers
    let baseUrl = process.env.APP_URL || process.env.VITE_APP_URL || '';
    if (!baseUrl && req.headers.host) {
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      baseUrl = `${protocol}://${req.headers.host}`;
    }
    if (!baseUrl) baseUrl = 'http://localhost:3000';

    const resetLink = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    await sendEmail({
      to: email,
      subject: 'Recuperação de Senha - Gestor Financeiro',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #3b82f6;">Recuperação de Senha</h2>
          <p>Você solicitou a alteração de sua senha no Gestor Financeiro.</p>
          <p>Clique no botão abaixo para escolher uma nova senha:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Redefinir Senha</a>
          </div>
          <p>Este link é válido por 1 hora.</p>
          <p>Se você não solicitou isso, pode ignorar este e-mail.</p>
          <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          <p style="font-size: 12px; color: #6b7280; text-align: center;">&copy; ${new Date().getFullYear()} Gestor Financeiro. Todos os direitos reservados.</p>
        </div>
      `,
      text: `Para redefinir sua senha, acesse: ${resetLink}`
    });

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: true, message: 'E-mail de recuperação enviado!' }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
