import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDividendCalendar, summarizeInvestmentSales } from './investmentReporting';

test('Calendar: unknown holdings do not acquire made-up yield and duplicate lots aggregate', () => {
  const result = projectDividendCalendar([
    { ticker: 'UNKNOWN3', quantity: 10, purchasePrice: 100 },
    { ticker: 'MXRF11', quantity: 10, purchasePrice: 10 },
    { ticker: 'MXRF11', quantity: 20, purchasePrice: 10 },
  ], { MXRF11: { price: 0 } }, { MXRF11: { type: 'Rendimento FII', months: [1], avgPerShare: 1 } }, new Date('2026-01-01T00:00:00Z'));
  assert.equal(result.upcomingDividends.length, 1);
  assert.equal(result.totalAnnualProjected, 30);
  assert.equal(result.snowballStats[0].newShares, 0);
});

test('Tax sales: equity units are stocks, CDB redemptions and unrelated sales do not consume equity exemption', () => {
  const result = summarizeInvestmentSales([
    { date: '2026-12-10', description: 'Venda TAEE11', category: '', amount: 1000, transactionType: 'Entrada' },
    { date: '2026-12-10', description: 'Venda MXRF11', category: '', amount: 2000, transactionType: 'Entrada' },
    { date: '2026-12-10', description: 'Resgate CDB', category: 'Investimentos', amount: 30000, transactionType: 'Entrada' },
    { date: '2026-12-10', description: 'Venda bicicleta', category: '', amount: 1000, transactionType: 'Entrada' },
    { date: '2026-12-10', description: 'Venda PETR4', category: '', amount: 1000, transactionType: 'Saída' },
  ], new Date('2026-12-25T12:00:00Z'));
  assert.equal(result.stockSalesVolume, 1000);
  assert.equal(result.fiiSalesVolume, 2000);
  assert.equal(result.stockRemainingExemption, 19000);
});

test('Calendar: habits never confirm payments or invent cutoff dates and December rolls into next year', () => {
  const result = projectDividendCalendar([{ ticker: 'MXRF11', quantity: 10, purchasePrice: 10 }], {}, {
    MXRF11: { type: 'Rendimento FII', months: [1,2,3,4,5,6,7,8,9,10,11,12], avgPerShare: 1 },
  }, new Date('2026-12-25T12:00:00Z'));
  assert.equal(result.upcomingDividends.length, 12);
  assert.equal(result.upcomingDividends[0].dataPag, '2027-01-15');
  assert.equal(result.upcomingDividends[11].dataPag, '2027-12-15');
  assert.ok(result.upcomingDividends.every(payment => payment.status === 'previsto' && payment.dataCom === null));
  assert.equal(result.totalAnnualProjected, 120);
  assert.equal(result.monthlyCashFlow[0].month, 'Jan/27');
});
