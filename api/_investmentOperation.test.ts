import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disposeInvestment } from './_investmentOperation';

const user = '10000000-0000-4000-8000-000000000001';
const org = '10000000-0000-4000-8000-000000000002';
const asset = '10000000-0000-4000-8000-000000000003';
const second = '10000000-0000-4000-8000-000000000004';
const account = '10000000-0000-4000-8000-000000000005';
const operation = '10000000-0000-4000-8000-000000000006';
const scope = { userId: user, orgId: null };

type State = { investments: any[]; fixed_income_investments: any[]; accounts: any[]; cost_centers: any[]; transactions: any[]; investment_operations: any[]; quota: string[] };
// Boundary adapter: transactional working copies, scoped records, queued transaction locks,
// committed journal snapshots and rollback. Unexpected SQL fails rather than fabricating success.
class MemoryPool {
  state: State = { investments: [], fixed_income_investments: [], accounts: [], cost_centers: [], transactions: [], investment_operations: [], quota: [] };
  private locks = new Map<string, Promise<void>>();
  releases = 0;
  failJournal = false;
  schemaUnavailable = false;
  async connect() {
    let working: State | undefined;
    let unlock: (() => void) | undefined;
    const pool = this;
    const client = {
      async query(sql: string, p: any[] = []): Promise<{ rows: any[] }> {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql === 'COMMIT') { if (working) pool.state = working; unlock?.(); unlock = undefined; return { rows: [] }; }
        if (sql === 'ROLLBACK') { working = undefined; unlock?.(); unlock = undefined; return { rows: [] }; }
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = pool.locks.get(p[0]) || Promise.resolve();
          let release!: () => void;
          const next = new Promise<void>(resolve => { release = resolve; });
          pool.locks.set(p[0], previous.then(() => next));
          await previous;
          unlock = release;
          working = structuredClone(pool.state);
          return { rows: [] };
        }
        if (!working) throw new Error('adapter_requires_transaction_lock');
        if (sql === 'TEST_QUOTA') { working.quota.push(p[0]); return { rows: [] }; }
        const table = sql.match(/(?:from|into|update) public\.(\w+)/)?.[1] as keyof State;
        if (!table || table === 'quota') throw new Error(`unsupported_sql: ${sql}`);
        if (table === 'investment_operations' && pool.schemaUnavailable) throw Object.assign(new Error('relation public.investment_operations does not exist'), { code: '42P01' });
        const rows = working[table] as any[];
        if (sql.startsWith('select')) {
          let selected: any[];
          if (table === 'investment_operations') selected = rows.filter(r => r.scope_type === p[0] && r.scope_id === p[1] && r.operation_id === p[2]);
          else {
            selected = rows.filter(r => sql.includes('org_id=$2') ? r.org_id === p[1] : r.user_id === p[1] && r.org_id == null);
            if (sql.includes('id=$1')) selected = selected.filter(r => r.id === p[0]);
            else if (sql.includes('upper(ticker)=$1')) selected = selected.filter(r => r.ticker.toUpperCase() === p[0] && r.type === p[2]);
            if (sql.includes('order by purchase_date')) selected.sort((a,b) => a.purchase_date.localeCompare(b.purchase_date) || a.id.localeCompare(b.id));
          }
          return { rows: structuredClone(selected) };
        }
        if (sql.startsWith('insert')) {
          if (table === 'investment_operations' && pool.failJournal) throw new Error('journal_failure');
          const columns = sql.match(/\(([^)]+)\) values/)![1].split(',');
          const row = Object.fromEntries(columns.map((column, i) => [column, p[i]]));
          if (table === 'investment_operations') {
            if (rows.some(r => r.scope_type === row.scope_type && r.scope_id === row.scope_id && r.operation_id === row.operation_id)) throw new Error('duplicate_journal');
            row.request_payload = JSON.parse(row.request_payload);
            row.result_payload = JSON.parse(row.result_payload);
          }
          rows.push(row);
          return { rows: structuredClone([row]) };
        }
        if (sql.startsWith('update')) {
          const row = rows.find(r => r.id === p[1] && (sql.includes('org_id=$3') ? r.org_id === p[2] : r.user_id === p[2] && r.org_id == null));
          if (!row) return { rows: [] };
          row[sql.match(/set (\w+)=/)![1]] = p[0];
          return { rows: structuredClone([row]) };
        }
        if (sql.startsWith('delete')) {
          const index = rows.findIndex(r => r.id === p[0] && (sql.includes('org_id=$2') ? r.org_id === p[1] : r.user_id === p[1] && r.org_id == null));
          return { rows: index < 0 ? [] : structuredClone(rows.splice(index, 1)) };
        }
        throw new Error(`unsupported_sql: ${sql}`);
      },
      release() { pool.releases++; },
    };
    return client;
  }
}
function fixture() {
  const pool = new MemoryPool();
  pool.state.fixed_income_investments.push({ id: asset, user_id: user, org_id: null, amount_invested: '1000.00', name: 'CDB' });
  return pool;
}
const fixed = { operationId: operation, kind: 'fixed' as const, assetId: asset, principalAmount: 250, date: '2026-10-03' };

test('full redemption deletes the position and replay survives deletion without repeating it', async () => {
  const pool = fixture();
  const command = { ...fixed, principalAmount: 1000 };
  const result = await disposeInvestment(pool, scope, command);
  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.removedIds, [asset]);
  assert.equal(pool.state.fixed_income_investments.length, 0);
  const replay = await disposeInvestment(pool, scope, command);
  assert.deepEqual(replay, { ...result, replayed: true });
  assert.equal(pool.state.investment_operations.length, 1);
});

test('journal rejects changed requests and another actor without exposing historical results', async () => {
  const pool = fixture();
  await disposeInvestment(pool, scope, fixed);
  await assert.rejects(() => disposeInvestment(pool, scope, { ...fixed, principalAmount: 100 }), /investment_operation_conflict/);
  const orgPool = fixture();
  orgPool.state.fixed_income_investments[0].org_id = org;
  await disposeInvestment(orgPool, { userId: user, orgId: org }, fixed);
  await assert.rejects(() => disposeInvestment(orgPool, { userId: second, orgId: org }, fixed), /investment_operation_conflict/);
  assert.equal(orgPool.state.fixed_income_investments[0].amount_invested, 750);
});

test('redemption cash is independent from principal and quota uses the transactional client', async () => {
  const pool = fixture();
  pool.state.accounts.push({ id: account, user_id: user, org_id: null });
  const result = await disposeInvestment(pool, scope, { ...fixed, cash: { amount: 275, accountId: account, category: 'Resgate' } }, async (id, date, client) => {
    assert.equal(date, '2026-10-03');
    await client.query('TEST_QUOTA', [id]);
  });
  assert.equal(result.updated[0].amount_invested, 750);
  assert.equal(result.tx.amount, 275);
  assert.equal(result.tx.transaction_type, 'Entrada');
  assert.equal(result.tx.account_id, account);
  assert.equal(pool.state.transactions.length, 1);
  assert.deepEqual(pool.state.quota, [result.tx.id]);
});

test('variable disposal consumes FIFO compatible lots and never mixes crypto of the same ticker', async () => {
  const pool = fixture();
  pool.state.investments.push(
    { id: asset, user_id: user, org_id: null, ticker: 'ABC', type: 'Ação', quantity: '100', purchase_date: '2026-01-01', purchase_price: '10' },
    { id: second, user_id: user, org_id: null, ticker: 'ABC', type: 'Ação', quantity: '100', purchase_date: '2026-02-01', purchase_price: '20' },
    { id: account, user_id: user, org_id: null, ticker: 'ABC', type: 'Criptomoeda', quantity: '100', purchase_date: '2025-01-01', purchase_price: '1' },
  );
  const result = await disposeInvestment(pool, scope, { operationId: operation, kind: 'variable', assetId: second, quantity: 150, date: fixed.date });
  assert.deepEqual(result.removedIds, [asset]);
  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].id, second);
  assert.equal(result.updated[0].quantity, 50);
  assert.equal(result.updated[0].purchase_price, '20');
  assert.equal(pool.state.investments.find(r => r.id === account).quantity, '100');
});

test('invalid principal, dates, UUID and cash never mutate or journal a position', async () => {
  const pool = fixture();
  for (const patch of [
    { principalAmount: 1001 }, { principalAmount: 0 }, { principalAmount: -1 }, { principalAmount: NaN }, { principalAmount: '250' },
    { principalAmount: 0.001 }, { date: '2026-02-30' }, { date: '2026-10-03T00:00:00Z' }, { operationId: undefined },
    { cash: { amount: -1, accountId: account, category: 'Resgate' } },
  ]) await assert.rejects(() => disposeInvestment(pool, scope, { ...fixed, ...patch } as any), /invalid_investment_/);
  assert.equal(pool.state.fixed_income_investments[0].amount_invested, '1000.00');
  assert.equal(pool.state.investment_operations.length, 0);
});

test('cash account and cost center must belong to the authorized personal or organization scope', async () => {
  const pool = fixture();
  pool.state.accounts.push({ id: account, user_id: user, org_id: null });
  pool.state.cost_centers.push({ id: second, user_id: user, org_id: org });
  await assert.rejects(() => disposeInvestment(pool, scope, { ...fixed, cash: { amount: 275, accountId: account, category: 'Resgate', costCenterId: second } }), /permission_denied_cost_center/);
  pool.state.accounts[0].org_id = org;
  await assert.rejects(() => disposeInvestment(pool, scope, { ...fixed, cash: { amount: 275, accountId: account, category: 'Resgate' } }), /permission_denied_account/);
  assert.equal(pool.state.fixed_income_investments[0].amount_invested, '1000.00');
  assert.equal(pool.state.investment_operations.length, 0);
});

test('fractional crypto sale removes fully consumed lots without floating-point dust', async () => {
  const pool = fixture();
  pool.state.investments.push(
    { id: asset, user_id: user, org_id: null, ticker: 'BTC', type: 'Criptomoeda', quantity: '0.1', purchase_date: '2026-01-01' },
    { id: second, user_id: user, org_id: null, ticker: 'BTC', type: 'Criptomoeda', quantity: '0.2', purchase_date: '2026-02-01' },
  );
  const result = await disposeInvestment(pool, scope, { operationId: operation, kind: 'variable', ticker: 'BTC', assetType: 'Criptomoeda', quantity: 0.3, date: fixed.date });
  assert.deepEqual(result.removedIds, [asset, second]);
  assert.deepEqual(result.updated, []);
  assert.equal(pool.state.investments.length, 0);
});

test('journal or quota failure rolls back positions, cash, quota and operation together', async () => {
  const pool = fixture();
  pool.state.accounts.push({ id: account, user_id: user, org_id: null });
  const before = structuredClone(pool.state);
  pool.failJournal = true;
  const command = { ...fixed, cash: { amount: 275, accountId: account, category: 'Resgate' } };
  await assert.rejects(() => disposeInvestment(pool, scope, command, async (id, _date, client) => { await client.query('TEST_QUOTA', [id]); }), /journal_failure/);
  assert.deepEqual(pool.state, before);
  pool.failJournal = false;
  await assert.rejects(() => disposeInvestment(pool, scope, command, async (id, _date, client) => { await client.query('TEST_QUOTA', [id]); throw new Error('limit_reached_transactions_month'); }), /limit_reached/);
  assert.deepEqual(pool.state, before);
  const result = await disposeInvestment(pool, scope, command);
  const replay = await disposeInvestment(pool, scope, { date: command.date, cash: { category: 'Resgate', accountId: account, amount: 275 }, principalAmount: 250, assetId: asset, kind: 'fixed', operationId: operation }, async () => { throw new Error('must_not_recharge_quota'); });
  assert.deepEqual(replay, { ...result, replayed: true });
  assert.equal(pool.state.transactions.length, 1);
  assert.equal(pool.state.investment_operations.length, 1);
});

test('concurrent initial same-operation requests commit once and return one replay after deletion', async () => {
  const pool = fixture();
  const results = await Promise.all(Array.from({ length: 4 }, () => disposeInvestment(pool, scope, { ...fixed, principalAmount: 1000 })));
  assert.equal(results.filter(r => !r.replayed).length, 1);
  assert.equal(results.filter(r => r.replayed).length, 3);
  assert.equal(pool.state.investment_operations.length, 1);
  assert.equal(pool.state.fixed_income_investments.length, 0);
  assert.equal(pool.releases, 4);
});

test('concurrent distinct sales cannot oversell the same compatible position', async () => {
  const pool = fixture();
  pool.state.investments.push({ id: asset, user_id: user, org_id: null, ticker: 'ABC', type: 'Ação', quantity: '100', purchase_date: '2026-01-01' });
  const command = { kind: 'variable' as const, ticker: 'ABC', assetType: 'Ação', quantity: 75, date: fixed.date };
  const results = await Promise.allSettled([disposeInvestment(pool, scope, { ...command, operationId: operation }), disposeInvestment(pool, scope, { ...command, operationId: second })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
  assert.match(rejected.reason.message, /investment_insufficient_quantity/);
  assert.equal(pool.state.investments[0].quantity, 25);
  assert.equal(pool.state.investment_operations.length, 1);
});

test('personal disposal cannot touch organizational positions, and journal ids are independent by scope', async () => {
  const pool = fixture();
  pool.state.fixed_income_investments.push({ id: second, user_id: user, org_id: org, amount_invested: '400' });
  await assert.rejects(() => disposeInvestment(pool, scope, { ...fixed, assetId: second }), /investment_not_found/);
  await disposeInvestment(pool, scope, fixed);
  await disposeInvestment(pool, { userId: user, orgId: org }, { ...fixed, assetId: second });
  assert.equal(pool.state.fixed_income_investments.find(r => r.id === asset).amount_invested, 750);
  assert.equal(pool.state.fixed_income_investments.find(r => r.id === second).amount_invested, 150);
  assert.equal(pool.state.investment_operations.length, 2);
});

test('unavailable journal schema fails closed before changing investments or recording cash', async () => {
  const pool = fixture();
  pool.schemaUnavailable = true;
  const before = structuredClone(pool.state);
  await assert.rejects(() => disposeInvestment(pool, scope, fixed), /investment_operation_schema_unavailable/);
  assert.deepEqual(pool.state, before);
  assert.equal(pool.releases, 1);
});

test('partial redemption reduces explicit principal and preserves fixed-income metadata', async () => {
  const pool = fixture();
  const result = await disposeInvestment(pool, scope, fixed);
  assert.equal(result.updated[0].amount_invested, 750);
  assert.equal(result.updated[0].name, 'CDB');
  assert.deepEqual(result.removedIds, []);
  assert.equal(result.kind, 'fixed');
  assert.equal(result.operationId, operation);
  assert.equal(result.replayed, false);
  assert.equal(result.tx, undefined);
  assert.equal(pool.state.fixed_income_investments[0].amount_invested, 750);
  assert.equal(pool.releases, 1);
});
