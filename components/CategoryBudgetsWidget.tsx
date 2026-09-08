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
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Orçamentos do Mês</h3>
            <div className="space-y-3">
                {budgets.slice(0,8).map(b => {
                    const ratio = b.percent;
                    const bar = ratio >= threshold ? 'bg-red-500' : (ratio >= (threshold * 0.66) ? 'bg-yellow-500' : 'bg-green-500');
                    return (
                        <div key={b.name} className="">
                            <div className="flex justify-between text-xs mb-1 text-gray-700 dark:text-gray-300">
                                <span>{b.name}</span>
                                <span>{formatCurrency(b.spent)} / {formatCurrency(b.limit)}</span>
                            </div>
                            <div className="w-full h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                <div className={`${bar} h-2`} style={{ width: `${ratio}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
