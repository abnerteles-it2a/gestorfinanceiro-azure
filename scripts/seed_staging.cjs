const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString = process.env.DATABASE_URL || 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const sqls = [
  'alter table public.profiles add column if not exists full_name text',
  'alter table public.profiles add column if not exists document text',
  'alter table public.profiles add column if not exists preferences jsonb default \'{}\'',
  'alter table public.profiles add column if not exists business_profile text default \'pf\'',
  
  // Seed Plans
  `insert into public.plans (id, name, tier, created_at)
   values 
     ('11111111-1111-1111-1111-111111111111', 'Starter', 'starter', now()),
     ('22222222-2222-2222-2222-222222222222', 'Plus', 'plus', now()),
     ('33333333-3333-3333-3333-333333333333', 'Pro', 'pro', now())
   on conflict (id) do update set name = excluded.name, tier = excluded.tier`,
];

async function seed() {
  console.log('--- Aplicando Seeds e Ajustes de Autenticação ---');
  const client = await pool.connect();

  for (const s of sqls) {
    try {
      await client.query(s);
    } catch (e) {
      console.warn('Seed statement notice:', e.message);
    }
  }

  // Create or verify Admin User (admin@it2a.com)
  const adminEmail = 'admin@it2a.com';
  const existingAdmin = await client.query('select id from public.auth_users where email = $1', [adminEmail]);

  if (existingAdmin.rows.length === 0) {
    const adminId = '00000000-0000-0000-0000-000000000001';
    const orgId = '00000000-0000-0000-0000-000000000002';
    const planId = '33333333-3333-3333-3333-333333333333'; // Pro
    const passwordHash = await bcrypt.hash('Admin@Gestor2026!', 10);

    await client.query('BEGIN');
    await client.query(
      `insert into public.auth_users (id, email, password_hash, is_admin, email_verified, created_at)
       values ($1, $2, $3, true, true, now())`,
      [adminId, adminEmail, passwordHash]
    );

    await client.query(
      `insert into public.organizations (id, name, seats, plan_id, created_at)
       values ($1, 'IT2a Tecnologia', 10, $2, now())
       on conflict (id) do nothing`,
      [orgId, planId]
    );

    await client.query(
      `insert into public.org_members (id, org_id, user_id, role, created_at)
       values (gen_random_uuid(), $1, $2, 'owner', now())`,
      [orgId, adminId]
    );

    await client.query(
      `insert into public.profiles (user_id, org_id, plan_id, is_admin, full_name, business_profile, created_at)
       values ($1, $2, $3, true, 'Administrador IT2a', 'empresa', now())
       on conflict (user_id) do update set is_admin = true`,
      [adminId, orgId, planId]
    );

    // Initial Account for Admin
    await client.query(
      `insert into public.accounts (id, user_id, name, bank, initial_balance, created_at)
       values (gen_random_uuid(), $1, 'Conta Corrente Principal', 'Banco Inter', 5000.00, now())`,
      [adminId]
    );

    // Initial Categories
    const defaultCats = [
      { name: 'Alimentação', type: 'Saída' },
      { name: 'Transporte', type: 'Saída' },
      { name: 'Infraestrutura Cloud', type: 'Saída' },
      { name: 'Salário / Pró-labore', type: 'Entrada' },
      { name: 'Receita de Serviços', type: 'Entrada' },
      { name: 'Rendimentos de Investimentos', type: 'Entrada' }
    ];

    for (const c of defaultCats) {
      await client.query(
        `insert into public.categories (id, user_id, name, type, created_at)
         values (gen_random_uuid(), $1, $2, $3, now())`,
        [adminId, c.name, c.type]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Usuário Administrador de Staging criado com sucesso:');
    console.log(` - Email: ${adminEmail}`);
    console.log(` - Senha inicial: Admin@Gestor2026!`);
  } else {
    console.log(`ℹ️ Usuário ${adminEmail} já existe no banco.`);
  }

  // Verify Plans count
  const plansRes = await client.query('select tier, name from public.plans');
  console.log('Planos disponíveis:');
  plansRes.rows.forEach(p => console.log(` - ${p.tier}: ${p.name}`));

  client.release();
  await pool.end();
  console.log('--- Configuração de Autenticação Concluída ---');
}

seed().catch(err => {
  console.error('Erro no seed:', err);
  process.exit(1);
});
