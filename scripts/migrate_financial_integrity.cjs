const { execFileSync } = require('node:child_process');
const { Client } = require('pg');

async function main() {
  const apply = process.argv.includes('--apply');
  // Obtain the configured connection in memory; never print it or its password.
  const az = process.platform === 'win32' ? 'az.cmd' : 'az';
  const raw = execFileSync(az, ['containerapp', 'show', '-g', 'rg-aiops-prod', '-n', 'ca-gestor-staging', '--query', 'properties.template.containers[0].env', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  const env = JSON.parse(raw);
  const connectionString = env.find(item => item.name === 'NEON_DATABASE_URL')?.value || env.find(item => item.name === 'DATABASE_URL')?.value;
  if (!connectionString) throw new Error('Connection must be available through the authenticated Azure configuration. Secret references require a separate secure connection.');
  const target = new URL(connectionString);
  if (target.hostname !== 'psql-aiops-prod-brsouth.postgres.database.azure.com' || target.pathname !== '/gestorfinanceiro_staging') throw new Error('Target guard rejected the configured database.');
  console.log(JSON.stringify({ host: target.hostname, database: target.pathname.slice(1), apply }));
  const client = new Client({ connectionString: connectionString.replace(/([?&])sslmode=[^&]+&?/, '$1').replace(/[?&]$/, ''), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const tables = ['payables', 'receivables', 'auth_sessions', 'usage_tx_ledger', 'fiscal_documents'];
    const found = (await client.query('select table_name from information_schema.tables where table_schema=$1 and table_name=any($2::text[])', ['public', tables])).rows.map(row => row.table_name);
    const missing = tables.filter(table => !found.includes(table));
    console.log(JSON.stringify({ prerequisites: found, missing }));
    if (missing.length) throw new Error('Required existing tables are missing; refusing migration.');
    if (apply) {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SET LOCAL statement_timeout='60s'");
      await client.query("CREATE TABLE IF NOT EXISTS public.investment_operations (scope_type text NOT NULL CHECK (scope_type IN ('personal','org')), scope_id uuid NOT NULL, operation_id uuid NOT NULL, user_id uuid NOT NULL, request_payload jsonb NOT NULL, result_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (scope_type,scope_id,operation_id))");
      await client.query("CREATE TABLE IF NOT EXISTS public.obligation_settlements (operation_id uuid PRIMARY KEY, obligation_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('payable','receivable')), principal_amount numeric(14,2) NOT NULL, cash_amount numeric(14,2) NOT NULL, account_id uuid NOT NULL, transaction_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now())");
      for (const [table, amountColumn] of [['payables', 'paid_amount'], ['receivables', 'received_amount']]) {
        await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${amountColumn} numeric(14,2) DEFAULT 0`);
        await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS transaction_id uuid`);
        await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`);
      }
    }
    const columns = (await client.query("select table_name,column_name,data_type from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position", [['investment_operations', 'obligation_settlements']])).rows;
    const constraints = (await client.query("select c.relname as table_name, con.contype as type, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[])", [['investment_operations', 'obligation_settlements']])).rows;
    if (apply) {
      const required = { investment_operations: ['scope_type', 'scope_id', 'operation_id', 'user_id', 'request_payload', 'result_payload', 'created_at'], obligation_settlements: ['operation_id', 'obligation_id', 'kind', 'principal_amount', 'cash_amount', 'account_id', 'transaction_id', 'created_at'] };
      for (const [table, names] of Object.entries(required)) {
        if (names.some(name => !columns.some(column => column.table_name === table && column.column_name === name))) throw new Error('Journal columns are incompatible.');
        if (!constraints.some(item => item.table_name === table && item.type === 'p')) throw new Error('Journal primary key missing.');
      }
      if (!constraints.some(item => item.table_name === 'investment_operations' && item.type === 'p' && item.definition.includes('(scope_type, scope_id, operation_id)'))) throw new Error('Investment journal key incompatible.');
      if (!constraints.some(item => item.table_name === 'obligation_settlements' && item.type === 'u' && item.definition.includes('(transaction_id)'))) throw new Error('Settlement transaction uniqueness missing.');
      await client.query('COMMIT');
    }
    console.log(JSON.stringify({ columns, constraints, status: apply ? 'migration committed and verified' : 'read-only inspection complete' }, null, 2));
  } catch (error) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}
main().catch(error => {
  console.error('Migration failed:', error.code || error.message?.replace(/postgres(?:ql)?:\/\/\S+/g, '<REDACTED>'));
  process.exitCode = 1;
});
