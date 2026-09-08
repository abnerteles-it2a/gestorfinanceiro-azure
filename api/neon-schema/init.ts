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
    // Ensure UTF-8 encoding for all connections
    pool.on('connect', (client) => {
      client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
    });
  }
  return pool;
};

const sqls: string[] = [
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
  'create table if not exists public.profiles (user_id uuid primary key, org_id uuid, plan_id uuid, is_admin boolean default false, created_at timestamptz default now())',
  'create table if not exists public.cost_center_permissions (id uuid primary key default gen_random_uuid(), org_id uuid not null, user_id uuid not null, cost_center_id uuid not null, role text not null check (role in (\'viewer\', \'editor\', \'manager\')), created_at timestamptz default now(), unique (user_id, cost_center_id))',
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

export default async function handler(req: any, res: any) {
  try {
    for (const s of sqls) {
      try { await getPool().query(s); } catch {}
    }
    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ ok: true }));
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
