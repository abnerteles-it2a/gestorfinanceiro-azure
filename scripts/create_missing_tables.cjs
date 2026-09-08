const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://aiopsadmin:P%40ssw0rdAIOps2026%21Secure@psql-aiops-prod-brsouth.postgres.database.azure.com:5432/gestorfinanceiro_staging?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log('Connected to PostgreSQL staging.');

  const ddl = [
    // 1. usage_tx_ledger (CRITICAL for bootstrap and transaction quota enforcement)
    `CREATE TABLE IF NOT EXISTS public.usage_tx_ledger (
      id uuid primary key default gen_random_uuid(),
      scope_type text not null,
      scope_id uuid not null,
      yyyymm text not null,
      tx_id uuid not null,
      created_at timestamptz default now(),
      constraint usage_tx_ledger_uniq unique (scope_type, scope_id, tx_id)
    );`,
    `CREATE INDEX IF NOT EXISTS idx_usage_tx_ledger_scope ON public.usage_tx_ledger(scope_type, scope_id, yyyymm);`,

    // 2. support_tickets
    `CREATE TABLE IF NOT EXISTS public.support_tickets (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      subject text not null,
      category text default 'other',
      status text default 'open',
      created_at timestamptz default now()
    );`,

    // 3. ticket_messages
    `CREATE TABLE IF NOT EXISTS public.ticket_messages (
      id uuid primary key default gen_random_uuid(),
      ticket_id uuid not null,
      user_id uuid not null,
      message text not null,
      is_admin_reply boolean default false,
      created_at timestamptz default now()
    );`,

    // 4. feature_requests
    `CREATE TABLE IF NOT EXISTS public.feature_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null,
      title text not null,
      description text,
      status text default 'open',
      created_at timestamptz default now()
    );`,

    // 5. feature_upvotes
    `CREATE TABLE IF NOT EXISTS public.feature_upvotes (
      id uuid primary key default gen_random_uuid(),
      request_id uuid not null,
      user_id uuid not null,
      created_at timestamptz default now(),
      constraint feature_upvotes_uniq unique (request_id, user_id)
    );`
  ];

  for (const sql of ddl) {
    try {
      await client.query(sql);
      console.log('APPLIED DDL:', sql.slice(0, 50).trim());
    } catch (e) {
      console.error('ERROR DDL:', e.message);
    }
  }

  console.log('All auxiliary and usage tables created successfully!');
  await client.end();
}

run().catch(console.error);
