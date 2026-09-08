import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Transaction, TransactionType } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { ArrowDownIcon, ArrowUpIcon } from './icons';
import { StatusTag } from './ui/StatusTag';

export const TransactionItem: React.FC<{ transaction: Transaction, categoryIcon?: string }> = ({ transaction, categoryIcon }) => {
    const { accounts, isPrivacyMode } = useFinancialData();
    const account = accounts.find(a => a.id === transaction.accountId);
    const isIncome = transaction.transactionType === TransactionType.INCOME;
    const isTransfer = transaction.transactionType === TransactionType.TRANSFER;

    return (
        <div className="flex items-center justify-between py-3 px-1 border-b border-gray-200 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors rounded-md">
            <div className="flex items-center">
                 <div className={`p-2 rounded-full mr-3 flex items-center justify-center w-10 h-10 ${isIncome ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-red-100 dark:bg-red-900/30 text-red-600'}`}>
                    {categoryIcon ? <span className="text-lg leading-none">{categoryIcon}</span> : (isIncome ? <ArrowUpIcon className="h-5 w-5" /> : <ArrowDownIcon className="h-5 w-5" />)}
                </div>
                <div>
                    <p className="font-medium text-gray-900 dark:text-white">{transaction.description}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{account?.name} • {transaction.category}</p>
                </div>
            </div>
            <div className="text-right">
                <StatusTag type={isIncome ? 'success' : isTransfer ? 'info' : 'error'}>
                    {isPrivacyMode ? '••••' : `${isIncome ? '+' : isTransfer ? '' : '-'} ${formatCurrency(transaction.amount)}`}
                </StatusTag>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatDate(transaction.date)}</p>
            </div>
        </div>
    );
};
