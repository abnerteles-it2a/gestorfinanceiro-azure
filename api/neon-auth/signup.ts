import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { sendEmail, generateVerificationCode } from '../utils/email';

let pool: Pool | null = null;
const getPool = () => {
  const g: any = globalThis as any;
  if (g.__gf_pg_pool) return g.__gf_pg_pool as Pool;
  if (pool) return pool;
  const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
  pool = new Pool({ connectionString, max: 5, ssl: { rejectUnauthorized: false } });
  pool.on('connect', (client) => {
    client.query('SET client_encoding = "UTF8"').catch((error) => console.error('Failed to set client encoding:', error));
  });
  g.__gf_pg_pool = pool;
  return pool;
};

const json = (res: any, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  const input = req.body || {};
  const email = String(input.email || '').trim().toLowerCase();
  const password = String(input.password || '');
  const name = String(input.name || '').trim();
  const orgName = String(input.orgName || input.organization || '').trim();
  const planTier = String(input.planTier || input.tier || '').trim().toLowerCase();
  const seats = Number(input.seats);
  const businessProfile = String(input.businessProfile || '').trim().toLowerCase();
  const cpfCnpj = String(input.cpfCnpj || '').replace(/\D/g, '') || null;

  if (!email || !password || !name || !orgName || !planTier || !businessProfile || !Number.isInteger(seats)) {
    json(res, 400, { error: 'missing_required_fields', details: 'Email, senha, nome, organização, plano, assentos e perfil são obrigatórios.' });
    return;
  }
  if (!['starter', 'plus', 'pro'].includes(planTier)) {
    json(res, 400, { error: 'tier_unavailable', details: 'Plano inválido selecionado.' });
    return;
  }
  if ((planTier === 'starter' || planTier === 'plus') && seats !== 1) {
    json(res, 400, { error: 'invalid_seats' });
    return;
  }
  if (planTier === 'pro' && seats < 2) {
    json(res, 400, { error: 'pro_requires_min_2_seats' });
    return;
  }

  const db = getPool();
  const client = await db.connect();
  const id = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
  const orgId = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
  const memberId = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
  const verificationCode = generateVerificationCode();
  let planId = '';

  try {
    const planRow = await client.query('select id from public.plans where lower(tier)=lower($1) limit 1', [planTier]);
    if (!planRow.rows[0]) {
      json(res, 400, { error: 'plan_not_found', details: 'O plano selecionado não foi encontrado no sistema.' });
      return;
    }

    planId = planRow.rows[0].id;
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      'insert into public.auth_users(id,email,password_hash,cpf_cnpj,verification_code,email_verified) values($1,$2,$3,$4,$5,false)',
      [id, email, passwordHash, cpfCnpj, verificationCode],
    );
    await client.query('insert into public.organizations(id,name,seats,plan_id) values($1,$2,$3,$4)', [orgId, orgName, seats, planId]);
    await client.query(
      "insert into public.org_subscriptions(org_id, provider, status, period_start, period_end, billing_period, requested_tier) values($1, 'internal', 'active', now(), now() + interval '14 days', 'trial', $2)",
      [orgId, planTier],
    );
    await client.query('insert into public.org_members(id,org_id,user_id,role) values($1,$2,$3,$4)', [memberId, orgId, id, 'owner']);
    await client.query(
      'insert into public.profiles(user_id,org_id,plan_id,is_admin,full_name,document,business_profile) values($1,$2,$3,false,$4,$5,$6)',
      [id, orgId, planId, name, cpfCnpj, businessProfile],
    );
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error?.code === '23505') {
      const constraint = String(error?.constraint || '');
      json(res, 409, { error: constraint.includes('organizations') || constraint.includes('name') ? 'org_name_exists' : 'email_exists' });
      return;
    }
    console.error('Signup failed:', error?.message);
    json(res, 500, { error: 'signup_failed' });
    return;
  } finally {
    client.release();
  }

  try {
    await sendEmail({
      to: email,
      subject: 'Verifique seu e-mail - Gestor Financeiro',
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2>Bem-vindo ao Gestor Financeiro!</h2><p>Olá, <strong>${name}</strong>.</p><p>Use este código para confirmar seu e-mail:</p><p style="font-size:32px;font-weight:bold;letter-spacing:5px">${verificationCode}</p></div>`,
      text: `Seu código de verificação é: ${verificationCode}`,
    });
  } catch (error: any) {
    console.error('Verification email delivery failed:', error?.message);
    json(res, 202, { requiresVerification: true, verificationDelivery: 'pending_retry', user: { id, email, name, businessProfile, document: cpfCnpj }, organization: { id: orgId, name: orgName, seats, planId: planId } });
    return;
  }

  json(res, 201, { requiresVerification: true, user: { id, email, name, businessProfile, document: cpfCnpj }, organization: { id: orgId, name: orgName, seats, planId: planId } });
}
