import test from 'node:test';
import assert from 'node:assert/strict';
import { getInvestmentSimulationInputs, resolveSimulationAssetClass, selectSimulationInput } from './investmentSimulationInputs';

for (const ticker of ['SANB11', 'TAEE11', 'KLBN11', 'SAPR11']) {
  test(`${ticker}: unit is equity, never FII from suffix`, () => {
    const result = getInvestmentSimulationInputs({ ticker, minimumYieldRate: 6, quote: { price: 10, lpa: 2, vpa: 20, dividends12m: 1 } });
    assert.equal(result.assetClass, 'STOCK');
    assert.equal(result.grahamPrice, 30);
    assert.equal(result.fiiCeilingPrice, null);
  });
}
test('explicit class wins; unknown 11 and ETFs are not classified as FII', () => {
  assert.equal(resolveSimulationAssetClass('NEWF11', 'FII'), 'FII');
  assert.equal(resolveSimulationAssetClass('NEWF11'), 'OTHER');
  assert.equal(resolveSimulationAssetClass('BOVA11', 'ETF'), 'OTHER');
  assert.equal(resolveSimulationAssetClass('O'), 'OTHER');
  const result = getInvestmentSimulationInputs({ ticker: 'MXRF11', assetClass: 'FIIs', minimumYieldRate: 8.75, quote: { vpa: 9.84, lpa: -2, dividends12m: 1.15 } });
  assert.equal(result.grahamPrice, 9.84);
  assert.equal(result.fiiCeilingPrice, 13.14);
});
test('zero and negative observed fundamentals cannot fall through to positive benchmarks', () => {
  for (const value of [0, -3]) {
    const result = getInvestmentSimulationInputs({ ticker: 'SANB11', minimumYieldRate: 6,
      quote: { price: value, lpa: value, vpa: value, dividends12m: value }, benchmark: { price: 100, lpa: 3, vpa: 20, dividends12m: 2 } });
    for (const field of [result.price, result.lpa, result.vpa, result.dividends]) {
      assert.equal(field.value, value); assert.equal(field.source, 'quote');
    }
    assert.equal(result.grahamPrice, null); assert.equal(result.bazinPrice, null); assert.equal(result.pvp, null);
  }
});
test('observed loss invalidates Graham even with positive VPA and positive quote fair price', () => {
  const quote = { price: 25, lpa: -2, vpa: 20, dividends12m: 0, grahamPrice: 80, bazinPrice: 60, dividendYield: 0.1 };
  const result = getInvestmentSimulationInputs({ ticker: 'SANB11', minimumYieldRate: 6, quote, benchmark: { lpa: 3, vpa: 20, dividends12m: 2 } });
  assert.equal(result.lpa.value, -2); assert.equal(result.lpa.source, 'quote');
  assert.equal(result.grahamPrice, null); assert.equal(result.bazinPrice, null);
  assert.equal(result.dividendYield, 0); assert.equal(result.pvp, 1.25);
});
test('manual dividend zero cannot revive a quote Bazin, FII ceiling or DY', () => {
  const quote = { price: 10, dividends12m: 1, vpa: 15, lpa: 2, bazinPrice: 99, grahamPrice: 99, dividendYield: 0.1, fiiCeilingPrice: 99 };
  const result = getInvestmentSimulationInputs({ ticker: 'MXRF11', assetClass: 'FII', minimumYieldRate: 6, quote, manual: { dividends12m: 0, vpa: -1 }, benchmark: { dividends12m: 10, vpa: 100 } });
  assert.equal(result.dividends.source, 'manual'); assert.equal(result.dividends.value, 0);
  assert.equal(result.bazinPrice, null); assert.equal(result.fiiCeilingPrice, null);
  assert.equal(result.dividendYield, 0); assert.equal(result.grahamPrice, null);
});
test('only absence uses a labeled benchmark; invalid observed value never does', () => {
  assert.deepEqual(selectSimulationInput('', undefined, 2), { value: 2, source: 'benchmark' });
  assert.deepEqual(selectSimulationInput('', null, 2), { value: 2, source: 'benchmark' });
  assert.deepEqual(selectSimulationInput('', undefined), { value: null, source: 'missing' });
  assert.deepEqual(selectSimulationInput('', NaN, 2), { value: null, source: 'quote', invalid: true });
  assert.deepEqual(selectSimulationInput(-5, 3, 2), { value: -5, source: 'manual' });
});
