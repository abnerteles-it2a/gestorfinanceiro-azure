import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLotReduction } from './investmentLots';

test('selling 150 from two lots of 100 leaves 50 in the later lot', () => {
  assert.deepEqual(planLotReduction([
    { id: 'first', quantity: 100, purchaseDate: '2027-01-01' },
    { id: 'second', quantity: 100, purchaseDate: '2027-02-01' },
  ], 150), [{ id: 'first', quantity: 0 }, { id: 'second', quantity: 50 }]);
});
