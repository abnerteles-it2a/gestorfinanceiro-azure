import test from 'node:test';
import assert from 'node:assert/strict';
import { readFinancialBootstrap, projectFinancialBalance } from './financialBootstrap';
import { createFinancialScope, createLatestRequestGuard } from './financialScope';

test('monthly totals and balances are independent of the history page', () => {
  const complete = Array.from({ length: 150 }, (_, id) => ({ id, amount: 10, transaction_type: 'Entrada' }));
  const data = { accounts: [{ id: 'bank' }], transactions: complete.slice(0, 100), financial_transactions: complete,
    investments: [], fixed_income_investments: [], financial_snapshot: { accounts: [{ id: 'bank', balance: '1900.01' }], period: { income: '1500', expense: '20' } } };
  for (const page of [data.transactions, [], complete.slice(100)]) {
    const result = readFinancialBootstrap({ ...data, transactions: page });
    assert.equal(result.monthIncome, 1500); assert.equal(result.monthExpense, 20);
    assert.equal(result.balances.get('bank'), 1900.01); assert.equal(result.financialTransactions.length, 150);
  }
  assert.throws(() => readFinancialBootstrap({ ...data, financial_transactions: undefined }), /incompleto/);
  assert.throws(() => readFinancialBootstrap({ ...data, financial_snapshot: { accounts: [], period: {} } }), /ausente/);
});
test('forecast uses residuals including open partials, overdue and cents, ignoring settled', () => {
  const result = projectFinancialBalance('2026-11-12', 1000,
    [{ id: 'p', due_date: '2026-11-10', status: 'open', amount: 100.01, paid_amount: 40 },
      { id: 'p', due_date: '2026-11-10', status: 'open', amount: 100.01, paid_amount: 40 },
      { due_date: '2026-11-14', status: 'paid', amount: 90 },
      { due_date: '2027-01-01', status: 'open', amount: 90 }],
    [{ due_date: '2026-11-13', status: 'partial', amount: 200, received_amount: 50 }]);
  assert.equal(result.totalProjectedOutflow, 60.01); assert.equal(result.totalProjectedInflow, 150);
  assert.equal(result.forecastPoints.at(-1)?.balance, 1089.99);
});
test('scope snapshots survive awaits without switching credentials; old view/user and ABA rejected', async () => {
  const scope = createFinancialScope(); scope.set('user-a', 'personal');
  const personal = scope.snapshot();
  scope.set('user-a', 'organization'); const organization = scope.snapshot();
  await Promise.resolve(); scope.set('user-a', 'personal');
  assert.equal(personal.token, 'user-a'); assert.equal(personal.viewMode, 'personal');
  assert.equal(scope.isCurrent(personal), false); assert.equal(scope.isCurrent(organization), false);
  const beforeLogin = scope.snapshot(); scope.set('user-b', 'personal');
  assert.equal(scope.isCurrent(beforeLogin), false);
  const beforeLogout = scope.snapshot(); scope.set(null, 'personal');
  assert.equal(scope.isCurrent(beforeLogout), false);
});
test('latest request guard prevents a slower same-scope refresh from overwriting a newer one', () => {
  const guard = createLatestRequestGuard(); const first = guard.begin(); const second = guard.begin();
  assert.equal(first(), false); assert.equal(second(), true);
  guard.invalidate(); assert.equal(second(), false);
});
