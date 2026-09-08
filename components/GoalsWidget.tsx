
import React, { useMemo, useState } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TargetIcon, PlusIcon, EditIcon, TrashIcon, TrophyIcon } from './icons';
import { StatusTag } from './ui/StatusTag';
import { formatCurrency, formatInputMoney, toNumberPtBr } from '../utils/formatters';
import { TransactionType } from '../types';
import { AddTransactionModal } from './AddTransactionModal';
import { Modal } from './shared/Modal';
import { EmptyState } from './ui/EmptyState';

export const GoalsWidget: React.FC = () => {
    const { goals, addGoal, updateGoal, deleteGoal, transactions, categories, accounts, accountBalances, userPreferences } = useFinancialData();
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isContribOpen, setIsContribOpen] = useState(false);
    const [contribInitial, setContribInitial] = useState<any>(null);
    const [destAccountId, setDestAccountId] = useState<string>('');
    const [preferredPct, setPreferredPct] = useState<string>('');
    const [delGoalOpen, setDelGoalOpen] = useState(false);
    const [delGoalId, setDelGoalId] = useState<string | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [currentAmount, setCurrentAmount] = useState('');
    const [deadline, setDeadline] = useState('');

    const resetForm = () => {
        setName('');
        setTargetAmount('');
        setCurrentAmount('');
        setDeadline('');
        setIsAdding(false);
        setEditingId(null);
    };

    const handleStartEdit = (goal: any) => {
        setName(goal.name);
        setTargetAmount(String(goal.targetAmount));
        setCurrentAmount(String(goal.currentAmount));
        setDeadline(goal.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '');
        setEditingId(goal.id);
        setIsAdding(true);
        setDestAccountId(goal.destAccountId || '');
        setPreferredPct(goal.preferredContributionPct ? String(goal.preferredContributionPct) : '');
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingId) {
            updateGoal(editingId, {
                name,
                targetAmount: toNumberPtBr(targetAmount),
                currentAmount: toNumberPtBr(currentAmount),
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
                destAccountId: destAccountId || undefined,
                preferredContributionPct: preferredPct ? parseFloat(preferredPct) : undefined
            });
        } else {
            addGoal({
                name,
                targetAmount: toNumberPtBr(targetAmount),
                currentAmount: toNumberPtBr(currentAmount),
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
                color: `#${Math.floor(Math.random()*16777215).toString(16)}`,
                destAccountId: destAccountId || undefined,
                preferredContributionPct: preferredPct ? parseFloat(preferredPct) : undefined
            });
        }
        resetForm();
    };

    const monthlyIncome = useMemo(() => {
        const now = new Date();
        const m = now.getMonth();
        const y = now.getFullYear();
        return transactions.filter(t => {
            const d = new Date(t.date);
            return t.transactionType === TransactionType.INCOME && d.getMonth() === m && d.getFullYear() === y;
        }).reduce((s, t) => s + t.amount, 0);
    }, [transactions]);

    const deleteFooter = (
        <div className="flex items-center justify-end gap-2 w-full">
            <button onClick={() => { setDelGoalOpen(false); setDelGoalId(null); }} className="px-3 py-2 rounded-md text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white">Cancelar</button>
            <button onClick={() => { const id = delGoalId; setDelGoalOpen(false); setDelGoalId(null); if (id) deleteGoal(id); }} className="px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700">Excluir</button>
        </div>
    );

    return (
        <>
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-4 xl:p-6 rounded-lg shadow-lg h-[15rem] md:h-[17.5rem] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center">
                    <TargetIcon className="h-6 w-6 text-indigo-500 dark:text-indigo-400 mr-3" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Metas Financeiras</h3>
                </div>
                {!isAdding && (
                    <button 
                        onClick={() => setIsAdding(true)} 
                        className="p-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                        title="Nova Meta"
                    >
                        <PlusIcon className="h-5 w-5" />
                    </button>
                )}
            </div>

            {isAdding ? (
                <form onSubmit={handleSubmit} className="mb-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-md border border-gray-200 dark:border-gray-600 flex-1 overflow-y-auto">
                    <div className="space-y-2">
                        <input 
                            type="text" 
                            placeholder="Nome da Meta (ex: Viagem)" 
                            value={name} 
                            onChange={e => setName(e.target.value)} 
                            className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100"
                            required
                        />
                         <div className="flex gap-2">
                            <input 
                                type="text" 
                                placeholder="Meta (R$)" 
                                value={targetAmount} 
                                onChange={e => setTargetAmount(formatInputMoney(e.target.value))} 
                                className="w-1/2 p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100"
                                required
                            />
                            <input 
                                type="text" 
                                placeholder="Atual (R$)" 
                                value={currentAmount} 
                                onChange={e => setCurrentAmount(formatInputMoney(e.target.value))} 
                                className="w-1/2 p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100"
                                required
                            />
                        </div>
                        <input 
                            type="date" 
                            value={deadline} 
                            onChange={e => setDeadline(e.target.value)} 
                            className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white"
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Conta de destino</label>
                                <select 
                                    value={destAccountId}
                                    onChange={e => setDestAccountId(e.target.value)}
                                    className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white"
                                >
                                    <option value="">Selecione...</option>
                                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Alocar % da renda</label>
                            <input 
                                type="number" 
                                min={1} max={90}
                                placeholder="ex: 30" 
                                value={preferredPct} 
                                onChange={e => setPreferredPct(e.target.value)} 
                                className="w-full p-2 text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-white placeholder:opacity-100"
                            />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-2">
                             <button type="button" onClick={resetForm} className="text-xs px-3 py-1 rounded bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">Cancelar</button>
                             <button type="submit" className="text-xs px-3 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-700">Salvar</button>
                        </div>
                    </div>
                </form>
            ) : (
                <div className="space-y-4 flex-1 overflow-y-auto pr-1 custom-scrollbar">
                    {goals.length === 0 && (
                        <EmptyState title="Nenhuma meta definida" icon={<TrophyIcon className="h-6 w-6" />} className="py-8" />
                    )}
                    {goals.slice().sort((a, b) => {
                        const aPct = (a.currentAmount / a.targetAmount) * 100;
                        const bPct = (b.currentAmount / b.targetAmount) * 100;
                        const aOver = a.deadline ? new Date(a.deadline) < new Date() : false;
                        const bOver = b.deadline ? new Date(b.deadline) < new Date() : false;
                        if (aOver !== bOver) return aOver ? -1 : 1;
                        const thr = userPreferences?.goalThreshold ?? 90;
                        const aNear = aPct >= thr;
                        const bNear = bPct >= thr;
                        if (aNear !== bNear) return aNear ? -1 : 1;
                        return bPct - aPct;
                    }).map(goal => {
                        const percentRaw = (goal.currentAmount / goal.targetAmount) * 100;
                        const percent = Math.min(Math.max(percentRaw, 0), 150);
                        const isCompleted = percentRaw >= 100;
                        const nearThreshold = userPreferences?.goalThreshold ?? 90;
                        const isNear = !isCompleted && percentRaw >= nearThreshold;
                        const isOverDeadline = goal.deadline ? new Date(goal.deadline) < new Date() : false;
                        const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
                        const monthsLeft = (() => {
                            if (!goal.deadline) return 0;
                            const now = new Date();
                            const end = new Date(goal.deadline);
                            if (end <= now) return 0;
                            const years = end.getFullYear() - now.getFullYear();
                            const months = end.getMonth() - now.getMonth();
                            const total = years * 12 + months;
                            return Math.max(1, total);
                        })();
                        const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
                        const thresholdPct = typeof goal.preferredContributionPct === 'number' && goal.preferredContributionPct > 0 ? goal.preferredContributionPct : 30;
                        const thresholdAmount = monthlyIncome * (thresholdPct / 100);
                        const viability = (() => {
                            if (isCompleted) return '';
                            if (monthsLeft === 0) return '';
                            if (monthlyIncome <= 0) return 'Sem renda';
                            return requiredMonthly > thresholdAmount ? 'Desafiador' : 'Viável';
                        })();
                        return (
                            <div key={goal.id} className="relative group">
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                        {goal.name}
                                        {isCompleted && <TrophyIcon className="h-4 w-4 text-yellow-500" />}
                                        {!isCompleted && isNear && <StatusTag type="warning">Atenção</StatusTag>}
                                        {!isCompleted && isOverDeadline && <StatusTag type="error">Prazo vencido</StatusTag>}
                                        {!isCompleted && viability && (
                                            <StatusTag type={viability === 'Desafiador' ? 'warning' : viability === 'Viável' ? 'success' : 'default'}>{viability}</StatusTag>
                                        )}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
                                    </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden relative shadow-inner">
                                    <div 
                                        className={`h-full rounded-full transition-all duration-700 ease-out relative ${isCompleted ? 'bg-gradient-to-r from-green-500 to-green-700' : isNear ? 'bg-yellow-500' : ''}`}
                                        style={{ width: `${percent}%`, backgroundColor: (isCompleted || isNear) ? undefined : (goal.color || '#6366f1') }}
                                    />
                                </div>
                                {!isCompleted && (
                                    <div className="text-[11px] text-gray-600 dark:text-gray-300 mt-1 flex items-center justify-between">
                                        <span>Falta {formatCurrency(remaining)}{goal.deadline ? ` • ${monthsLeft} mês(es)` : ''}</span>
                                        <div className="flex items-center gap-2">
                                        {monthsLeft > 0 && <span title={`Necessário ${formatCurrency(requiredMonthly)} / mês • Renda ${formatCurrency(monthlyIncome)} • Limite ${thresholdPct}% (${formatCurrency(thresholdAmount)})`}>{formatCurrency(requiredMonthly)} / mês</span>}
                                            <button
                                                className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                                                onClick={() => {
                                                    const value = Number((monthsLeft > 0 ? requiredMonthly : remaining).toFixed(2));
                                                    const tokenMatches = ['poup', 'reserva', 'invest', 'poupanca', 'poupança'];
                                                    const dest = goal.destAccountId ? accounts.find(a => a.id === goal.destAccountId) : (accounts.find(a => tokenMatches.some(tok => (a.name || '').toLowerCase().includes(tok))) || accounts[1] || accounts[0]);
                                                    const src = (() => {
                                                        const pairs = accounts.map(a => ({ id: a.id, bal: accountBalances[a.id] ?? a.initialBalance }));
                                                        const sorted = pairs.sort((x,y) => (y.bal - x.bal));
                                                        const candidate = sorted[0]?.id ? accounts.find(a => a.id === sorted[0]!.id) : accounts[0];
                                                        if (candidate?.id === dest?.id) {
                                                            const next = sorted[1]?.id ? accounts.find(a => a.id === sorted[1]!.id) : undefined;
                                                            return next || accounts.find(a => a.id !== dest?.id) || accounts[0];
                                                        }
                                                        return candidate || accounts[0];
                                                    })();
                                                    setContribInitial({
                                                        transactionType: TransactionType.TRANSFER,
                                                        amount: value,
                                                        description: `Contribuição Meta ${goal.name}`,
                                                        category: 'Transferência',
                                                        paymentMethod: 'PIX',
                                                        accountId: src?.id,
                                                        toAccountId: dest?.id,
                                                        inferredAccount: true,
                                                        inferredAccountReason: 'Origem/destino sugeridos por saldo e nome da conta'
                                                    });
                                                    setIsContribOpen(true);
                                                }}
                                            >Aplicar contribuição</button>
                                        </div>
                                    </div>
                                )}
                                <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-white dark:bg-gray-800 pl-2">
                                    <button onClick={() => handleStartEdit(goal)} className="p-1 text-gray-400 hover:text-indigo-500"><EditIcon className="h-4 w-4"/></button>
                                    <button onClick={() => { setDelGoalId(goal.id); setDelGoalOpen(true); }} className="p-1 text-gray-400 hover:text-red-500"><TrashIcon className="h-4 w-4"/></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
        <AddTransactionModal isOpen={isContribOpen} onClose={() => setIsContribOpen(false)} onAddAccount={() => {}} initial={contribInitial || undefined} />
        <Modal isOpen={delGoalOpen} onClose={() => { setDelGoalOpen(false); setDelGoalId(null); }} title="Excluir meta" size="sm" footer={deleteFooter}>
            <div className="space-y-3">
                <p className="text-sm text-gray-800 dark:text-gray-200">Tem certeza que deseja excluir esta meta?</p>
            </div>
        </Modal>
        </>
    );
};
