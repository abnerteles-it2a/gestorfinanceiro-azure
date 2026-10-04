import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastCashFlow } from './cashFlowForecast';

test('forecast rejects nonfinite balances and unbounded horizons', () => {
  const input = { today: '2027-01-15', daysHorizon: 1, openingBalance: 1000, payables: [], receivables: [] };
  assert.throws(() => forecastCashFlow({ ...input, daysHorizon: -1 }), /horizon/i);
  assert.throws(() => forecastCashFlow({ ...input, openingBalance: NaN }), /balance/i);
});

test('only remaining open amounts are projected once and undated obligations are not invented', () => {
  const result = forecastCashFlow({ today: '2027-01-15', daysHorizon: 1, openingBalance: 1000,
    payables: [{ id: 'p', amount: 200, paid_amount: 50, due_date: '2027-01-16' }, { id: 'p', amount: 200, paid_amount: 50, due_date: '2027-01-16' }, { id: 'paid', amount: 500, status: 'paid', due_date: '2027-01-16' }, { id: 'undated', amount: 900 }],
    receivables: [{ id: 'r', amount: 100, received_amount: 40, due_date: '2027-01-16T00:00:00Z' }],
  });
  assert.equal(result.totalProjectedOutflow, 150);
  assert.equal(result.totalProjectedInflow, 60);
  assert.equal(result.forecastPoints[1].balance, 910);
});

test('today and overdue open obligations change d0 symmetrically without extrapolated historical burn', () => {
  const result = forecastCashFlow({ today: '2027-01-15', daysHorizon: 1, openingBalance: 1000,
    payables: [{ id: 'p1', due_date: '2027-01-14', amount: 200 }, { id: 'p2', due_date: '2027-01-15', amount: 100 }],
    receivables: [{ id: 'r1', due_date: '2027-01-15', amount: 50 }],
  });
  assert.deepEqual(result.forecastPoints.map(p => [p.date, p.balance, p.inflows, p.outflows]), [
    ['2027-01-15', 750, 50, 300], ['2027-01-16', 750, 0, 0],
  ]);
  assert.equal(result.totalProjectedOutflow, 300);
  assert.equal(result.totalProjectedInflow, 50);
  assert.equal(result.minBalance, 750);
});
