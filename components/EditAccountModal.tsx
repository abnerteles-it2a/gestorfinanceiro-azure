
import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { Modal } from './shared/Modal';
import type { BankAccount } from '../types';
import { formatInputMoney, toNumberPtBr, formatCurrencyForInput } from '../utils/formatters';

interface EditAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    account: BankAccount;
}

export const EditAccountModal: React.FC<EditAccountModalProps> = ({ isOpen, onClose, account }) => {
    const { updateAccount } = useFinancialData();
    const [name, setName] = useState(account.name);
    const [bank, setBank] = useState(account.bank);
    const [initialBalance, setInitialBalance] = useState(String(account.initialBalance));

    useEffect(() => {
        if (account) {
            setName(account.name);
            setBank(account.bank);
            setInitialBalance(formatCurrencyForInput(account.initialBalance));
        }
    }, [account, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        updateAccount(account.id, {
            name,
            bank,
            initialBalance: toNumberPtBr(initialBalance),
        });
        onClose();
    };

    const footer = (
        <div className="flex justify-end gap-2 w-full">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md">Cancelar</button>
            <button type="submit" form="edit-account-form" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Salvar Alterações</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Conta Bancária" footer={footer}>
            <form id="edit-account-form" onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome da Conta</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banco</label>
                    <input type="text" value={bank} onChange={(e) => setBank(e.target.value)} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Saldo Inicial</label>
                    <input type="text" value={initialBalance} onChange={(e) => setInitialBalance(formatInputMoney(e.target.value))} className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" required />
                </div>
            </form>
        </Modal>
    );
};
