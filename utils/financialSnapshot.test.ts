import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balancesFromSnapshot } from './financialSnapshot';
import { TransactionType } from '../types';

test('loading older history never adds its effect to an authoritative balance twice', () => {
  const expense = { id: 'expense', accountId: 'bank', date: '2027-01-01', transactionType: TransactionType.EXPENSE, amount: 10, category: '', description: '', paymentMethod: '' };
  assert.deepEqual(balancesFromSnapshot({ bank: 9000 }, [expense], [expense]), { bank: 9000 });
});
