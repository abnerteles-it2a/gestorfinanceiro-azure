import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRecognition } from './accountingRecognition';

test('recognition rejects duplicate ids, missing competence and invalid periods instead of silently misstating totals', () => {
  const event = { id: 'e', sourceId: 'p', kind: 'expense' as const, amount: 10, recognitionDate: '2027-01-01' };
  assert.throws(() => summarizeRecognition([event, event], '2027-01-01', '2027-01-31'), /duplicate/i);
  assert.throws(() => summarizeRecognition([{ ...event, recognitionDate: undefined }], '2027-01-01', '2027-01-31'), /recognition/i);
  assert.throws(() => summarizeRecognition([event], '2027-01-31', '2027-01-01'), /period/i);
  assert.throws(() => summarizeRecognition([{ ...event, amount: -1 }], '2027-01-01', '2027-01-31'), /amount/i);
});

test('accrual recognizes December purchase while February invoice settlement affects only cash', () => {
  const events = [
    { id: 'purchase', sourceId: 'p', kind: 'expense' as const, amount: 100, recognitionDate: '2026-12-21' },
    { id: 'payment', sourceId: 'invoice:c:2027-01', kind: 'settlement' as const, amount: 100, cashDate: '2027-02-05', cashDirection: 'outflow' as const },
  ];
  assert.deepEqual(summarizeRecognition(events, '2026-12-01', '2026-12-31'), { income: 0, expenses: 100, result: -100, inflows: 0, outflows: 0, netCash: 0 });
  assert.deepEqual(summarizeRecognition(events, '2027-02-01', '2027-02-28'), { income: 0, expenses: 0, result: 0, inflows: 0, outflows: 100, netCash: -100 });
});
