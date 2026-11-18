import React from 'react';
import { formatCurrency } from '../utils/formatters';

interface Budget {
    name: string;
    spent: number;
    limit: number;
    percent: number;
}

export const CategoryBudgetsWidget: React.FC<{ budgets: Budget[], threshold?: number }> = ({ budgets, threshold = 90 }) => {
    return (
        <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 backdrop-blur-sm">
            <h3 className="text-label-caps !text-slate-400 mb-4">Orçamentos do Mês</h3>
            <div className="space-y-3">
                {budgets.slice(0,8).map(b => {
                    const ratio = b.percent;
                    const bar = ratio >= threshold ? 'bg-rose-500' : (ratio >= (threshold * 0.66) ? 'bg-amber-500' : 'bg-emerald-500');
                    return (
                        <div key={b.name}>
                            <div className="flex justify-between text-xs mb-1 text-slate-700 dark:text-slate-300 font-medium">
                                <span>{b.name}</span>
                                <span className="tabular-nums font-semibold">{formatCurrency(b.spent)} / {formatCurrency(b.limit)}</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                                <div className={`${bar} h-2 rounded-full transition-all duration-300`} style={{ width: `${ratio}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
