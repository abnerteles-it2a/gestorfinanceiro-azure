import test from 'node:test';
import assert from 'node:assert';
import { calculateAccountingHealth } from './accountingHealth';

test('Accounting Health: calculates high score for healthy company', () => {
  const result = calculateAccountingHealth({
    totalBalance: 50000,
    currentAssets: 100000,
    currentLiabilities: 40000,
    grossRevenue: 80000,
    grossProfit: 50000,
    netProfit: 25000,
    cogs: 30000,
    opex: 25000,
    receivablesAging: { overdue: 0, b30: 30000, b60: 15000, b90: 5000, bPlus: 0, total: 50000 },
    payablesAging: { overdue: 0, b30: 25000, b60: 15000, b90: 0, bPlus: 0, total: 40000 },
    burnRateMonthly: 20000,
    runwayMonths: 5
  });

  assert.ok(result.score >= 80, `Expected score >= 80, got ${result.score}`);
  assert.strictEqual(result.tier, 'excellent');
  assert.strictEqual(result.metrics.receivablesDelinquencyPct, 0);
  assert.ok(result.insights.length > 0);
});

test('Accounting Health: penalizes severe receivables delinquency and cash deficit', () => {
  const result = calculateAccountingHealth({
    totalBalance: 2000,
    currentAssets: 20000,
    currentLiabilities: 60000,
    grossRevenue: 30000,
    grossProfit: 10000,
    netProfit: -15000,
    cogs: 20000,
    opex: 25000,
    receivablesAging: { overdue: 12000, b30: 4000, b60: 2000, b90: 0, bPlus: 0, total: 18000 },
    payablesAging: { overdue: 15000, b30: 30000, b60: 15000, b90: 0, bPlus: 0, total: 60000 },
    burnRateMonthly: 25000,
    runwayMonths: 0.1
  });

  assert.ok(result.score < 50, `Expected score < 50 for critical condition, got ${result.score}`);
  assert.strictEqual(result.tier, 'critical');
  assert.ok(result.metrics.receivablesDelinquencyPct > 50);
  const dangerInsight = result.insights.find(i => i.type === 'danger');
  assert.ok(dangerInsight, 'Expected at least one danger insight');
});
