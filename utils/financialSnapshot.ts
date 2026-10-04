import type { Transaction } from '../types';
import { calculateTransactionEffect } from './transactionHelpers';

export function balancesFromSnapshot(balances: Record<string, number>, baseline: Transaction[], current: Transaction[]) {
  const result = { ...balances };
  for (const accountId of Object.keys(result)) {
    for (const transaction of baseline) result[accountId] -= calculateTransactionEffect(transaction, accountId);
    for (const transaction of current) result[accountId] += calculateTransactionEffect(transaction, accountId);
    result[accountId] = Math.round(result[accountId] * 100) / 100;
  }
  return result;
}
