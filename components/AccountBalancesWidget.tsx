import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { formatCurrency } from '../utils/formatters';
import { BankAccount } from '../types';

interface AccountBalancesWidgetProps {
    accounts: BankAccount[];
}

export const AccountBalancesWidget: React.FC<AccountBalancesWidgetProps> = ({ accounts }) => {
    return (
        <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-full backdrop-blur-sm">
            <h3 className="text-label-caps !text-slate-400 mb-6 px-1">
                Saldos em Conta
            </h3>
            <div className="space-y-4 px-1">
                {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between text-[13px] group border-b border-slate-200/40 dark:border-slate-800/40 last:border-0 pb-3 last:pb-0">
                        <span className="text-slate-500 dark:text-slate-400 font-black uppercase tracking-tight group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                            {acc.name}
                        </span>
                        <span className={`font-black tabular-nums ${((acc as any).balance ?? acc.initialBalance) < 0 ? 'text-rose-500' : 'text-slate-900 dark:text-slate-200'}`}>
                            {formatCurrency(((acc as any).balance ?? acc.initialBalance))}
                        </span>
                    </div>
                ))}
            </div>
            {accounts.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-6 opacity-30">
                    <div className="text-[10px] uppercase font-black tracking-[0.2em] text-slate-400">Sem Contas Ativas</div>
                </div>
            )}
        </div>
    );
};
