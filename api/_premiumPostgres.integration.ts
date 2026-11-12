// Explicit local integration runner (excluded by npm test's *.test.ts glob).
// Run: node --import tsx api\_premiumPostgres.integration.ts
// Owns only gf-review-pg-9d4d; existing containers with that name are never removed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { createObligation } from './_obligationCreation';
import { settleObligation, type FinancialDatabase } from './_financial';
import { disposeInvestment } from './_investmentOperation';
import { applyBillingEvent, assertBillingSchema, registerBillingPayment, type BillingPayment } from './_billing';

const container = 'gf-review-pg-9d4d';
const database = 'gf_review_isolated';
const docker = (...args: string[]) => execFileSync('docker', ['--context', 'desktop-linux', ...args], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const cases: { name: string; passed: boolean; durationMs: number; error?: string }[] = [];
const lockEvidence: { label: string; waitingConnections: number; waits: string[] }[] = [];
let pool: pg.Pool;
let ownedId: string | undefined;
let version = '';
let cleanup = false;
const startedAt = new Date().toISOString();
const userId = randomUUID();
const scope = { userId, orgId: null as string | null };
const accountId = randomUUID();
const q = (sql: string, params: any[] = []) => pool.query(sql, params);
const count = async (table: string) => Number((await q(`SELECT count(*) AS n FROM public.${table}`)).rows[0].n);
const quota = async (id: string, date: string, client: FinancialDatabase) => { await client.query('INSERT INTO public.test_quota(id,date) VALUES($1,$2)', [id, date]); };
const request = (extra: Record<string, unknown> = {}) => ({ operationId: randomUUID(), title: 'Synthetic invoice', amount: 100, dueDate: '2026-11-20', issueDate: '2026-11-01', ...extra });
const failpoint = (table: string, enabled: boolean) => enabled
  ? q('INSERT INTO public.test_failpoints(name) VALUES($1)', [table])
  : q('DELETE FROM public.test_failpoints WHERE name=$1', [table]);
const snapshot = async (...tables: string[]) => {
  const result: Record<string, unknown> = {};
  for (const table of tables) result[table] = (await q(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows;
  return result;
};
async function check(name: string, work: () => Promise<void>) {
  const start = Date.now();
  try { await work(); cases.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? error.stack || error.message : String(error); cases.push({ name, passed: false, durationMs: Date.now() - start, error: detail }); console.error(`FAIL ${name}\n${detail}`); }
}

// Force actual PostgreSQL lock contention, rather than merely launching promises together.
async function contend<T>(label: string, lockSql: string, params: any[], work: (() => Promise<T>)[]) {
  const blocker = await pool.connect();
  const pending: Promise<T>[] = [];
  try {
    await blocker.query('BEGIN');
    await blocker.query(lockSql, params);
    for (const task of work) {
      const promise = task();
      void promise.catch(() => {});
      pending.push(promise);
    }
    let waits: string[] = [];
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      waits = (await q("SELECT wait_event FROM pg_stat_activity WHERE application_name='gf-review-pg-9d4d' AND wait_event_type='Lock' AND pid<>pg_backend_pid()" )).rows.map(row => row.wait_event);
      if (waits.length >= work.length) break;
      await delay(25);
    }
    lockEvidence.push({ label, waitingConnections: waits.length, waits });
    assert.ok(waits.length >= work.length, `${label}: expected ${work.length} real waiting connections, observed ${waits.length}`);
  } finally { await blocker.query('ROLLBACK'); blocker.release(); }
  return Promise.allSettled(pending);
}
const advisory = 'SELECT pg_advisory_xact_lock(hashtextextended($1,0))';
function successful<T>(results: PromiseSettledResult<T>[]) {
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  return results.map(result => (result as PromiseFulfilledResult<T>).value);
}

const ddl = `
CREATE TABLE public.accounts(id uuid PRIMARY KEY,user_id uuid NOT NULL,org_id uuid);
CREATE TABLE public.cost_centers(id uuid PRIMARY KEY,user_id uuid NOT NULL,org_id uuid);
CREATE TABLE public.payables(id uuid PRIMARY KEY,user_id uuid NOT NULL,org_id uuid,title text NOT NULL,amount numeric(14,2) NOT NULL,due_date date NOT NULL,status text NOT NULL DEFAULT 'open',category text,account_id uuid,cost_center_id uuid,notes text,created_at timestamptz DEFAULT now(),paid_amount numeric(14,2) DEFAULT 0,transaction_id uuid,updated_at timestamptz DEFAULT now());
CREATE TABLE public.receivables(LIKE public.payables INCLUDING ALL);
ALTER TABLE public.receivables RENAME COLUMN paid_amount TO received_amount;
CREATE TABLE public.transactions(id uuid PRIMARY KEY,user_id uuid NOT NULL,date date NOT NULL,account_id uuid NOT NULL,to_account_id uuid,transaction_type text NOT NULL,category text NOT NULL,description text,amount numeric(14,2) NOT NULL,payment_method text,cost_center_id uuid,org_id uuid,is_business_revenue boolean NOT NULL DEFAULT false,is_business_expense boolean NOT NULL DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE public.obligation_settlements(operation_id uuid PRIMARY KEY,obligation_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('payable','receivable')),principal_amount numeric(14,2) NOT NULL,cash_amount numeric(14,2) NOT NULL,account_id uuid NOT NULL,transaction_id uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.investments(id uuid PRIMARY KEY,user_id uuid NOT NULL,org_id uuid,type text NOT NULL,ticker text,quantity numeric,purchase_price numeric,purchase_date date,created_at timestamptz DEFAULT now());
CREATE TABLE public.fixed_income_investments(id uuid PRIMARY KEY,user_id uuid NOT NULL,org_id uuid,name text NOT NULL,amount_invested numeric,purchase_date date);
CREATE TABLE public.investment_operations(scope_type text NOT NULL CHECK(scope_type IN ('personal','org')),scope_id uuid NOT NULL,operation_id uuid NOT NULL,user_id uuid NOT NULL,request_payload jsonb NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(scope_type,scope_id,operation_id));
CREATE TABLE public.user_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,provider text,status text,plan_id uuid,current_period_end timestamptz,period_start timestamptz,period_end timestamptz);
CREATE TABLE public.org_subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,provider text,status text,plan_id uuid,current_period_end timestamptz,period_start timestamptz,period_end timestamptz);
CREATE TABLE public.plans(id uuid PRIMARY KEY,name text,tier text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,plan_id uuid,org_id uuid);
CREATE TABLE public.organizations(id uuid PRIMARY KEY,plan_id uuid,seats integer);
CREATE TABLE public.test_quota(id uuid PRIMARY KEY,date date NOT NULL);
CREATE TABLE public.test_failpoints(name text PRIMARY KEY);
CREATE TABLE public.test_grants(scope_id uuid NOT NULL,period_end timestamptz NOT NULL);
CREATE FUNCTION public.test_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.test_failpoints WHERE name=TG_TABLE_NAME) THEN RAISE EXCEPTION 'synthetic_journal_failure:%',TG_TABLE_NAME; END IF;
 RETURN NEW; END $$;
CREATE FUNCTION public.test_grant_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.status='active' AND NEW.period_end IS DISTINCT FROM OLD.period_end THEN
 INSERT INTO public.test_grants(scope_id,period_end) VALUES (COALESCE(to_jsonb(NEW)->>'user_id',to_jsonb(NEW)->>'org_id')::uuid,NEW.period_end); END IF;
 RETURN NEW; END $$;
CREATE TRIGGER test_grant AFTER UPDATE ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION public.test_grant_audit();
CREATE TRIGGER test_grant AFTER UPDATE ON public.org_subscriptions FOR EACH ROW EXECUTE FUNCTION public.test_grant_audit();
`;

async function run() {
  // No DATABASE_URL, .env loading, provider calls, pulls, mounts, or named volumes.
  const existing = docker('ps', '-aq', '--filter', `name=^/${container}$`);
  assert.equal(existing, '', 'Refusing to touch an existing container with the reserved name');
  ownedId = docker('run', '--detach', '--pull', 'never', '--name', container, '--label', 'gf.integration.owner=9d4d', '--network', 'bridge', '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=256m', '--memory', '512m', '--cpus', '1', '--env', 'POSTGRES_USER=gf_synthetic', '--env', 'POSTGRES_PASSWORD=isolated-synthetic-only', '--env', `POSTGRES_DB=${database}`, 'postgres:16-alpine', '-c', 'listen_addresses=*');
  const binding = docker('port', ownedId, '5432/tcp');
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  pool = new pg.Pool({ host: '127.0.0.1', port: Number(binding.split(':')[1]), database, user: 'gf_synthetic', password: 'isolated-synthetic-only', ssl: false, max: 12, application_name: container, connectionTimeoutMillis: 2000, idleTimeoutMillis: 1000, statement_timeout: 10000, lock_timeout: 8000, idle_in_transaction_session_timeout: 15000 });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { await q('SELECT 1'); ready = true; break; } catch { await delay(250); }
  }
  assert.ok(ready, 'PostgreSQL did not become ready within bounded retries');
  version = (await q('SELECT version() AS version')).rows[0].version;
  console.log(version);
  await q(ddl);
  const migration = readFileSync(new URL('../scripts/migrate_premium_integrity.sql', import.meta.url), 'utf8');
  await check('migration applies twice and billing schema preflight succeeds', async () => {
    await q(migration); await q(migration); await assertBillingSchema(pool);
    assert.equal((await q("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('payables','receivables') AND column_name IN ('is_business_revenue','is_business_expense','issue_date')")).rows[0].n, 6);
  });
  for (const table of ['obligation_creation_operations', 'obligation_settlements', 'investment_operations', 'billing_payments']) {
    await q(`CREATE TRIGGER test_failure BEFORE INSERT OR UPDATE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.test_journal_failure()`);
  }
  await q('INSERT INTO public.accounts(id,user_id) VALUES($1,$2)', [accountId, userId]);
  for (const kind of ['payable', 'receivable'] as const) {
    const table = kind === 'payable' ? 'payables' : 'receivables';
    const amountField = kind === 'payable' ? 'paidAmount' : 'receivedAmount';
    const amountColumn = kind === 'payable' ? 'paid_amount' : 'received_amount';
    await check(`${kind}: concurrent UUID creates one obligation and one transactional quota`, async () => {
      const data = request({ isBusinessRevenue: true, isBusinessExpense: true });
      const before = await count(table), quotas = await count('test_quota');
      const results = successful(await contend(`create ${kind}`, advisory, [`obligation:personal:${userId}:${data.operationId}`], Array.from({ length: 3 }, () => () => createObligation(pool, scope, kind, data, quota))));
      assert.equal(results.filter(r => !r.replayed).length, 1);
      assert.equal(new Set(results.map(r => r.rows[0].id)).size, 1);
      assert.equal(await count(table), before + 1); assert.equal(await count('test_quota'), quotas + 1);
      await assert.rejects(createObligation(pool, scope, kind, { ...data, amount: 101 }, quota), /obligation_operation_conflict/);
      assert.equal(await count(table), before + 1);
    });
    await check(`${kind}: failed creation journal rolls back obligation and quota; retry succeeds`, async () => {
      const data = request(); const before = await snapshot(table, 'test_quota', 'obligation_creation_operations');
      await failpoint('obligation_creation_operations', true);
      try { await assert.rejects(createObligation(pool, scope, kind, data, quota), /synthetic_journal_failure/); }
      finally { await failpoint('obligation_creation_operations', false); }
      assert.deepEqual(await snapshot(table, 'test_quota', 'obligation_creation_operations'), before);
      assert.equal((await createObligation(pool, scope, kind, data, quota)).replayed, false);
    });
    for (const business of [true, false]) await check(`${kind}: partial 40/100 preserves residual and explicit MEI flag=${business}; replay is inert`, async () => {
      const row = (await createObligation(pool, scope, kind, request({ isBusinessRevenue: business, isBusinessExpense: business }))).rows[0];
      const data = { id: row.id, operationId: randomUUID(), accountId, [amountField]: 40 };
      const result = await settleObligation(pool, scope, kind, data, quota);
      assert.equal(result.rows[0].remaining_amount, 60); assert.equal(result.rows[0].status, 'open');
      assert.equal(Number(result.rows[0][amountColumn]), 40); assert.equal(Number(result.tx.amount), 40);
      assert.equal(result.tx.is_business_revenue, kind === 'receivable' && business);
      assert.equal(result.tx.is_business_expense, kind === 'payable' && business);
      const before = await snapshot(table, 'transactions', 'obligation_settlements', 'test_quota');
      assert.equal((await settleObligation(pool, scope, kind, data, quota)).replayed, true);
      await assert.rejects(settleObligation(pool, scope, kind, { ...data, [amountField]: 41 }, quota), /settlement_operation_conflict/);
      assert.deepEqual(await snapshot(table, 'transactions', 'obligation_settlements', 'test_quota'), before);
    });
    await check(`${kind}: two locked concurrent 70/100 settlements cannot overpay`, async () => {
      const row = (await createObligation(pool, scope, kind, request())).rows[0];
      const before = await count('transactions');
      const results = await contend(`settle ${kind}`, `SELECT id FROM public.${table} WHERE id=$1 FOR UPDATE`, [row.id], Array.from({ length: 2 }, () => () => settleObligation(pool, scope, kind, { id: row.id, operationId: randomUUID(), accountId, [amountField]: 70 }, quota)));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      assert.match(rejected.reason.message, /invalid_settlement_amount/);
      assert.equal(Number((await q(`SELECT ${amountColumn} AS amount FROM public.${table} WHERE id=$1`, [row.id])).rows[0].amount), 70);
      assert.equal(await count('transactions'), before + 1);
    });
    await check(`${kind}: settlement journal failure rolls back cash, principal and quota`, async () => {
      const row = (await createObligation(pool, scope, kind, request())).rows[0];
      const before = await snapshot(table, 'transactions', 'obligation_settlements', 'test_quota');
      const data = { id: row.id, operationId: randomUUID(), accountId, [amountField]: 40 };
      await failpoint('obligation_settlements', true);
      try { await assert.rejects(settleObligation(pool, scope, kind, data, quota), /synthetic_journal_failure/); }
      finally { await failpoint('obligation_settlements', false); }
      assert.deepEqual(await snapshot(table, 'transactions', 'obligation_settlements', 'test_quota'), before);
      assert.equal((await settleObligation(pool, scope, kind, data, quota)).replayed, false);
    });
  }
  const lot = async (ticker: string, quantity: number, date: string) => {
    const id = randomUUID(); await q('INSERT INTO public.investments(id,user_id,type,ticker,quantity,purchase_date) VALUES($1,$2,$3,$4,$5,$6)', [id, userId, 'Ação', ticker, quantity, date]); return id;
  };
  const cash = { amount: 150, accountId, category: 'Synthetic disposal' };
  await check('FIFO concurrent identical disposal deletes oldest lot, reduces second, cash/quota once and replay survives deleted target', async () => {
    const first = await lot('SYNTH1', 5, '2026-01-01'), second = await lot('SYNTH1', 10, '2026-02-01');
    const data = { operationId: randomUUID(), kind: 'variable' as const, assetId: first, quantity: 8, date: '2026-11-12', cash };
    const txs = await count('transactions'), quotas = await count('test_quota');
    const results = successful(await contend('investment same operation', advisory, [`investment:personal:${userId}`], Array.from({ length: 3 }, () => () => disposeInvestment(pool, scope, data, quota))));
    assert.equal(results.filter(r => !r.replayed).length, 1);
    assert.deepEqual(results[0].removedIds, [first]);
    assert.equal((await q('SELECT id FROM public.investments WHERE id=$1', [first])).rowCount, 0);
    assert.equal(Number((await q('SELECT quantity FROM public.investments WHERE id=$1', [second])).rows[0].quantity), 7);
    assert.equal(await count('transactions'), txs + 1); assert.equal(await count('test_quota'), quotas + 1);
    assert.equal((await disposeInvestment(pool, scope, data, quota)).replayed, true);
    await assert.rejects(disposeInvestment(pool, scope, { ...data, quantity: 9 }, quota), /investment_operation_conflict/);
  });
  await check('FIFO journal failure rolls back removed/updated lots, cash, quota; retry succeeds', async () => {
    await lot('SYNTH2', 5, '2026-01-01'); await lot('SYNTH2', 10, '2026-02-01');
    const data = { operationId: randomUUID(), kind: 'variable' as const, ticker: 'SYNTH2', assetType: 'Ação', quantity: 8, date: '2026-11-12', cash };
    const tables = ['investments', 'transactions', 'test_quota', 'investment_operations']; const before = await snapshot(...tables);
    await failpoint('investment_operations', true);
    try { await assert.rejects(disposeInvestment(pool, scope, data, quota), /synthetic_journal_failure/); }
    finally { await failpoint('investment_operations', false); }
    assert.deepEqual(await snapshot(...tables), before);
    assert.equal((await disposeInvestment(pool, scope, data, quota)).replayed, false);
  });
  await check('FIFO forbidden cash account rolls back reductions before cash insert', async () => {
    await lot('SYNTH3', 5, '2026-01-01');
    const before = await snapshot('investments', 'transactions', 'investment_operations');
    await assert.rejects(disposeInvestment(pool, scope, { operationId: randomUUID(), kind: 'variable', ticker: 'SYNTH3', assetType: 'Ação', quantity: 5, date: '2026-11-12', cash: { ...cash, accountId: randomUUID() } }), /permission_denied_account/);
    assert.deepEqual(await snapshot('investments', 'transactions', 'investment_operations'), before);
  });
  await check('FIFO concurrent distinct disposals cannot oversell', async () => {
    await lot('SYNTH4', 10, '2026-01-01');
    const results = await contend('investment oversell', advisory, [`investment:personal:${userId}`], Array.from({ length: 2 }, () => () => disposeInvestment(pool, scope, { operationId: randomUUID(), kind: 'variable', ticker: 'SYNTH4', assetType: 'Ação', quantity: 7, date: '2026-11-12' })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.match((results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason.message, /investment_insufficient_quantity/);
    assert.equal(Number((await q("SELECT sum(quantity) AS n FROM public.investments WHERE ticker='SYNTH4'")).rows[0].n), 3);
  });
  await check('fixed redemption is atomic and full-deletion replay is idempotent', async () => {
    const assetId = randomUUID(); await q('INSERT INTO public.fixed_income_investments(id,user_id,name,amount_invested) VALUES($1,$2,$3,1000)', [assetId, userId, 'Synthetic CDB']);
    const partial = { operationId: randomUUID(), kind: 'fixed' as const, assetId, principalAmount: 250, date: '2026-11-12', cash };
    assert.equal(Number((await disposeInvestment(pool, scope, partial, quota)).updated[0].amount_invested), 750);
    const full = { ...partial, operationId: randomUUID(), principalAmount: 750 };
    assert.deepEqual((await disposeInvestment(pool, scope, full, quota)).removedIds, [assetId]);
    assert.equal((await disposeInvestment(pool, scope, full, quota)).replayed, true);
  });

  for (const org of [false, true]) {
    const label = org ? 'organization' : 'personal';
    const billingUser = randomUUID(), orgId = org ? randomUUID() : null;
    await q('INSERT INTO public.profiles(user_id) VALUES($1)', [billingUser]);
    if (orgId) await q('INSERT INTO public.organizations(id) VALUES($1)', [orgId]);
    const table = org ? 'org_subscriptions' : 'user_subscriptions', column = org ? 'org_id' : 'user_id', id = orgId || billingUser;
    const initialEnd = new Date('2030-01-15T12:00:00.000Z');
    await q(`INSERT INTO public.${table}(${column},status,asaas_payment_id,billing_period,requested_tier,period_end) VALUES($1,'active',$2,'monthly','starter',$3)`, [id, `legacy-${id}`, initialEnd]);
    const p: BillingPayment = { paymentId: `synthetic-${randomUUID()}`, userId: billingUser, orgId, tier: 'starter', billingPeriod: 'monthly' };
    await check(`${label} billing: repeated concurrent callbacks grant exactly one month and journal once`, async () => {
      await registerBillingPayment(pool, p, initialEnd);
      successful(await contend(`billing ${label}`, advisory, [`billing:user:${billingUser}`], ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].map(event => () => applyBillingEvent(pool, p, event))));
      const row = (await q(`SELECT * FROM public.${table} WHERE ${column}=$1`, [id])).rows[0];
      assert.equal(row.period_end.toISOString(), '2030-02-15T12:00:00.000Z'); assert.equal(row.status, 'active');
      assert.equal(Number((await q('SELECT count(*) AS n FROM public.test_grants WHERE scope_id=$1', [id])).rows[0].n), 1);
      assert.equal((await q('SELECT state FROM public.billing_payments WHERE payment_id=$1', [p.paymentId])).rows[0].state, 'applied');
      const before = await snapshot(table, 'billing_payments', 'profiles', 'organizations', 'test_grants');
      for (const event of ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED']) await applyBillingEvent(pool, p, event);
      assert.deepEqual(await snapshot(table, 'billing_payments', 'profiles', 'organizations', 'test_grants'), before);
    });
    await check(`${label} billing: failure at applied journal rolls back entitlement/plan/audit and retry succeeds`, async () => {
      const renewal = { ...p, paymentId: `synthetic-${randomUUID()}`, tier: 'pro' };
      await registerBillingPayment(pool, renewal, initialEnd);
      const tables = [table, 'billing_payments', 'profiles', 'organizations', 'plans', 'test_grants']; const before = await snapshot(...tables);
      await failpoint('billing_payments', true);
      try { await assert.rejects(applyBillingEvent(pool, renewal, 'PAYMENT_CONFIRMED'), /synthetic_journal_failure/); }
      finally { await failpoint('billing_payments', false); }
      assert.deepEqual(await snapshot(...tables), before);
      await applyBillingEvent(pool, renewal, 'PAYMENT_RECEIVED');
      assert.equal((await q('SELECT state FROM public.billing_payments WHERE payment_id=$1', [renewal.paymentId])).rows[0].state, 'applied');
    });
    await check(`${label} billing: older payment cannot supersede newer applied renewal; mismatched reference rejected`, async () => {
      const old = { ...p, paymentId: `synthetic-${randomUUID()}`, tier: 'plus' };
      const newer = { ...old, paymentId: `synthetic-${randomUUID()}`, tier: 'pro' };
      await registerBillingPayment(pool, old, initialEnd); await registerBillingPayment(pool, newer, initialEnd);
      await applyBillingEvent(pool, newer, 'PAYMENT_CONFIRMED');
      const before = await snapshot(table, 'profiles', 'organizations', 'test_grants');
      await applyBillingEvent(pool, old, 'PAYMENT_RECEIVED');
      assert.deepEqual(await snapshot(table, 'profiles', 'organizations', 'test_grants'), before);
      assert.equal((await q('SELECT state FROM public.billing_payments WHERE payment_id=$1', [old.paymentId])).rows[0].state, 'superseded');
      await assert.rejects(applyBillingEvent(pool, { ...newer, tier: 'starter' }, 'PAYMENT_RECEIVED'), /does not match/);
    });
  }
  await check('migration rerun preserves populated journals and obligations; pool remains usable', async () => {
    const tables = ['payables', 'receivables', 'obligation_creation_operations', 'billing_payments', 'user_subscriptions', 'org_subscriptions'];
    const before = await snapshot(...tables); await q(migration); await assertBillingSchema(pool);
    assert.deepEqual(await snapshot(...tables), before); assert.equal((await q('SELECT 42 AS n')).rows[0].n, 42);
  });
  await check('all application transactions ended; no leaked advisory locks', async () => {
    assert.equal(Number((await q("SELECT count(*) AS n FROM pg_stat_activity WHERE application_name=$1 AND state='idle in transaction'", [container])).rows[0].n), 0);
    assert.equal(Number((await q("SELECT count(*) AS n FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name=$1 AND l.locktype='advisory'", [container])).rows[0].n), 0);
  });
}

try { await run(); }
catch (error) { cases.push({ name: 'runner setup/execution', passed: false, durationMs: 0, error: error instanceof Error ? error.stack : String(error) }); console.error(error); }
finally {
  try { if (pool!) await pool.end(); }
  finally {
    if (ownedId) {
      try {
        assert.equal(docker('inspect', '--format', '{{index .Config.Labels "gf.integration.owner"}}', ownedId), '9d4d');
        docker('rm', '--force', '--volumes', ownedId);
        assert.equal(docker('ps', '-aq', '--filter', `id=${ownedId}`), '');
        cleanup = true;
      } catch (error) { cases.push({ name: 'owned container cleanup', passed: false, durationMs: 0, error: String(error) }); }
    }
    const report = { startedAt, finishedAt: new Date().toISOString(), version, image: 'postgres:16-alpine', container, isolation: 'loopback ephemeral port; tmpfs; synthetic data; no provider or remote database', passed: cases.filter(c => c.passed).length, failed: cases.filter(c => !c.passed).length, cleanup, lockEvidence, cases, limitations: ['Minimal compatible DDL, not a production schema clone', 'Quota hook uses a transactional SQL fixture, not the production quota policy', 'Direct production helpers; no HTTP, browser, mobile, provider, or remote deployment exercised'] };
    if (process.env.GF_PG_REPORT) writeFileSync(process.env.GF_PG_REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.failed || !cleanup ? 1 : 0;
  }
}
