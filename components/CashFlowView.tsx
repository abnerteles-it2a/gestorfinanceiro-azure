
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { useCashFlow } from '../hooks/useCashFlow';
import type { Transaction } from '../types';
import { TransactionType } from '../types';
import { formatCurrency, formatDate, dateKey } from '../utils/formatters';
import { isIncomeTx, isTransferTx } from '../utils/transactionHelpers';
import { PlusIcon, TrendingUpIcon } from './icons';
import { ArrowDownIcon, ArrowUpIcon, EditIcon, TrashIcon, SearchIcon, CalendarIcon } from './icons';
import { StatusTag } from './ui/StatusTag';
import { EmptyState } from './ui/EmptyState';

import { KpiCard } from './KpiCard';

interface CashFlowViewProps {
    onEditTransaction: (transaction: Transaction) => void;
}

const CashFlowTransactionItem: React.FC<{ transaction: Transaction, onEdit: () => void, onDelete: () => void }> = ({ transaction, onEdit, onDelete }) => {
    const { accounts } = useFinancialData();
    const account = accounts.find(a => a.id === transaction.accountId);
    const isIncome = isIncomeTx(transaction.transactionType);
    const isTransfer = isTransferTx(transaction.transactionType);
    const isLargeAmount = transaction.amount >= 1000;
    
    let statusType: 'success' | 'error' | 'warning' = 'warning';
    if (isIncome) statusType = 'success';
    else if (!isTransfer) statusType = 'error';

    return (
        <>
        <div className={`hidden sm:grid grid-cols-12 gap-4 items-center py-3 px-4 border-b border-slate-100 dark:border-slate-800/50 last:border-b-0 hover:bg-white dark:hover:bg-slate-800/50 transition-all duration-300 group ${isLargeAmount ? 'bg-slate-50/30 dark:bg-slate-900/10' : ''}`}>
            <div className="col-span-4 flex items-center">
                <div className="flex-shrink-0">
                    <p className={`text-[13px] text-slate-800 dark:text-slate-100 leading-tight transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400 ${isLargeAmount ? 'font-bold' : 'font-semibold'}`}>{transaction.description}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 opacity-80">{transaction.category}</p>
                </div>
            </div>
            <div className="col-span-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight">{account?.name}</div>
            <div className="col-span-2 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight opacity-70">{transaction.paymentMethod}</div>
            <div className="col-span-3 text-right">
                <div className={`inline-block transition-transform duration-300 group-hover:scale-105 ${isLargeAmount ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.04)]' : ''}`}>
                    <StatusTag type={statusType}>
                        <span className={isLargeAmount ? 'font-black' : 'font-bold'}>
                            {isIncome ? '+' : isTransfer ? '' : '-'} {formatCurrency(transaction.amount)}
                        </span>
                    </StatusTag>
                </div>
            </div>
            <div className="col-span-1 text-right sm:opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                <div className="flex items-center justify-end space-x-1">
                    <button onClick={onEdit} className="p-1.5 text-slate-300 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-md transition-all active:scale-95" title="Editar">
                        <EditIcon className="h-4 w-4" />
                    </button>
                    <button onClick={onDelete} className="p-1.5 text-slate-300 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md transition-all active:scale-95" title="Excluir">
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
        <article className={`sm:hidden border-b border-slate-100 p-3 dark:border-slate-800/50 ${isLargeAmount ? 'bg-slate-50/50 dark:bg-slate-900/20' : ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{transaction.description}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{transaction.category}</p>
                </div>
                <StatusTag type={statusType}><span className="font-bold tabular-nums">{isIncome ? '+' : isTransfer ? '' : '-'} {formatCurrency(transaction.amount)}</span></StatusTag>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="truncate">{account?.name || 'Sem conta'} · {transaction.paymentMethod || 'Sem método'}</span>
                <div className="flex shrink-0 items-center gap-1">
                    <button onClick={onEdit} aria-label={`Editar ${transaction.description}`} className="rounded-md p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"><EditIcon className="h-4 w-4" /></button>
                    <button onClick={onDelete} aria-label={`Excluir ${transaction.description}`} className="rounded-md p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><TrashIcon className="h-4 w-4" /></button>
                </div>
            </div>
        </article>
    </>
    );
};

const getCurrentMonthDates = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const start = `${yyyy}-${mm}-01`;
    const lastDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();
    const end = `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
};

const CashFlowView: React.FC<CashFlowViewProps> = ({ onEditTransaction }) => {
    const { accounts, deleteTransaction, costCenters, hasMoreTransactions, loadOlderTransactions, entitlements, usage } = useFinancialData();
    const [selectedAccount, setSelectedAccount] = useState<string>('all');
    const [selectedCostCenter, setSelectedCostCenter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const { start: initialStart, end: initialEnd } = getCurrentMonthDates();
    const [startDate, setStartDate] = useState(initialStart);
    const [endDate, setEndDate] = useState(initialEnd);
    const [loadingMore, setLoadingMore] = useState(false);

    const { 
        transactionsByDay, 
        dailyBalances, 
        sortedDays, 
        filteredTotalBalance, 
        filteredIncome, 
        filteredExpense, 
        isBalanceReal 
    } = useCashFlow({
        accountId: selectedAccount,
        costCenterId: selectedCostCenter,
        searchTerm,
        startDate,
        endDate
    });

    const filteredTransactions = sortedDays.flatMap(day => transactionsByDay[day] || []);

    const PROGRESSIVE_THRESHOLD = 180;
    const INITIAL_TRANSACTION_BUDGET = 120;
    const TRANSACTION_BUDGET_INCREMENT = 100;
    const progressiveRendering = filteredTransactions.length > PROGRESSIVE_THRESHOLD;
    const [transactionBudget, setTransactionBudget] = useState(INITIAL_TRANSACTION_BUDGET);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        setTransactionBudget(INITIAL_TRANSACTION_BUDGET);
    }, [selectedAccount, selectedCostCenter, searchTerm, startDate, endDate, filteredTransactions.length]);

    const daysToRender = useMemo(() => {
        if (!progressiveRendering) return sortedDays;
        let renderedTransactions = 0;
        const visibleDays: string[] = [];
        for (const day of sortedDays) {
            const transactionCount = transactionsByDay[day]?.length || 0;
            if (visibleDays.length > 0 && renderedTransactions + transactionCount > transactionBudget) break;
            visibleDays.push(day);
            renderedTransactions += transactionCount;
        }
        return visibleDays;
    }, [progressiveRendering, sortedDays, transactionsByDay, transactionBudget]);

    const renderedTransactionCount = daysToRender.reduce((total, day) => total + (transactionsByDay[day]?.length || 0), 0);
    useEffect(() => {
        if (!progressiveRendering || renderedTransactionCount >= filteredTransactions.length) return;
        const element = sentinelRef.current;
        if (!element) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting) {
                setTransactionBudget((current) => Math.min(current + TRANSACTION_BUDGET_INCREMENT, filteredTransactions.length));
            }
        }, { rootMargin: '500px 0px', threshold: 0 });
        observer.observe(element);
        return () => observer.disconnect();
    }, [progressiveRendering, renderedTransactionCount, filteredTransactions.length]);
    const txUsed = Number(usage?.transactionsUsed ?? 0);
    const txLimit = Number(entitlements?.limits?.transactionsPerMonth ?? 0);
    const txUnlimited = txLimit >= 1_000_000;
    const txLimitReached = !txUnlimited && txLimit > 0 && txUsed >= txLimit;

    return (
        <div className="space-y-10 pb-8">
            <div className="flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4 px-1">
                <div className="flex flex-col gap-1">
                    <h1 className="text-label-caps !text-slate-400">Fluxo de Caixa Diário</h1>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Controle de Movimentações e Saldo Operacional</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            const header = ['Data','Descrição','Categoria','Centro de Custo','Conta','Método','Tipo','Valor'];
                            const lines = filteredTransactions.map(t => {
                                const k = dateKey(t.date);
                                const acc = accounts.find(a => a.id === t.accountId)?.name || '';
                                const cc = costCenters.find(c => c.id === t.costCenterId)?.name || '';
                                const type = t.transactionType;
                                const amt = formatCurrency(t.amount);
                                return [formatDate(k), t.description, t.category, cc, acc, t.paymentMethod, type, amt].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
                            });
                            const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
                            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'gestor_financeiro_fluxo.csv';
                            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                        }}
                        className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 shadow-sm transition-all"
                    >
                        Exportar CSV
                    </button>
                    <button
                        onClick={() => { if (txLimitReached) return; try { window.dispatchEvent(new CustomEvent('gestor_financeiro_add_tx', { detail: {} })); } catch {} }}
                        disabled={txLimitReached}
                        className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-md bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-60"
                    >
                        Novo Lançamento
                    </button>
                </div>
            </div>

            {/* Toolbar: Filtros Operacionais */}
            <div className="bg-white/80 dark:bg-slate-900/80 p-5 rounded-2xl shadow-sm border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
                     {/* Search */}
                     <div className="relative w-full flex-1 min-w-0 sm:min-w-[240px]">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                            <SearchIcon className="h-4 w-4 text-slate-400 opacity-60" />
                        </div>
                        <input 
                            type="text" 
                            placeholder="Pesquisar movimentação..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 rounded-xl py-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all placeholder:text-slate-400 placeholder:font-medium"
                        />
                    </div>

                    {/* Date Range Group */}
                    <div className="flex w-full items-center gap-2 px-3 py-2.5 sm:w-auto sm:gap-3 sm:px-4 bg-slate-50 dark:bg-slate-950/50 rounded-xl border border-slate-100 dark:border-slate-800/80">
                        <CalendarIcon className="h-4 w-4 text-slate-400" />
                        <div className="flex items-center gap-2">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-[11px] font-black text-indigo-600 dark:text-indigo-400 focus:ring-0 uppercase tracking-tight" />
                            <span className="text-[10px] text-slate-300 font-black px-1">—</span>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-[11px] font-black text-indigo-600 dark:text-indigo-400 focus:ring-0 uppercase tracking-tight" />
                        </div>
                    </div>

                    {/* Select Group */}
                    <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1">
                            <select 
                                value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 rounded-xl px-4 py-2.5 text-[11px] font-black text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all uppercase tracking-tight"
                            >
                                <option value="all">TODAS AS CONTAS</option>
                                {accounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <select 
                                value={selectedCostCenter} onChange={(e) => setSelectedCostCenter(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-800/80 rounded-xl px-4 py-2.5 text-[11px] font-black text-slate-600 dark:text-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all uppercase tracking-tight"
                            >
                                <option value="all">TODOS OS CENTROS</option>
                                {costCenters.map(cc => <option key={cc.id} value={cc.id}>{cc.name.toUpperCase()}</option>)}
                            </select>
                        </div>
                    </div>

                    {(searchTerm || startDate !== initialStart || endDate !== initialEnd) && (
                        <button onClick={() => { setSearchTerm(''); setStartDate(initialStart); setEndDate(initialEnd); }} className="text-[9px] uppercase font-black tracking-[0.2em] text-red-500 hover:text-red-600 px-3 py-2 bg-red-50 dark:bg-red-900/10 rounded-lg transition-all active:scale-95">
                            LIMPAR
                        </button>
                    )}
                </div>
            </div>

            {/* Scorecard Summary Layer */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <KpiCard 
                    title={selectedCostCenter !== 'all' ? 'Saldo do Centro' : 'Saldo Final do Fluxo'} 
                    value={formatCurrency(filteredTotalBalance)} 
                    icon={<TrendingUpIcon className="h-5 w-5 text-white" />} 
                    subtext={selectedAccount === 'all' ? 'Consolidado Geral' : `Conta: ${accounts.find(a => a.id === selectedAccount)?.name}`}
                    variant="primary"
                    color="indigo"
                />
                <KpiCard 
                    title="Entradas no Período" 
                    value={formatCurrency(filteredIncome)} 
                    icon={<ArrowUpIcon className="h-5 w-5 text-emerald-500" />} 
                    subtext={filteredIncome > 0 ? "Totalizador de receitas capturadas" : "Nenhuma receita no período filtrado"}
                    color="green"
                />
                <KpiCard 
                    title="Saídas no Período" 
                    value={formatCurrency(filteredExpense)} 
                    icon={<ArrowDownIcon className="h-5 w-5 text-rose-500" />} 
                    subtext={filteredExpense > 0 ? "Totalizador de despesas pagas" : "Nenhuma despesa no período filtrado"}
                    color="rose"
                />
            </div>

            {/* Workbench: Lista de Transações */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="grid grid-cols-12 gap-4 p-4 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="col-span-4">Descrição</div>
                    <div className="col-span-2">Conta</div>
                    <div className="col-span-2">Método</div>
                    <div className="col-span-3 text-right">Valor</div>
                    <div className="col-span-1 text-right">Ações</div>
                </div>
                
                {daysToRender.length === 0 ? (
                    <EmptyState
                        title="Nenhuma movimentação encontrada"
                        description="Tente ajustar os filtros ou adicione um novo lançamento."
                    />
                ) : (
                    daysToRender.map(dateKey => (
                        <div key={dateKey}>
                            <div className="hidden sm:grid grid-cols-12 items-center px-4 py-2.5 sticky top-16 z-20 border-y border-slate-200/60 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md transition-colors">
                                <h3 className="col-span-4 text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{formatDate(dateKey)}</h3>
                                <div className="col-span-4" />
                                <div className="col-span-3 text-right">
                                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 mr-2 opacity-60">Saldo do Dia:</span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(dailyBalances[dateKey] ?? 0)}</span>
                                </div>
                                <div className="col-span-1 text-right">
                                    <button
                                        onClick={() => { try { window.dispatchEvent(new CustomEvent('gestor_financeiro_add_tx', { detail: { date: dateKey } })); } catch {} }}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] rounded-md bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm transition-all active:scale-95"
                                        aria-label="Adicionar lançamento neste dia"
                                    >
                                        <PlusIcon className="h-3 w-3" /> Novo
                                    </button>
                                </div>
                            </div>
                            <div className="sm:hidden bg-white/80 dark:bg-slate-900/80 p-3 sticky top-16 z-20 border-y border-slate-200/60 dark:border-slate-800/60 backdrop-blur-md">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{formatDate(dateKey)}</h3>
                                    <button
                                        onClick={() => { try { window.dispatchEvent(new CustomEvent('gestor_financeiro_add_tx', { detail: { date: dateKey } })); } catch {} }}
                                        className="p-1 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 active:scale-90"
                                        aria-label="Novo lançamento"
                                    >
                                        <PlusIcon className="h-3 w-3" />
                                    </button>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <span className="text-[9px] uppercase font-black tracking-widest text-slate-400 opacity-60">Saldo Operacional</span>
                                    <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">{formatCurrency(dailyBalances[dateKey] ?? 0)}</span>
                                </div>
                            </div>
                            {transactionsByDay[dateKey].map(t => (
                                <CashFlowTransactionItem 
                                    key={t.id} 
                                    transaction={t} 
                                    onEdit={() => onEditTransaction(t)} 
                                    onDelete={() => deleteTransaction(t.id)}
                                />
                            ))}
                        </div>
                    ))
                )}
                {hasMoreTransactions && !searchTerm && !startDate && !endDate && (
                    <div className="p-6 flex justify-center border-t border-slate-100 dark:border-slate-800 bg-slate-50/30">
                        <button
                            onClick={async () => { if (loadingMore) return; setLoadingMore(true); try { await (loadOlderTransactions?.()); } finally { setLoadingMore(false); } }}
                            className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider rounded-lg bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 shadow-sm transition-all disabled:opacity-50"
                            disabled={loadingMore}
                        >
                            {loadingMore ? 'Processando...' : 'Carregar Lançamentos Anteriores'}
                        </button>
                    </div>
                )}
                {progressiveRendering && (
                    <>
                        <p className="px-4 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400" role="status">
                            Exibindo {renderedTransactionCount} de {filteredTransactions.length} lançamentos. Mais itens serão carregados ao rolar.
                        </p>
                        {renderedTransactionCount < filteredTransactions.length && <div ref={sentinelRef} className="h-8" />}
                    </>
                )}
            </div>
        </div>
    );
};

export default CashFlowView;
