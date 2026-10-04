import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcDataParcelas } from './financial';

test('monthly installments preserve the original day after February clamping', () => {
  assert.deepEqual(calcDataParcelas(3, '2027-01-31').map(date => date.slice(0, 10)), [
    '2027-01-31', '2027-02-28', '2027-03-31',
  ]);
});
