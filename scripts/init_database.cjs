const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const sqls = [
  'create table if not exists public.accounts (id uuid primary key, user_id uuid not null, name text not null, bank text, initial_balance numeric(14,2) default 0, created_at timestamptz default now())',
  'create index if not exists idx_accounts_user on public.accounts(user_id)',
  'create index if not exists idx_accounts_user_name on public.accounts(user_id, name)',
  'create table if not exists public.categories (id uuid primary key, user_id uuid not null, name text not null, type text not null, icon text, mei_category text, org_id uuid, created_at timestamptz default now())',
  'create index if not exists idx_categories_user on public.categories(user_id)',
  'create index if not exists idx_categories_user_name on public.categories(user_id, name)',
  'create table if not exists public.transactions (id uuid primary key, user_id uuid not null, date date not null, account_id uuid not null, to_account_id uuid, transaction_type text not null, category text not null, description text, amount numeric(14,2) not null, payment_method text, cost_center_id uuid, is_business_revenue boolean not null default false, is_business_expense boolean not null default false, org_id uuid, created_at timestamptz default now())',
  'create index if not exists idx_transactions_user on public.transactions(user_id)',
  'create index if not exists idx_transactions_user_date on public.transactions(user_id, date desc, created_at desc)',
  'create table if not exists public.investments (id uuid primary key, user_id uuid not null, type text not null, ticker text, quantity numeric, purchase_price numeric, purchase_date date, created_at timestamptz default now())',
  'create index if not exists idx_investments_user on public.investments(user_id)',
  'create index if not exists idx_investments_user_created on public.investments(user_id, created_at desc)',
  'create table if not exists public.fixed_income_investments (id uuid primary key, user_id uuid not null, name text not null, issuer text, amount_invested numeric, yield_rate text, purchase_date date, maturity_date date, created_at timestamptz default now())',
  'create index if not exists idx_fii_user on public.fixed_income_investments(user_id)',
  'create index if not exists idx_fii_user_created on public.fixed_income_investments(user_id, created_at desc)',
  'create table if not exists public.goals (id uuid primary key, user_id uuid not null, name text not null, target_amount numeric, current_amount numeric, color text, created_at timestamptz default now())',
  'create index if not exists idx_goals_user on public.goals(user_id)',
  'create index if not exists idx_goals_user_created on public.goals(user_id, created_at desc)',
  'create table if not exists public.recurrences (id uuid primary key, user_id uuid not null, label text, amount numeric, category text, account_id uuid, payment_method text, day_of_month int, business_day_rule text, cost_center_id uuid, active boolean default true, created_at timestamptz default now())',
  'create index if not exists idx_recurrences_user on public.recurrences(user_id)',
  'create index if not exists idx_recurrences_user_created on public.recurrences(user_id, created_at desc)',
  'create table if not exists public.cost_centers (id uuid primary key, user_id uuid not null, name text not null, created_at timestamptz default now())',
  'create index if not exists idx_cost_centers_user on public.cost_centers(user_id)',
  'create index if not exists idx_cost_centers_user_name on public.cost_centers(user_id, name)',
  'create table if not exists public.auth_users (id uuid primary key, email text unique not null, password_hash text not null, is_admin boolean default false, created_at timestamptz default now())',
  'alter table public.auth_users add column if not exists cpf_cnpj text',
  'alter table public.auth_users add column if not exists is_admin boolean default false',
  'alter table public.auth_users add column if not exists email_verified boolean default false',
  'alter table public.auth_users add column if not exists verification_code text',
  'alter table public.auth_users add column if not exists reset_token text',
  'alter table public.auth_users add column if not exists reset_token_expires timestamptz',
  'create table if not exists public.auth_sessions (id uuid default gen_random_uuid() primary key, user_id uuid not null, jti text not null, created_at timestamptz default now(), updated_at timestamptz default now(), last_seen timestamptz default now())',
  'create index if not exists idx_auth_sessions_user_jti on public.auth_sessions(user_id, jti)',
  'create table if not exists public.profiles (user_id uuid primary key, org_id uuid, plan_id uuid, is_admin boolean default false, created_at timestamptz default now())',
  'create table if not exists public.cost_center_permissions (id uuid primary key default gen_random_uuid(), org_id uuid not null, user_id uuid not null, cost_center_id uuid not null, role text not null check (role in (\'viewer\', \'editor\', \'manager\')), created_at timestamptz default now(), unique (user_id, cost_center_id))',
  'create table if not exists public.payables (id uuid primary key, user_id uuid not null, org_id uuid, title text not null, amount numeric(14,2) not null, due_date date not null, status text not null default \'open\', category text, account_id uuid, cost_center_id uuid, notes text, created_at timestamptz default now())',
  'create index if not exists idx_payables_user on public.payables(user_id)',
  'create index if not exists idx_payables_due on public.payables(due_date)',
  'create table if not exists public.receivables (id uuid primary key, user_id uuid not null, org_id uuid, title text not null, amount numeric(14,2) not null, due_date date not null, status text not null default \'open\', category text, account_id uuid, cost_center_id uuid, notes text, created_at timestamptz default now())',
  'create index if not exists idx_receivables_user on public.receivables(user_id)',
  'create index if not exists idx_receivables_due on public.receivables(due_date)',
  'create table if not exists public.fiscal_documents (id uuid primary key, user_id uuid not null, org_id uuid, pathname text not null, url text not null, content_type text, size integer, checksum text, doc_type text, issue_date date, supplier text, amount numeric(14,2), notes text, created_at timestamptz default now(), is_folder boolean default false, parent_id uuid, name text, permissions jsonb default \'{}\', cost_center_id uuid)',
  'create table if not exists public.organizations (id uuid primary key, name text not null, seats int default 5, plan_id uuid, created_at timestamptz default now())',
  'create table if not exists public.org_members (id uuid primary key default gen_random_uuid(), org_id uuid not null, user_id uuid not null, role text not null default \'member\', created_at timestamptz default now(), unique(org_id, user_id))',
  'create table if not exists public.org_invites (id uuid primary key default gen_random_uuid(), org_id uuid not null, email text not null, role text not null, code text unique not null, expires_at timestamptz not null, created_at timestamptz default now())',
  'create table if not exists public.plans (id uuid primary key, name text not null, tier text not null, created_at timestamptz default now())',
  'create table if not exists public.user_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, provider text, status text, plan_id uuid, current_period_end timestamptz, created_at timestamptz default now())',
  'create table if not exists public.org_subscriptions (id uuid primary key default gen_random_uuid(), org_id uuid not null, provider text, status text, plan_id uuid, current_period_end timestamptz, created_at timestamptz default now())',
  'alter table public.transactions add column if not exists is_business_revenue boolean not null default false',
  'alter table public.transactions add column if not exists is_business_expense boolean not null default false',
  'alter table public.transactions add column if not exists org_id uuid',
  'alter table public.categories add column if not exists mei_category text',
  'alter table public.categories add column if not exists org_id uuid',
  'alter table public.profiles add column if not exists preferences jsonb default \'{}\'',
  'alter table public.profiles add column if not exists business_profile text default \'pf\'',
  `create table if not exists public.mei_tax_obligations (id uuid primary key default gen_random_uuid(), user_id uuid not null, org_id uuid, obligation_type text not null default 'das_mei', reference_year integer not null, reference_month integer not null, due_date date not null, principal_amount numeric(14,2) not null default 0, interest_amount numeric(14,2) not null default 0, penalty_amount numeric(14,2) not null default 0, total_amount numeric(14,2) not null default 0, status text not null default 'pending', payment_date date, transaction_id uuid, document_id uuid, source text not null default 'manual', rules_version text not null default 'phase2-estimate-v1', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now())`,
  'create unique index if not exists mei_tax_obligations_personal_unique on public.mei_tax_obligations (user_id, reference_year, reference_month, obligation_type) where org_id is null',
  'create unique index if not exists mei_tax_obligations_org_unique on public.mei_tax_obligations (org_id, reference_year, reference_month, obligation_type) where org_id is not null'
];

async function main() {
  console.log('--- Conectando ao Azure PostgreSQL gestorfinanceiro_staging ---');
  const client = await pool.connect();
  console.log('Conexão estabelecida com sucesso!');

  console.log(`Aplicando ${sqls.length} instruções DDL de inicialização...`);
  let successCount = 0;
  for (const s of sqls) {
    try {
      await client.query(s);
      successCount++;
    } catch (err) {
      console.warn('Erro ao executar DDL (ignorado se já existente):', err.message);
    }
  }
  console.log(`Sucesso: ${successCount} DDLs processadas.`);

  // Listar tabelas criadas no schema public
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);
  console.log('Tabelas verificadas no banco:');
  res.rows.forEach(r => console.log(` - ${r.table_name}`));

  client.release();
  await pool.end();
  console.log('--- Inicialização concluída com sucesso! ---');
}

main().catch(err => {
  console.error('Falha na inicialização do banco:', err);
  process.exit(1);
});
