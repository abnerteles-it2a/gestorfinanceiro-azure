import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePortfolioAssumptions, simulatePortfolio, aggregateHoldings, compoundReturn, historicalPortfolioReturn, stressPortfolio } from './investmentAnalytics';

test('Stress: shocks apply to marked quotes, REIT classification and zero prices are preserved', () => {
  const holdings = [
    { ticker: 'ABCD3', type: 'Ação', quantity: 10, purchasePrice: 10 },
    { ticker: 'O', type: 'REIT', quantity: 10, purchasePrice: 10 },
    { ticker: 'ZERO3', type: 'Ação', quantity: 10, purchasePrice: 100 },
  ];
  const { allocation } = derivePortfolioAssumptions(holdings, [], { ABCD3: { price: 20 }, O: { price: 30 }, ZERO3: { price: 0 } }, false);
  assert.deepEqual(allocation, { equities: 200, fiis: 300, fixed: 0, crypto: 0, total: 500 });
  const result = stressPortfolio(allocation, { shockEquities: -50, shockFiis: -10, shockFixedIncome: 0, shockCrypto: 0, benchmarkIbovShock: -50 });
  assert.equal(result.totalDelta, -130);
  assert.equal(result.finalEquity, 370);
  assert.equal(result.totalPercentage, -26);
});

test('Performance: CDI compounds monthly and incomplete portfolio history is unavailable, not zero', () => {
  assert.ok(Math.abs(compoundReturn([10, 10]) - 21) < 1e-10);
  const weights = { ABCD3: 0.5, EFGH4: 0.5 };
  const series = { ABCD3: [{ date: '2026-01-01', close: 10 }, { date: '2026-02-01', close: 12 }] };
  assert.equal(historicalPortfolioReturn(series, weights, '2026-02'), undefined);
  assert.equal(historicalPortfolioReturn({ ...series, EFGH4: [{ date: '2026-01-01', close: 20 }, { date: '2026-02-01', close: 20 }] }, weights, '2026-02'), 10);
});

test('Performance: duplicate ticker lots aggregate cost and quantity without losing weights', () => {
  const holdings = aggregateHoldings([
    { ticker: 'ABCD3', type: 'Ação', quantity: 10, purchasePrice: 10 },
    { ticker: 'ABCD3', type: 'Ação', quantity: 10, purchasePrice: 30 },
    { ticker: 'EFGH4', type: 'Ação', quantity: 20, purchasePrice: 20 },
  ]);
  assert.equal(holdings.length, 2);
  assert.deepEqual(holdings[0], { ticker: 'ABCD3', quantity: 20, cost: 400, purchasePrice: 20, weight: 0.5 });
  assert.equal(holdings[1].weight, 0.5);
});

test('Monte Carlo: zero starting equity remains zero without contributions under deterministic paths', () => {
  const result = simulatePortfolio({ initialEquity: 0, horizonYears: 1, monthlyContribution: 0, targetMilestone: 1, expectedReturnAnnual: 0.1, volatilityAnnual: 0.2 }, () => 0, 2026);
  assert.equal(result.finalP50, 0);
  assert.equal(result.targetProbability, 0);
  assert.equal(result.trajectoryData[0].p90, 0);
  const savings = simulatePortfolio({ initialEquity: 0, horizonYears: 1, monthlyContribution: 100, targetMilestone: 1200, expectedReturnAnnual: 0, volatilityAnnual: 0 }, () => 0, 2026);
  assert.equal(savings.finalP50, 1200);
  assert.equal(savings.targetProbability, 100);
});

test('Monte Carlo: an exclusively fixed-income portfolio has no phantom equity, FII or crypto weights', () => {
  const result = derivePortfolioAssumptions([], [{ amountInvested: 10000 }], {}, false);
  assert.equal(result.initialEquity, 10000);
  assert.equal(result.expectedReturnAnnual, 0.105);
  assert.equal(result.volatilityAnnual, 0.03);
  const empty = derivePortfolioAssumptions([], [], {}, false);
  assert.equal(empty.initialEquity, 0);
  assert.equal(empty.expectedReturnAnnual, 0);
  assert.equal(empty.volatilityAnnual, 0);
});
