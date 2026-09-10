import { useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Transaction, TransactionType } from '../types';
import { isIncomeTx, isExpenseTx, isTransferTx } from '../utils/transactionHelpers';

export interface UseTransactionsOptions {
    accountId?: string;
    costCenterId?: string;
    searchTerm?: string;
    startDate?: string;
    endDate?: string;
    transactionType?: TransactionType | 'all';
}

export const useTransactions = ({
    accountId = 'all',
    costCenterId = 'all',
    searchTerm = '',
    startDate,
    endDate,
    transactionType = 'all'
}: UseTransactionsOptions = {}) => {
    const { transactions, ...rest } = useFinancialData();

    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            const matchesAccount = accountId === 'all' || t.accountId === accountId || t.toAccountId === accountId;
            const matchesCostCenter = costCenterId === 'all' || t.costCenterId === costCenterId;
            const matchesSearch = searchTerm === '' || 
                t.description.toLowerCase().includes(searchTerm.toLowerCase()) || 
                t.category.toLowerCase().includes(searchTerm.toLowerCase());
            
            const transactionDate = new Date(t.date);
            const matchesStartDate = !startDate || transactionDate >= new Date(startDate);
            const matchesEndDate = !endDate || transactionDate <= new Date(endDate + 'T23:59:59');
            
            let matchesType = transactionType === 'all';
            if (!matchesType) {
                if (transactionType === TransactionType.INCOME) matchesType = isIncomeTx(t.transactionType);
                else if (transactionType === TransactionType.EXPENSE) matchesType = isExpenseTx(t.transactionType);
                else if (transactionType === TransactionType.TRANSFER) matchesType = isTransferTx(t.transactionType);
                else matchesType = String(t.transactionType || '').toLowerCase() === String(transactionType).toLowerCase();
            }

            return matchesAccount && matchesCostCenter && matchesSearch && matchesStartDate && matchesEndDate && matchesType;
        });
    }, [transactions, accountId, costCenterId, searchTerm, startDate, endDate, transactionType]);

    return {
        transactions: filteredTransactions,
        allTransactions: transactions,
        ...rest
    };
};
