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
        <div className="flex items-center justify-between py-3 px-2 border-b border-slate-100 dark:border-slate-800/60 last:border-b-0 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors rounded-xl">
            <div className="flex items-center min-w-0 pr-2">
                 <div className={`p-2 rounded-xl mr-3 flex items-center justify-center w-9 h-9 shrink-0 ${isIncome ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                    {categoryIcon ? <span className="text-base leading-none">{categoryIcon}</span> : (isIncome ? <ArrowUpIcon className="h-4 w-4" aria-hidden="true" /> : <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />)}
                </div>
                <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white truncate">{transaction.description}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{account?.name} • {transaction.category}</p>
                </div>
            </div>
            <div className="text-right shrink-0">
                <StatusTag type={isIncome ? 'success' : isTransfer ? 'info' : 'error'}>
                    <span className="tabular-nums font-bold">
                        {isPrivacyMode ? '••••' : `${isIncome ? '+' : isTransfer ? '' : '-'} ${formatCurrency(transaction.amount)}`}
                    </span>
                </StatusTag>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 tabular-nums">{formatDate(transaction.date)}</p>
            </div>
        </div>
    );
};
