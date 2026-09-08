import React from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { WalletIcon } from './icons';
import { formatCurrency } from '../utils/formatters';
import { BankAccount } from '../types';

export const AccountsList: React.FC<{ accounts: BankAccount[] }> = ({ accounts }) => {
    const { isPrivacyMode } = useFinancialData();
    return (
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg h-[15rem] md:h-[17.5rem] flex flex-col">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">Contas Bancárias</h3>
            <div className="space-y-3 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                {accounts.map(account => (
                    <div key={account.id} className="flex items-center justify-between p-3 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 group transition-all hover:scale-[1.01]">
                        <div className="flex items-center">
                            <WalletIcon className="h-6 w-6 text-indigo-500 dark:text-indigo-400 mr-3" />
                            <div>
                                <p className="font-medium text-gray-900 dark:text-white">{account.name}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{account.bank}</p>
                            </div>
                        </div>
                        <div className="flex items-center">
                            <p className="font-semibold text-gray-900 dark:text-white mr-4">
                                {isPrivacyMode ? '••••' : formatCurrency(account.balance ?? 0)}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
