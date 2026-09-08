import React, { useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import type { Transaction } from '../types';
import { Modal } from './shared/Modal';
import { recordCategoryPreference, recordAccountPreference, recordPaymentPreference } from '../services/marketDataService';
import { toIsoLocalDate, dateKey, formatInputMoney, toNumberPtBr, formatCurrencyForInput } from '../utils/formatters';

interface EditTransactionModalProps {
    isOpen: boolean;
    onClose: () => void;
    transaction: Transaction;
}

const paymentMethodSuggestions = ['PIX', 'Saldo Conta', 'Saldo Conta Investimentos', 'Saldo Corretora', 'Cartão de Débito', 'Cartão de Crédito', 'Dinheiro', 'Transferência Bancária', 'Débito Automático'];

export const EditTransactionModal: React.FC<EditTransactionModalProps> = ({ isOpen, onClose, transaction }) => {
    const { accounts, updateTransaction, categories, costCenters, isMei } = useFinancialData();
    const [transactionType, setTransactionType] = useState<TransactionType>(transaction.transactionType);
    const [accountId, setAccountId] = useState<string>(transaction.accountId);
    const [toAccountId, setToAccountId] = useState<string>(transaction.toAccountId || '');
    const [amount, setAmount] = useState<string>(formatCurrencyForInput(transaction.amount));
    const [description, setDescription] = useState<string>(transaction.description);
    const [category, setCategory] = useState<string>(transaction.category);
    const [paymentMethod, setPaymentMethod] = useState<string>(transaction.paymentMethod);
    const [date, setDate] = useState<string>(dateKey(transaction.date));
    const [costCenterId, setCostCenterId] = useState<string>(transaction.costCenterId || (costCenters[0]?.id || ''));
    const [isBusinessRevenue, setIsBusinessRevenue] = useState(!!transaction.isBusinessRevenue);
    const [isBusinessExpense, setIsBusinessExpense] = useState(!!transaction.isBusinessExpense);

    const availableCategories = categories.filter(c => c.type === transactionType || transactionType === TransactionType.TRANSFER);

    useEffect(() => {
        setTransactionType(transaction.transactionType);
        setAccountId(transaction.accountId);
        setToAccountId(transaction.toAccountId || '');
        setAmount(formatCurrencyForInput(transaction.amount));
        setDescription(transaction.description);
        setCategory(transaction.category);
        setPaymentMethod(transaction.paymentMethod);
        setDate(dateKey(transaction.date));
        setIsBusinessRevenue(!!transaction.isBusinessRevenue);
        setIsBusinessExpense(!!transaction.isBusinessExpense);
    }, [transaction, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const updatedData: Partial<Transaction> = {
            accountId,
            transactionType,
            amount: toNumberPtBr(amount),
            description,
            category,
            paymentMethod,
            date: toIsoLocalDate(date),
            costCenterId,
            isBusinessRevenue: transactionType === TransactionType.INCOME && isBusinessRevenue,
            isBusinessExpense: transactionType === TransactionType.EXPENSE && isBusinessExpense,
            ...(transactionType === TransactionType.TRANSFER && { toAccountId })
        };
        updateTransaction(transaction.id, updatedData);
        try { 
            recordCategoryPreference(description, category); 
            recordAccountPreference(description, accountId); 
            recordPaymentPreference(description, paymentMethod);
        } catch {}
        onClose();
    };

    const inputClasses = "w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500";
    const labelClasses = "block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1";

    const footer = (
        <div className="flex justify-end gap-2 w-full">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md">Cancelar</button>
            <button type="submit" form="edit-transaction-form" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md">Salvar Alterações</button>
        </div>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Editar Lançamento" footer={footer}>
            <form id="edit-transaction-form" onSubmit={handleSubmit} className="space-y-4">
                 <div className="grid grid-cols-3 gap-2 bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
                    {Object.values(TransactionType).map(t => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTransactionType(t)}
                            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${transactionType === t ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
                <div>
                    <label className={labelClasses}>Centro de Custo</label>
                    <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={inputClasses}>
                       {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={labelClasses}>Valor</label>
                        <input type="text" value={amount} onChange={(e) => setAmount(formatInputMoney(e.target.value))} className={inputClasses} required />
                    </div>
                     <div>
                        <label className={labelClasses}>Data</label>
                        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClasses} required />
                    </div>
                </div>
                 <div>
                    <label className={labelClasses}>Descrição</label>
                    <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className={inputClasses} required />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className={labelClasses}>Categoria</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClasses} disabled={transactionType === TransactionType.TRANSFER}>
                           {transactionType === TransactionType.TRANSFER 
                                ? <option>Transferência</option>
                                : availableCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className={labelClasses}>Método de Pagamento</label>
                        <input list="payment-methods" type="text" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={inputClasses} required />
                        <datalist id="payment-methods">
                            {paymentMethodSuggestions.map(p => <option key={p} value={p} />)}
                        </datalist>
                    </div>
                </div>
                <div>
                    <label className={labelClasses}>Conta {transactionType === TransactionType.TRANSFER ? 'de Origem' : ''}</label>
                    <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClasses}>
                       {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                </div>

                {transactionType === TransactionType.TRANSFER && (
                    <div>
                        <label className={labelClasses}>Conta de Destino</label>
                        <select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} className={inputClasses} required>
                             <option value="">Selecione...</option>
                           {accounts.filter(a => a.id !== accountId).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {isMei && transactionType === TransactionType.INCOME && (
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={isBusinessRevenue} onChange={e => setIsBusinessRevenue(e.target.checked)} />
                        Receita empresarial (compõe faturamento MEI)
                    </label>
                )}
                {isMei && transactionType === TransactionType.EXPENSE && (
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <input type="checkbox" checked={isBusinessExpense} onChange={e => setIsBusinessExpense(e.target.checked)} />
                        Despesa empresarial (considerar no resultado MEI)
                    </label>
                )}
            </form>
        </Modal>
    );
};
