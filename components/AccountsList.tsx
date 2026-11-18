import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { WalletIcon } from './icons';
import { formatCurrency } from '../utils/formatters';
import { BankAccount } from '../types';

export const AccountsList: React.FC<{ accounts: BankAccount[] }> = ({ accounts }) => {
    const { isPrivacyMode } = useFinancialData();
    return (
        <div className="bg-white/40 dark:bg-slate-900/40 p-5 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 h-[15rem] md:h-[17.5rem] flex flex-col backdrop-blur-sm">
            <h3 className="text-label-caps !text-slate-400 mb-4">Contas Bancárias</h3>
            <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {accounts.map(account => (
                    <div key={account.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-100/70 dark:hover:bg-slate-800/50 group transition-colors">
                        <div className="flex items-center">
                            <WalletIcon className="h-5 w-5 text-[#0D9488] mr-3" aria-hidden="true" />
                            <div>
                                <p className="font-semibold text-sm text-slate-900 dark:text-white">{account.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{account.bank}</p>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <p className="font-bold text-sm text-slate-900 dark:text-white tabular-nums">
                                {isPrivacyMode ? '••••' : formatCurrency(account.balance ?? 0)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
