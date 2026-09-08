import React, { useState } from 'react';
import { Transaction, TransactionType } from '../types';
import { Category } from '../types';
import { TransactionItem } from './TransactionItem';

interface RecentTransactionsWidgetProps {
    transactions: Transaction[];
    categories: Category[];
}

export const RecentTransactionsWidget: React.FC<RecentTransactionsWidgetProps> = ({ transactions, categories }) => {
    const [txFilter, setTxFilter] = useState<'all' | 'income' | 'expense'>('all');

    return (
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg h-[15rem] md:h-[17.5rem] flex flex-col">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Lançamentos Recentes</h3>
            <div className="flex items-center gap-2 mb-2">
                <button
                    className={`text-xs px-2 py-1 rounded ${txFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'}`}
                    onClick={() => setTxFilter('all')}
                >
                    Todos
                </button>
                <button
                    className={`text-xs px-2 py-1 rounded ${txFilter === 'income' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'}`}
                    onClick={() => setTxFilter('income')}
                >
                    Entradas
                </button>
                <button
                    className={`text-xs px-2 py-1 rounded ${txFilter === 'expense' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'}`}
                    onClick={() => setTxFilter('expense')}
                >
                    Saídas
                </button>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {(() => {
                    const base = transactions.slice(0, 20);
                    const list = base.filter(t => txFilter === 'all' ? true : (txFilter === 'income' ? t.transactionType === TransactionType.INCOME : t.transactionType === TransactionType.EXPENSE));
                    
                    if (list.length === 0) {
                         return <div className="text-sm text-gray-500 text-center py-4">Nenhum lançamento recente.</div>
                    }

                    return list.map(t => {
                        const cat = categories.find(c => c.name === t.category);
                        return <TransactionItem key={t.id} transaction={t} categoryIcon={cat?.icon} />
                    });
                })()}
            </div>
        </div>
    );
};
