import { useMemo } from 'react';
import { useTransactions, UseTransactionsOptions } from './useTransactions';
import { Transaction, TransactionType } from '../types';
import { dateKey } from '../utils/formatters';

export const useCashFlow = (options: UseTransactionsOptions) => {
    const { transactions: filteredTransactions, allTransactions, accounts } = useTransactions(options);
    const { accountId: selectedAccount = 'all', costCenterId: selectedCostCenter = 'all', searchTerm = '', startDate = '', endDate = '' } = options;

    return useMemo(() => {
        const grouped: { [key: string]: Transaction[] } = {};
        filteredTransactions.forEach(t => {
            const key = dateKey(t.date);
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(t);
        });

        const sortedDays = Object.keys(grouped).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        const showBalance = searchTerm === '' && startDate === '' && endDate === '';
        const balances: { [key: string]: number } = {};

        const transactionEffect = (transaction: Transaction) => {
            if (selectedAccount === 'all') {
                if (transaction.transactionType === TransactionType.INCOME) return transaction.amount;
                if (transaction.transactionType === TransactionType.EXPENSE) return -transaction.amount;
                return 0;
            }

            if (transaction.transactionType === TransactionType.TRANSFER) {
                if (transaction.accountId === selectedAccount) return -transaction.amount;
                if (transaction.toAccountId === selectedAccount) return transaction.amount;
                return 0;
            }

            if (transaction.accountId !== selectedAccount) return 0;
            if (transaction.transactionType === TransactionType.INCOME) return transaction.amount;
            if (transaction.transactionType === TransactionType.EXPENSE) return -transaction.amount;
            return 0;
        };

        const initialTotalBalance = accounts.reduce((sum, account) => sum + (account.initialBalance || 0), 0);
        const startingBalance = selectedAccount === 'all'
            ? initialTotalBalance
            : (accounts.find(account => account.id === selectedAccount)?.initialBalance || 0);

        const changesByDay: Record<string, number> = {};
        const historyDays = new Set<string>();
        allTransactions.forEach(transaction => {
            if (selectedCostCenter !== 'all' && transaction.costCenterId !== selectedCostCenter) return;
            const day = dateKey(transaction.date);
            historyDays.add(day);
            changesByDay[day] = (changesByDay[day] || 0) + transactionEffect(transaction);
        });

        let runningBalance = startingBalance;
        const balancesByDay: Record<string, number> = {};
        const historyDaysAsc = [...historyDays].sort();
        historyDaysAsc.forEach(day => {
            runningBalance += changesByDay[day] || 0;
            balancesByDay[day] = runningBalance;
        });

        const balanceAt = (day: string) => {
            let balance = startingBalance;
            for (const historyDay of historyDaysAsc) {
                if (historyDay > day) break;
                balance = balancesByDay[historyDay];
            }
            return balance;
        };

        sortedDays.forEach(day => {
            balances[day] = balanceAt(day);
        });

        const currentBalance = endDate ? balanceAt(endDate) : runningBalance;
        const totals = filteredTransactions.reduce((acc, transaction) => {
            const effect = transactionEffect(transaction);
            if (effect > 0) acc.income += effect;
            else if (effect < 0) acc.expense += Math.abs(effect);
            return acc;
        }, { income: 0, expense: 0 });

        return {
            transactionsByDay: grouped,
            dailyBalances: balances,
            sortedDays,
            filteredTotalBalance: currentBalance,
            filteredIncome: totals.income,
            filteredExpense: totals.expense,
            filteredTransactions,
            isBalanceReal: showBalance
        };
    }, [filteredTransactions, allTransactions, accounts, selectedAccount, selectedCostCenter, searchTerm, startDate, endDate]);
};
