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
        <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 h-[15rem] md:h-[17.5rem] flex flex-col backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-label-caps !text-slate-400">Lançamentos Recentes</h3>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors ${txFilter === 'all' ? 'bg-[#0D9488] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        onClick={() => setTxFilter('all')}
                    >
                        Todos
                    </button>
                    <button
                        type="button"
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors ${txFilter === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        onClick={() => setTxFilter('income')}
                    >
                        Entradas
                    </button>
                    <button
                        type="button"
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg transition-colors ${txFilter === 'expense' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                        onClick={() => setTxFilter('expense')}
                    >
                        Saídas
                    </button>
                </div>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {(() => {
                    const base = transactions.slice(0, 20);
                    const list = base.filter(t => txFilter === 'all' ? true : (txFilter === 'income' ? t.transactionType === TransactionType.INCOME : t.transactionType === TransactionType.EXPENSE));
                    
                    if (list.length === 0) {
                         return <div className="text-xs text-slate-500 text-center py-6">Nenhum lançamento recente.</div>
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
