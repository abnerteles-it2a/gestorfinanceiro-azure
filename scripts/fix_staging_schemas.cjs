const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Connecting to PostgreSQL staging...');
  await client.connect();

  const commands = [
    // 1. org_subscriptions columns
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS period_start timestamptz;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS period_end timestamptz;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS billing_period text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS requested_tier text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS asaas_payment_id text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS asaas_subscription_id text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS pending_payment_id text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS pending_billing_period text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS pending_requested_tier text;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS pending_period_start timestamptz;',
    'ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS pending_period_end timestamptz;',
    
    // Ensure org_id has unique constraint for ON CONFLICT
    'DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = \'org_subscriptions_org_id_key\') THEN ALTER TABLE public.org_subscriptions ADD CONSTRAINT org_subscriptions_org_id_key UNIQUE (org_id); END IF; END $$;',

    // 2. user_subscriptions columns
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS period_start timestamptz;',
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS period_end timestamptz;',
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS billing_period text;',
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS requested_tier text;',
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS asaas_payment_id text;',
    'ALTER TABLE public.user_subscriptions ADD COLUMN IF NOT EXISTS asaas_subscription_id text;',

    // 3. profiles columns
    'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;',
    'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS document text;',
    'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS business_profile text;',
    'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS asaas_customer_id text;',

    // 4. auth_users columns
    'ALTER TABLE public.auth_users ADD COLUMN IF NOT EXISTS verification_code text;',
    'ALTER TABLE public.auth_users ADD COLUMN IF NOT EXISTS reset_token text;',
    'ALTER TABLE public.auth_users ADD COLUMN IF NOT EXISTS reset_token_expires timestamptz;',
    'ALTER TABLE public.auth_users ADD COLUMN IF NOT EXISTS cpf_cnpj text;',

    // 5. organizations columns
    'ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS seats int DEFAULT 1;',
    'ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS plan_id uuid;',

    // 6. transactions columns
    'ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_business_revenue boolean DEFAULT false;',
    'ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_business_expense boolean DEFAULT false;',
    'ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS org_id uuid;',

    // 7. categories columns
    'ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS mei_category text;',
    'ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS org_id uuid;',

    // 8. accounts, investments, goals columns
    'ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS org_id uuid;',
    'ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS org_id uuid;',
    'ALTER TABLE public.fixed_income_investments ADD COLUMN IF NOT EXISTS org_id uuid;',
    'ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS org_id uuid;',
    'ALTER TABLE public.recurrences ADD COLUMN IF NOT EXISTS org_id uuid;',
    'ALTER TABLE public.cost_centers ADD COLUMN IF NOT EXISTS org_id uuid;'
  ];

  for (const sql of commands) {
    try {
      await client.query(sql);
      console.log('OK:', sql.substring(0, 60));
    } catch (err) {
      console.error('FAIL:', sql, err.message);
    }
  }

  console.log('All migrations applied successfully!');
  await client.end();
}

migrate().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
