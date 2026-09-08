import React, { useMemo, useState, useEffect } from 'react';
import { useFinancialData } from '../context/FinancialDataContext';
import { TransactionType } from '../types';
import type { Transaction } from '../types';
import { formatCurrency, formatDate, dateKey } from '../utils/formatters';
import { ArrowDownIcon, ArrowUpIcon, BankIcon, DollarSignIcon, WalletIcon, TrendingUpIcon, AlertTriangleIcon, TrophyIcon } from './icons';
import { Modal } from './shared/Modal';
import { GoalsWidget } from './GoalsWidget';
import { MeiMonitoringWidget } from './MeiMonitoringWidget';
import { PayablesList } from './PayablesList';
import { ReceivablesList } from './ReceivablesList';
import { MonthlyBalance } from './MonthlyBalance';
import { CashFlowWidget } from './CashFlowWidget';
import { TransactionItem } from './TransactionItem';
import { FinancialProgressionChart } from './FinancialProgressionChart';
import { MonthlyEvolutionChart } from './MonthlyEvolutionChart';
import { KpiCard } from './KpiCard';
import { AccountsList } from './AccountsList';
import { InvestmentSummary } from './InvestmentSummary';
import { DocsCountCard } from './DocsCountCard';
import { ExpenseByCategoryChart } from './ExpenseByCategoryChart';
import { CategoryBudgetsWidget } from './CategoryBudgetsWidget';
import { AccountBalancesWidget } from './AccountBalancesWidget';
import { RecentTransactionsWidget } from './RecentTransactionsWidget';

const Dashboard: React.FC = () => {
    const { totalBalance, netWorth, transactions, accounts, categories, isPrivacyMode, investments, planInfo, organizationInfo, isMei, capabilities, viewMode } = useFinancialData();

    
    // Use backend-driven capabilities
    const canInvestments = capabilities?.canAccessInvestments;
    const canFinanceAccounting = capabilities?.canAccessFinance;
    
    // UI State
    const [mbSummary, setMbSummary] = useState<{ month: string; income: number; expense: number; net: number; openPayables: number; openReceivables: number; projectionNetAfterOpen: number } | null>(null);
    const [listReloadKey, setListReloadKey] = useState(0);
    const [docsCount, setDocsCount] = useState(0);
    const [docsBytes, setDocsBytes] = useState(0);
    const [chartDetails, setChartDetails] = useState<{ title: string; transactions: Transaction[] } | null>(null);
    const [dashObligationsTab, setDashObligationsTab] = useState<'payables' | 'receivables'>('payables');

    // Handlers
    const handleDateSelect = (date: string) => {
        const list = transactions.filter(t => dateKey(t.date) === date);
        setChartDetails({
            title: `Lançamentos em ${formatDate(date)}`,
            transactions: list
        });
    };

    const handleMonthSelect = (monthKey: string) => {
        const [year, month] = monthKey.split('-').map(Number);
        const list = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === year && d.getMonth() === month;
        });
        const dateObj = new Date(year, month, 1);
        const monthName = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        setChartDetails({
            title: `Lançamentos de ${monthName}`,
            transactions: list
        });
    };

    const handleCategorySelect = (data: any) => {
         const categoryName = data.name;
         const now = new Date();
         const currentMonth = now.getMonth();
         const currentYear = now.getFullYear();
         
         const list = transactions.filter(t => {
            const d = new Date(t.date);
            return t.category === categoryName && 
                   d.getMonth() === currentMonth && 
                   d.getFullYear() === currentYear &&
                   t.transactionType === TransactionType.EXPENSE;
         });
         
         setChartDetails({
             title: `Despesas: ${categoryName}`,
             transactions: list
         });
    };

    // Auth headers: read token fresh each call (not cached via useMemo)
    const buildAuthHeaders = (): Record<string,string> | null => {
        const headers: Record<string,string> = { 'content-type': 'application/json' };
        try { 
            const t = window.localStorage.getItem('gestor_financeiro_app_token') || window.localStorage.getItem('financeplus_app_token') || ''; 
            if (!t) return null; // Token not ready yet
            headers['authorization'] = `Bearer ${t}`; 
        } catch { return null; }
        if (viewMode) headers['x-view-mode'] = viewMode;
        return headers;
    };

    // Effects
    useEffect(() => {
        const headers = buildAuthHeaders();
        if (!headers) return; // Auth not ready, will re-trigger when transactions.length changes
        (async () => {
            try {
                const q = new URLSearchParams();
                if (viewMode === 'organization' && organizationInfo?.id) q.set('orgId', String(organizationInfo.id));
                q.set('count', '1');
                const r = await fetch(`/api/fiscal-docs/upload?${q.toString()}`, { headers });
                const j = await r.json();
                if (typeof j.count === 'number') {
                    setDocsCount(j.count);
                    setDocsBytes(typeof j.bytes === 'number' ? j.bytes : 0);
                } else if (Array.isArray(j.rows)) {
                    setDocsCount(j.rows.length);
                    setDocsBytes(0);
                } else {
                    setDocsCount(0);
                    setDocsBytes(0);
                }
            } catch {
                setDocsCount(0);
                setDocsBytes(0);
            }
        })();
    }, [organizationInfo?.id, viewMode, transactions.length]);

    // Dashboard data loading: single balance_monthly call returns income, expense, openPayables, openReceivables, projectionNetAfterOpen
    const [dashboardReady, setDashboardReady] = useState(false);
    useEffect(() => {
        const headers = buildAuthHeaders();
        if (!headers) return; // Auth not ready, will re-trigger after bootstrap sets transactions
        
        let cancelled = false;
        (async () => {
            try {
                const now = new Date();
                const monthKeyStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
                
                const res = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'balance_monthly', data: { month: monthKeyStr } }) });
                const data = await res.json();
                
                if (cancelled) return;
                
                if (data && typeof data === 'object' && !data.error) {
                    // balance_monthly returns: { month, income, expense, net, openPayables, openReceivables, projectionNetAfterOpen }
                    setMbSummary({
                        month: data.month,
                        income: Number(data.income || 0),
                        expense: Number(data.expense || 0),
                        net: Number(data.net || 0),
                        openPayables: Number(data.openPayables || 0),
                        openReceivables: Number(data.openReceivables || 0),
                        projectionNetAfterOpen: Number(data.projectionNetAfterOpen || 0),
                    });
                }
                
                setListReloadKey(k => k + 1);
                setDashboardReady(true);
            } catch {
                if (!cancelled) setDashboardReady(true);
            }
        })();
        return () => { cancelled = true; };
    }, [viewMode, organizationInfo?.id, transactions.length]);


    // Calculations
    const { monthlyIncome, monthlyExpense, expenseByCategoryData, categoryBudgets, comparison, savingsRate } = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        const previousDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonth = previousDate.getMonth();
        const previousYear = previousDate.getFullYear();

        let income = 0;
        let expense = 0;
        let prevIncome = 0;
        let prevExpense = 0;
        const expenseByCategory: { [key: string]: number } = {};
        
        transactions.forEach(t => {
            const k = dateKey(t.date);
            const parts = k.split('-').map(p => parseInt(p, 10));
            const tMonth = parts[1]-1;
            const tYear = parts[0];
            
            // Current Month Logic
            if (tMonth === currentMonth && tYear === currentYear) {
                if (t.transactionType === TransactionType.INCOME) {
                    income += t.amount;
                } else if (t.transactionType === TransactionType.EXPENSE) {
                    expense += t.amount;
                    expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + t.amount;
                }
            } 
            // Previous Month Logic
            else if (tMonth === previousMonth && tYear === previousYear) {
                 if (t.transactionType === TransactionType.INCOME) prevIncome += t.amount;
                 if (t.transactionType === TransactionType.EXPENSE) prevExpense += t.amount;
            }
        });

        const expenseData = Object.entries(expenseByCategory).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);

        // Budgets
        const budgets = categories
            .filter(c => c.type === 'Saída' && c.budget && c.budget > 0)
            .map(c => {
                const spent = expenseByCategory[c.name] || 0;
                return {
                    name: c.name,
                    spent,
                    limit: c.budget!,
                    percent: Math.min((spent / c.budget!) * 100, 100)
                };
            })
            .sort((a, b) => b.percent - a.percent);
            
        // Comparison Stats
        const calcChange = (curr: number, prev: number) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return ((curr - prev) / prev) * 100;
        };
        
        const incomeChange = calcChange(income, prevIncome);
        const expenseChange = calcChange(expense, prevExpense);
        const currSavingsRate = income > 0 ? (income - expense) / income : 0;
        const prevSavingsRate = prevIncome > 0 ? (prevIncome - prevExpense) / prevIncome : 0;
        const savingsRateChange = (currSavingsRate - prevSavingsRate) * 100;

        return { 
            monthlyIncome: income, 
            monthlyExpense: expense, 
            expenseByCategoryData: expenseData, 
            categoryBudgets: budgets,
            comparison: { incomeChange, expenseChange, savingsRateChange },
            savingsRate: currSavingsRate
        };
    }, [transactions, categories]);
    
    // UI Helpers
    const showExpensesCard = useMemo(() => expenseByCategoryData.length > 0, [expenseByCategoryData.length]);
    
    const showInvestmentsCard = useMemo(() => canInvestments && (investments?.length || 0) > 0, [canInvestments, investments?.length]);
    const showAccountsCard = useMemo(() => (accounts?.length || 0) > 0, [accounts?.length]);
    const showGoalsCard = true;
    
    const groupCount = (showExpensesCard ? 1 : 0) + (showInvestmentsCard ? 1 : 0) + (showAccountsCard ? 1 : 0) + (showGoalsCard ? 1 : 0);
    const groupClass = groupCount >= 4
        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
        : groupCount === 3
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
            : groupCount === 2
                ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
                : 'grid grid-cols-1 gap-6';
    
    return (
        <div className="space-y-8 animate-fade-in pb-8">
            <div className="flex items-end justify-between mb-8">
                <div className="flex flex-col gap-1">
                    <h1 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Dashboard Executivo</h1>
                    <h2 className="text-2xl font-black text-[#020617] dark:text-white tracking-tight">Visão Geral</h2>
                </div>
            </div>

            {/* Section: Overview Principal */}
            <section aria-labelledby="overview-title">
                <div className="flex items-center justify-between mb-6">
                    <h2 id="overview-title" className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Visão Geral de Patrimônio</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    <KpiCard 
                        title="Patrimônio Líquido" 
                        value={formatCurrency(netWorth)} 
                        icon={<BankIcon className="h-6 w-6" />} 
                        subtext="Ativos + Disponível" 
                        isPrivacyMode={isPrivacyMode}
                        variant="primary"
                        color="indigo"
                    />
                    <KpiCard 
                        title="Saldo em Contas" 
                        value={formatCurrency(totalBalance)} 
                        icon={<WalletIcon className="h-6 w-6" />} 
                        subtext="Disponível imediato"
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="blue"
                    />
                    <KpiCard 
                        title="Receitas do Mês" 
                        value={formatCurrency(monthlyIncome)} 
                        icon={<ArrowUpIcon className="h-6 w-6" />} 
                        subtext={`${comparison.incomeChange >= 0 ? '↑' : '↓'} ${Math.abs(comparison.incomeChange).toFixed(1)}% vs anterior`}
                        subtextColor={comparison.incomeChange >= 0 ? "text-emerald-500" : "text-rose-500"}
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="green"
                    />
                    <KpiCard 
                        title="Despesas do Mês" 
                        value={formatCurrency(monthlyExpense)} 
                        icon={<ArrowDownIcon className="h-6 w-6" />} 
                        subtext={`${comparison.expenseChange >= 0 ? '↑' : '↓'} ${Math.abs(comparison.expenseChange).toFixed(1)}% vs anterior`}
                        subtextColor={comparison.expenseChange > 0 ? "text-rose-500" : "text-emerald-500"} 
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="rose"
                    />
                    <KpiCard 
                        title="Contas a Pagar" 
                        value={formatCurrency(mbSummary?.openPayables || 0)} 
                        icon={<AlertTriangleIcon className="h-6 w-6" />} 
                        subtext="Vencimento este mês"
                        subtextColor="text-orange-500"
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="amber"
                    />
                    <KpiCard 
                        title="Contas a Receber" 
                        value={formatCurrency(mbSummary?.openReceivables || 0)} 
                        icon={<TrendingUpIcon className="h-6 w-6" />} 
                        subtext="Previsto este mês"
                        subtextColor="text-emerald-500"
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="blue"
                    />
                     <KpiCard 
                        title="Projeção Mensal" 
                        value={formatCurrency(mbSummary?.projectionNetAfterOpen || 0)} 
                        icon={<DollarSignIcon className="h-6 w-6" />} 
                        subtext="Saldo final projetado"
                        subtextColor={(mbSummary?.projectionNetAfterOpen || 0) >= 0 ? "text-emerald-500" : "text-rose-500"}
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                        color="indigo"
                    />
                     <KpiCard 
                        title="Taxa de Poupança" 
                        value={`${(savingsRate * 100).toFixed(1)}%`} 
                        icon={<TrophyIcon className="h-6 w-6" />} 
                        subtext={`${comparison.savingsRateChange >= 0 ? '↑' : '↓'} ${Math.abs(comparison.savingsRateChange).toFixed(1)}% vs anterior`}
                        subtextColor={comparison.savingsRateChange >= 0 ? "text-emerald-500" : "text-rose-500"}
                        isPrivacyMode={isPrivacyMode}
                        density="compact"
                    />
                </div>
            </section>

            {/* Section: Fluxo e Inteligência */}
            <section aria-labelledby="flow-title">
                <div className="flex items-center justify-between mb-3">
                    <h2 id="flow-title" className="text-label-caps !text-slate-400">Projeção e Inteligência Financeira</h2>
                </div>
                <div className="space-y-4">
                    {/* Smart Layout Adaptation based on MEI status */}
                    {isMei ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className="lg:col-span-8">
                                <CashFlowWidget />
                            </div>
                            <div className="lg:col-span-4 flex flex-col gap-4">
                                <MeiMonitoringWidget />
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <CashFlowWidget />
                        </div>
                    )}
                </div>
            </section>

            {/* Section: Gestão Operacional (Hollow Style com Matriz de 3 Zonas) */}
            <section aria-labelledby="ops-title">
                <div className="flex items-center justify-between mb-5 px-1">
                    <div className="flex flex-col gap-1">
                        <h2 id="ops-title" className="text-label-caps !text-slate-400">Fluxo de Trabalho e Patrimônio</h2>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Gestão de Pendências e Ativos</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold px-2 py-0.5 rounded border border-slate-100 dark:border-slate-800">Gestão operacional</span>
                </div>
                <div className="space-y-8">
                    {/* Camada 1: Operações de Curto Prazo */}
                    <div className="space-y-4">
                        {canFinanceAccounting && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                                {/* Tab Selector */}
                                <div className="flex items-center gap-2 px-5 pt-4 pb-2 border-b border-slate-100 dark:border-slate-700/60">
                                    <button
                                        onClick={() => setDashObligationsTab('payables')}
                                        className={`inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${
                                            dashObligationsTab === 'payables'
                                                ? 'bg-rose-500 text-white shadow-sm shadow-rose-200/50'
                                                : 'text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20'
                                        }`}
                                    >
                                        🔴 Contas a Pagar
                                        {(mbSummary?.openPayables || 0) > 0 && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                                dashObligationsTab === 'payables' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-600'
                                            }`}>
                                                R$ {(mbSummary?.openPayables || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setDashObligationsTab('receivables')}
                                        className={`inline-flex items-center gap-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${
                                            dashObligationsTab === 'receivables'
                                                ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200/50'
                                                : 'text-slate-500 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                        }`}
                                    >
                                        🟢 Contas a Receber
                                        {(mbSummary?.openReceivables || 0) > 0 && (
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${
                                                dashObligationsTab === 'receivables' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-600'
                                            }`}>
                                                R$ {(mbSummary?.openReceivables || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </span>
                                        )}
                                    </button>
                                </div>
                                {/* Lists — both stay mounted, CSS toggles visibility to avoid remount */}
                                <div className={dashObligationsTab === 'payables' ? 'block' : 'hidden'}>
                                    <PayablesList readOnly reloadKey={listReloadKey} />
                                </div>
                                <div className={dashObligationsTab === 'receivables' ? 'block' : 'hidden'}>
                                    <ReceivablesList readOnly reloadKey={listReloadKey} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Camada 2: Patrimônio e Evolução */}
                    <div className="space-y-6">
                        {/* Status de Patrimônio (3 Cards Independentes) */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <AccountBalancesWidget accounts={accounts} />
                            <InvestmentSummary />
                            <DocsCountCard count={docsCount} bytes={docsBytes} scope={viewMode === 'organization' ? 'org' : 'personal'} />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <MonthlyEvolutionChart onMonthSelect={handleMonthSelect} />
                            <FinancialProgressionChart onDateSelect={handleDateSelect} />
                        </div>

                        {/* Detalhe de Despesas */}
                        {showExpensesCard && (
                            <ExpenseByCategoryChart 
                                data={expenseByCategoryData} 
                                monthlyExpense={monthlyExpense} 
                                onCategorySelect={handleCategorySelect} 
                            />
                        )}
                    </div>

                    {/* Camada 3: Atividade e Planejamento */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <RecentTransactionsWidget transactions={transactions} categories={categories} />
                            <GoalsWidget />
                        </div>
                    </div>
                </div>
            </section>

            {/* Section: Planejamento e Outros Widgets (Hollow Style) */}
            <section aria-labelledby="planning-title">
                <div className="flex items-center justify-between mb-5 px-1">
                    <div className="flex flex-col gap-1">
                        <h2 id="planning-title" className="text-label-caps !text-slate-400">Análise de Rendimento</h2>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Balanço e Performance Semanal</p>
                    </div>
                </div>
                <div className="space-y-8">
                    {/* Camada 1: Balanço Macro Mensal */}
                    <MonthlyBalance cardsOnly />
                </div>
            </section>

            <Modal isOpen={!!chartDetails} onClose={() => setChartDetails(null)} title={chartDetails?.title || ''}>
                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                    {chartDetails?.transactions.length === 0 ? (
                        <div className="text-sm text-gray-600 dark:text-gray-300 text-center py-4">Nenhum lançamento encontrado.</div>
                    ) : (
                        chartDetails?.transactions.map(t => {
                            const cat = categories.find(c => c.name === t.category);
                            return <TransactionItem key={t.id} transaction={t} categoryIcon={cat?.icon} />
                        })
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default Dashboard;
