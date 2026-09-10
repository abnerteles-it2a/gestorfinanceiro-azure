import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  isIncomeTx,
  isExpenseTx,
  isTransferTx,
  normalizeTransactionType,
  calculateTransactionEffect,
  calculateAccountBalances
} from './transactionHelpers';
import { BankAccount, Transaction, TransactionType } from '../types';

const expect = (actual: any) => ({
  toBe: (expected: any) => assert.strictEqual(actual, expected)
});

describe('transactionHelpers', () => {
  it('identifies income types across language and casing variations', () => {
    expect(isIncomeTx('Entrada')).toBe(true);
    expect(isIncomeTx('entrada')).toBe(true);
    expect(isIncomeTx('income')).toBe(true);
    expect(isIncomeTx('receita')).toBe(true);
    expect(isIncomeTx('Receita')).toBe(true);
    expect(isIncomeTx('Saída')).toBe(false);
    expect(isIncomeTx('transferência')).toBe(false);
    expect(isIncomeTx(null)).toBe(false);
  });

  it('identifies expense types across language and casing variations', () => {
    expect(isExpenseTx('Saída')).toBe(true);
    expect(isExpenseTx('saída')).toBe(true);
    expect(isExpenseTx('saida')).toBe(true);
    expect(isExpenseTx('expense')).toBe(true);
    expect(isExpenseTx('despesa')).toBe(true);
    expect(isExpenseTx('Despesa')).toBe(true);
    expect(isExpenseTx('Entrada')).toBe(false);
    expect(isExpenseTx('transfer')).toBe(false);
  });

  it('identifies transfer types across variations', () => {
    expect(isTransferTx('Transferência')).toBe(true);
    expect(isTransferTx('transferência')).toBe(true);
    expect(isTransferTx('transferencia')).toBe(true);
    expect(isTransferTx('transfer')).toBe(true);
    expect(isTransferTx('Transfer')).toBe(true);
    expect(isTransferTx('Entrada')).toBe(false);
    expect(isTransferTx('Saída')).toBe(false);
  });

  it('calculates transaction effects accurately in consolidated (all) mode', () => {
    // Inflows add cash
    expect(calculateTransactionEffect({ transactionType: 'Entrada', amount: 500 }, 'all')).toBe(500);
    expect(calculateTransactionEffect({ transactionType: 'receita', amount: 250 }, 'all')).toBe(250);

    // Outflows subtract cash
    expect(calculateTransactionEffect({ transactionType: 'Saída', amount: 150 }, 'all')).toBe(-150);
    expect(calculateTransactionEffect({ transactionType: 'expense', amount: 300 }, 'all')).toBe(-300);

    // Transfers between own accounts have ZERO net effect on total cash
    expect(calculateTransactionEffect({ transactionType: 'Transferência', amount: 1000, accountId: 'acc-1', toAccountId: 'acc-2' }, 'all')).toBe(0);
    expect(calculateTransactionEffect({ transactionType: 'transfer', amount: 500, accountId: 'acc-1', toAccountId: 'acc-2' }, 'all')).toBe(0);
  });

  it('calculates transaction effects accurately for specific account', () => {
    const transferTx = {
      transactionType: 'Transferência',
      amount: 400,
      accountId: 'acc-origin',
      toAccountId: 'acc-dest'
    };

    // Origin account is debited
    expect(calculateTransactionEffect(transferTx, 'acc-origin')).toBe(-400);

    // Destination account is credited
    expect(calculateTransactionEffect(transferTx, 'acc-dest')).toBe(400);

    // Unrelated account is unaffected
    expect(calculateTransactionEffect(transferTx, 'acc-other')).toBe(0);
  });

  it('calculates dynamic account balances accurately including initial balance and transfers', () => {
    const accounts: BankAccount[] = [
      { id: 'acc-1', name: 'Banco Inter', bank: 'Inter', initialBalance: 1000 },
      { id: 'acc-2', name: 'Nubank', bank: 'Nu', initialBalance: 500 },
    ];

    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: '2026-03-01',
        accountId: 'acc-1',
        transactionType: TransactionType.INCOME,
        category: 'Salário',
        description: 'Recebimento',
        amount: 3000,
        paymentMethod: 'PIX'
      },
      {
        id: 'tx-2',
        date: '2026-03-02',
        accountId: 'acc-1',
        transactionType: TransactionType.EXPENSE,
        category: 'Aluguel',
        description: 'Pagamento aluguel',
        amount: 1200,
        paymentMethod: 'PIX'
      },
      {
        id: 'tx-3',
        date: '2026-03-03',
        accountId: 'acc-1',
        toAccountId: 'acc-2',
        transactionType: TransactionType.TRANSFER,
        category: 'Transferência',
        description: 'Envio para reserva',
        amount: 800,
        paymentMethod: 'PIX'
      }
    ];

    const balances = calculateAccountBalances(accounts, transactions);

    // acc-1: 1000 (initial) + 3000 (income) - 1200 (expense) - 800 (transfer out) = 2000
    expect(balances['acc-1']).toBe(2000);

    // acc-2: 500 (initial) + 800 (transfer in) = 1300
    expect(balances['acc-2']).toBe(1300);

    // Total net worth: 2000 + 1300 = 3300 (Initial 1500 + Income 3000 - Expense 1200 = 3300)
    const total = Object.values(balances).reduce((sum, b) => sum + b, 0);
    expect(total).toBe(3300);
  });
});
