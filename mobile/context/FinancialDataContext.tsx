import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api, financialScope, setFinancialViewMode } from '../services/api';
import { createLatestRequestGuard } from '../utils/financialScope';
import { readFinancialBootstrap, projectFinancialBalance } from '../utils/financialBootstrap';
import { useAuth } from './AuthContext';
import {
    BankAccount, Transaction, Investment, FixedIncomeInvestment,
    Category, Goal, Recurrence, CostCenter, UserPreferences,
    SubscriptionInfo, Entitlements, PlanCapabilities, PlanInfo
} from '../types';

interface FinancialDataContextType {
    accounts: BankAccount[];
    transactions: Transaction[];
    financialTransactions: Transaction[];
    investments: Investment[];
    fixedIncomeInvestments: FixedIncomeInvestment[];
    categories: Category[];
    goals: Goal[];
    costCenters: CostCenter[];
    recurrences: Recurrence[];
    subscriptionInfo: SubscriptionInfo | null;
    entitlements: Entitlements | null;
    capabilities: PlanCapabilities | null;
    planInfo: PlanInfo | null;
    userPreferences: UserPreferences;
    viewMode: 'personal' | 'organization';
    setViewMode: (mode: 'personal' | 'organization') => void;
    refreshData: () => Promise<void>;
    loading: boolean;
    totalBalance: number;
    monthIncome: number;
    monthExpense: number;
    projectedBalance: number;
}

const FinancialDataContext = createContext<FinancialDataContextType | undefined>(undefined);

export const FinancialDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, signOut, token } = useAuth();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [financialTransactions, setFinancialTransactions] = useState<Transaction[]>([]);
    const [monthIncome, setMonthIncome] = useState(0);
    const [monthExpense, setMonthExpense] = useState(0);
    const [loadedScope, setLoadedScope] = useState(-1);
    const requestGuard = useRef(createLatestRequestGuard()).current;
    const signOutRef = useRef(signOut);
    signOutRef.current = signOut;
    const [investments, setInvestments] = useState<Investment[]>([]);
    const [fixedIncomeInvestments, setFixedIncomeInvestments] = useState<FixedIncomeInvestment[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [goals, setGoals] = useState<Goal[]>([]);
    const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
    const [recurrences, setRecurrences] = useState<Recurrence[]>([]);
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);
    const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
    const [capabilities, setCapabilities] = useState<PlanCapabilities | null>(null);
    const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
    const [userPreferences, setUserPreferences] = useState<UserPreferences>({});
    const [viewMode, setViewModeState] = useState<'personal' | 'organization'>('personal');
    const [loading, setLoading] = useState(false);
    const [openPayablesTotal, setOpenPayablesTotal] = useState(0);
    const [openReceivablesTotal, setOpenReceivablesTotal] = useState(0);

    const setViewMode = useCallback((mode: 'personal' | 'organization') => {
        requestGuard.invalidate();
        setFinancialViewMode(mode);
        setViewModeState(mode);
        setLoadedScope(-1);
    }, []);

    const refreshData = useCallback(async () => {
        if (!user || !token) throw new Error('Sessão autenticada necessária.');
        const scope = financialScope.snapshot();
        if (scope.token !== token || scope.viewMode !== viewMode) throw new Error('Visão alterada; atualização cancelada.');
        const latest = requestGuard.begin();
        const isCurrent = () => latest() && financialScope.isCurrent(scope);
        const config = { headers: { Authorization: `Bearer ${token}`, 'x-view-mode': viewMode } };
        try {
            setLoading(true);
            const today = new Date().toISOString().slice(0, 10);
            const endDate = new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10);
            const [response, pRes, rRes] = await Promise.all([
                api.get(`/bootstrap?userId=${user.id}`, config),
                // No status/start filter: include partial and overdue residuals, exclude settled in core.
                api.post('/query', { type: 'payables_list', data: { end_date: endDate } }, config),
                api.post('/query', { type: 'receivables_list', data: { end_date: endDate } }, config),
            ]);
            if (!isCurrent()) throw new Error('Atualização de visão anterior descartada.');
            const data = response.data;
            const complete = readFinancialBootstrap(data);
            if (!Array.isArray(pRes.data?.rows) || !Array.isArray(rRes.data?.rows)) throw new Error('Projeção financeira incompleta.');
            const projection = projectFinancialBalance(today, 0, pRes.data.rows, rRes.data.rows);
            setOpenPayablesTotal(projection.totalProjectedOutflow);
            setOpenReceivablesTotal(projection.totalProjectedInflow);
            setMonthIncome(complete.monthIncome);
            setMonthExpense(complete.monthExpense);
            setLoadedScope(scope.generation);

            // Mapping Logic (Symmetry with Web)
            if (data.accounts) {
                setAccounts(data.accounts.map((a: any) => {
                    const initial = Number(a.initial_balance) || 0;
                    const currentBalance = complete.balances.get(a.id)!;
                    return {
                        id: a.id || String(Math.random()),
                        name: a.name || 'Conta Sem Nome',
                        bank: a.bank || 'Outros',
                        initialBalance: initial,
                        currentBalance,
                    };
                }));
            }

            const mapTransaction = (t: any) => ({
                    id: t.id || String(Math.random()),
                    date: t.date || new Date().toISOString(),
                    accountId: t.account_id || '',
                    transactionType: t.transaction_type || 'Saída',
                    category: t.category || 'Geral',
                    description: t.description || 'Transação',
                    amount: Number(t.amount) || 0,
                    paymentMethod: t.payment_method || 'Dinheiro',
                    costCenterId: t.cost_center_id || '',
                    toAccountId: t.to_account_id || '',
                    isBusinessRevenue: !!t.is_business_revenue,
                    isBusinessExpense: !!t.is_business_expense
                });
            setTransactions(data.transactions.map(mapTransaction));
            setFinancialTransactions(complete.financialTransactions.map(mapTransaction));

            if (data.categories) {
                setCategories(data.categories.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    type: c.type,
                    icon: c.icon,
                    meiCategory: c.mei_category || undefined
                })));
            }

            if (data.subscription) {
                setSubscriptionInfo({
                    provider: data.subscription.provider,
                    status: data.subscription.status,
                    periodStart: data.subscription.period_start,
                    periodEnd: data.subscription.period_end,
                    isTrial: data.subscription.isTrial,
                    isExpired: data.subscription.isExpired,
                    isInsideGrace: data.subscription.isInsideGrace,
                    isTotalBlocked: data.subscription.isTotalBlocked,
                    gracePeriodDays: data.subscription.gracePeriodDays,
                    billingPeriod: data.subscription.billing_period
                });
            }

            if (data.entitlements) setEntitlements(data.entitlements);
            if (data.capabilities) setCapabilities(data.capabilities);
            if (data.plan) setPlanInfo(data.plan);
            if (data.profile?.preferences) setUserPreferences(data.profile.preferences);

            if (data.investments) {
                setInvestments(
                    (data.investments as any[]).map(i => ({
                        id: i.id,
                        type: i.type,
                        ticker: i.ticker,
                        quantity: Number(i.quantity),
                        purchasePrice: Number(i.purchase_price),
                        purchaseDate: i.purchase_date,
                    }))
                );
            }

            // Fixed income comes from a SEPARATE API array, not from investments
            if (data.fixed_income_investments) {
                setFixedIncomeInvestments(
                    (data.fixed_income_investments as any[]).map(i => ({
                        id: i.id,
                        type: 'Renda Fixa' as const,
                        name: i.name || 'Renda Fixa',
                        issuer: i.issuer || '',
                        amountInvested: Number(i.amount_invested ?? 0),
                        yieldRate: i.yield_rate || '',
                        purchaseDate: i.purchase_date,
                        maturityDate: i.maturity_date || '',
                    }))
                );
            }

            if (data.goals) {
                setGoals(data.goals.map((g: any) => ({
                    id: g.id || String(Math.random()),
                    name: g.name || 'Meta',
                    targetAmount: Number(g.target_amount) || 0,
                    currentAmount: Number(g.current_amount) || 0,
                    color: g.color || '#4F46E5'
                })));
            }

            if (data.cost_centers) {
                setCostCenters(data.cost_centers.map((cc: any) => ({
                    id: cc.id,
                    name: cc.name,
                    orgId: cc.org_id
                })));
            }

            if (data.recurrences) {
                setRecurrences(data.recurrences.map((r: any) => ({
                    id: r.id || String(Math.random()),
                    label: r.label || 'Recorrência',
                    amount: Number(r.amount) || 0,
                    category: r.category || 'Outros',
                    accountId: r.account_id || '',
                    paymentMethod: r.payment_method || 'PIX',
                    dayOfMonth: Number(r.day_of_month) || 1,
                    businessDayRule: r.business_day_rule || 'next',
                    costCenterId: r.cost_center_id || '',
                    active: !!r.active
                })));
            }

        } catch (error: any) {
            if (isCurrent()) {
                setLoadedScope(-1);
                if (error.response?.status === 401) void signOutRef.current();
            }
            // Reconciliation must not report success when a complete refresh fails.
            throw error;
        } finally {
            if (isCurrent()) setLoading(false);
        }
    }, [user?.id, token, viewMode, requestGuard]);

    useEffect(() => {
        void refreshData().catch(error => console.warn('Atualização financeira pendente:', error.message));
        return () => requestGuard.invalidate();
    }, [refreshData, requestGuard]);

    const ready = loadedScope === financialScope.snapshot().generation;
    const totalBalance = accounts.reduce((sum, acc) => sum + (acc.currentBalance || 0), 0);
    
    // Projected balance: current balance + open receivables - open payables (next 30d)
    // Mirrors CashFlowWidget web logic (payables_list + receivables_list API)
    const projectedBalance = totalBalance - openPayablesTotal + openReceivablesTotal;

    return (
        <FinancialDataContext.Provider value={{
            accounts: ready ? accounts : [],
            transactions: ready ? transactions : [],
            financialTransactions: ready ? financialTransactions : [],
            investments: ready ? investments : [],
            fixedIncomeInvestments: ready ? fixedIncomeInvestments : [],
            categories: ready ? categories : [],
            goals: ready ? goals : [],
            costCenters: ready ? costCenters : [],
            recurrences: ready ? recurrences : [],
            subscriptionInfo,
            entitlements,
            capabilities,
            planInfo,
            userPreferences,
            viewMode,
            setViewMode,
            refreshData,
            loading,
            totalBalance: ready ? totalBalance : 0,
            monthIncome: ready ? monthIncome : 0,
            monthExpense: ready ? monthExpense : 0,
            projectedBalance: ready ? projectedBalance : 0
        }}>
            {/* A view switch must also discard forms/lists holding IDs from the previous scope. */}
            <React.Fragment key={financialScope.snapshot().generation}>{children}</React.Fragment>
        </FinancialDataContext.Provider>
    );
};

export const useFinancialData = () => {
    const context = useContext(FinancialDataContext);
    if (context === undefined) {
        throw new Error('useFinancialData must be used within a FinancialDataProvider');
    }
    return context;
};
