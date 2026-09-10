


import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';

import { useAuth } from './AuthContext';
import type { BankAccount, Transaction, Investment, Category, FixedIncomeInvestment, Goal, Recurrence, CostCenter, UserPreferences } from '../types';
import { TransactionType, AssetType } from '../types';
import { getMarketData, subscribeToMarketUpdates } from '../services/marketDataService';
import type { MarketData, MarketDataResponse } from '../services/marketDataService';
import { useToast } from './ToastContext';
import { toIsoLocalDate } from '../utils/formatters';

export interface PlanCapabilities {
    canAccessInvestments: boolean;
    canAccessFinance: boolean;
    canAccessDocs: boolean;
    canAccessReports: boolean;
}

// --- INITIAL STATE ---
const defaultCapabilities: PlanCapabilities = {
    canAccessInvestments: true,
    canAccessFinance: true,
    canAccessDocs: true,
    canAccessReports: true
};

const defaultEntitlements: any = {
    modules: {
        investments: true,
        financeAccounting: true,
        docsVault: true,
        reports: true,
        meiMonitoring: true,
        chatAi: true,
        corporateManagement: false
    }
};

const defaultData: {
    accounts: BankAccount[];
    categories: Category[];
    transactions: Transaction[];
    investments: Investment[];
    fixedIncomeInvestments: FixedIncomeInvestment[];
    goals: Goal[];
    costCenters: CostCenter[];
} = {
    accounts: [
        { id: '1', name: 'Itaú Corrente', bank: 'Itaú', initialBalance: 5000 },
        { id: '2', name: 'Nubank NuConta', bank: 'Nubank', initialBalance: 1500 },
    ],
    categories: [
        { id: 'cat1', name: 'Salário', type: 'Entrada', icon: '💰' },
        { id: 'cat2', name: 'Freelance', type: 'Entrada', icon: '💻' },
        { id: 'cat3', name: 'Moradia', type: 'Saída', icon: '🏠' },
        { id: 'cat4', name: 'Alimentação', type: 'Saída', icon: '🍔' },
        { id: 'cat5', name: 'Transporte', type: 'Saída', icon: '🚗' },
        { id: 'cat6', name: 'Lazer', type: 'Saída', icon: '🎉' },
    ],
    transactions: [
        { id: 't1', date: toIsoLocalDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`), accountId: '1', transactionType: TransactionType.INCOME, category: 'Salário', description: 'Salário Mensal', amount: 7500, paymentMethod: 'Transferência Bancária', costCenterId: 'cc_personal' },
        { id: 't2', date: toIsoLocalDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-02`), accountId: '1', transactionType: TransactionType.EXPENSE, category: 'Moradia', description: 'Aluguel', amount: 2000, paymentMethod: 'Débito Automático', costCenterId: 'cc_personal' },
        { id: 't3', date: toIsoLocalDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-05`), accountId: '2', transactionType: TransactionType.EXPENSE, category: 'Alimentação', description: 'Supermercado', amount: 600, paymentMethod: 'Cartão de Débito', costCenterId: 'cc_personal' },
        { id: 't4', date: toIsoLocalDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-10`), accountId: '1', transactionType: TransactionType.TRANSFER, category: 'Transferência', description: 'Transf. para Nubank', amount: 1000, toAccountId: '2', paymentMethod: 'PIX', costCenterId: 'cc_personal' },
        { id: 't5', date: toIsoLocalDate(`${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-12`), accountId: '2', transactionType: TransactionType.INCOME, category: 'Freelance', description: 'Projeto X', amount: 800, paymentMethod: 'PIX', costCenterId: 'cc_business' },
    ],
    investments: [
        { id: 'i1', type: AssetType.STOCK, ticker: 'PETR4', quantity: 100, purchasePrice: 30.50, purchaseDate: toIsoLocalDate('2023-05-10') },
        { id: 'i2', type: AssetType.INTERNATIONAL_STOCK, ticker: 'AAPL', quantity: 10, purchasePrice: 150.00, purchaseDate: toIsoLocalDate('2023-01-15') },
        { id: 'i3', type: AssetType.CRYPTO, ticker: 'BTC', quantity: 0.05, purchasePrice: 45000.00, purchaseDate: toIsoLocalDate('2023-08-20') },
        { id: 'i4', type: AssetType.REAL_ESTATE_FUND, ticker: 'MXRF11', quantity: 200, purchasePrice: 10.50, purchaseDate: toIsoLocalDate('2023-03-22') },
        { id: 'i5', type: AssetType.INTERNATIONAL_STOCK, ticker: 'GOOGL', quantity: 5, purchasePrice: 130.00, purchaseDate: toIsoLocalDate('2023-09-01') },
        { id: 'i6', type: AssetType.REIT, ticker: 'O', quantity: 50, purchasePrice: 60.00, purchaseDate: toIsoLocalDate('2023-02-10') },
    ],
    fixedIncomeInvestments: [
        { id: 'fi1', type: AssetType.FIXED_INCOME, name: 'CDB Liquidez Diária', issuer: 'Banco Inter', amountInvested: 10000, yieldRate: '100% CDI', purchaseDate: toIsoLocalDate('2023-10-01'), maturityDate: toIsoLocalDate('2025-10-01') },
        { id: 'fi2', type: AssetType.FIXED_INCOME, name: 'Tesouro IPCA+ 2029', issuer: 'Tesouro Nacional', amountInvested: 5000, yieldRate: 'IPCA + 5.8%', purchaseDate: toIsoLocalDate('2023-11-15'), maturityDate: toIsoLocalDate('2029-05-15') },
    ],
    goals: [
        { id: 'g1', name: 'Reserva de Emergência', targetAmount: 20000, currentAmount: 5000, color: '#10b981' },
        { id: 'g2', name: 'Viagem Férias', targetAmount: 8000, currentAmount: 2500, color: '#f59e0b' }
    ],
    costCenters: [
        { id: 'cc_personal', name: 'Pessoal' },
        { id: 'cc_business', name: 'Profissional (CNPJ)' }
    ]
};

// Helper to load from local storage with fallback
const loadFromStorage = <T,>(key: string, fallback: T): T => {
    try {
        const stored = localStorage.getItem(`gestor_financeiro_${key}`);
        return stored ? JSON.parse(stored) : fallback;
    } catch (e) {
        console.error(`Error loading ${key} from localStorage`, e);
        return fallback;
    }
};

const saveToStorage = (key: string, value: any) => {
    localStorage.setItem(`gestor_financeiro_${key}`, JSON.stringify(value));
};


// --- CONTEXT ---
export interface SubscriptionInfo {
    provider?: string; 
    status?: string; 
    periodStart?: string | null; 
    periodEnd?: string | null;
    billing_period?: 'monthly' | 'yearly' | 'trial';
    isTrial?: boolean;
    isExpired?: boolean;
    isInsideGrace?: boolean;
    isTotalBlocked?: boolean;
    isOverQuota?: boolean;
    gracePeriodDays?: number;
    trialDaysRemaining?: number;
}

interface FinancialDataContextType {
    accounts: BankAccount[];
    transactions: Transaction[];
    investments: Investment[];
    fixedIncomeInvestments: FixedIncomeInvestment[];
    categories: Category[];
    goals: Goal[];
    costCenters: CostCenter[];
    recurrences: Recurrence[];
    marketData: MarketData;
    marketDataSources: { uri: string; title: string; }[];
    marketDataTs: number;
    isMarketLoading?: boolean;
    refreshMarketData?: (force?: boolean) => Promise<void>;
    hasMoreTransactions?: boolean;
    loadMoreTransactions?: () => Promise<void>;
    loadOlderTransactions?: () => Promise<void>;
    addAccount: (account: Omit<BankAccount, 'id'>) => Promise<void>;
    updateAccount: (id: string, updates: Partial<BankAccount>) => Promise<void>;
    deleteAccount: (id: string) => Promise<void>;
    addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
    updateTransaction: (id: string, updates: Partial<Transaction>) => Promise<void>;
    deleteTransaction: (id: string) => Promise<void>;
    isMei: boolean;
    toggleMei: () => void;
    appendTransactionsLocal?: (txs: Transaction[]) => void;
    addInvestment: (investment: Omit<Investment, 'id'>) => Promise<void>;
    updateInvestment: (id: string, updates: Partial<Investment>) => Promise<void>;
    deleteInvestment: (id: string) => Promise<void>;
    addFixedIncomeInvestment: (investment: Omit<FixedIncomeInvestment, 'id'>) => Promise<void>;
    updateFixedIncomeInvestment: (id: string, updates: Partial<FixedIncomeInvestment>) => Promise<void>;
    deleteFixedIncomeInvestment: (id: string) => Promise<void>;
    addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
    updateCategory: (id: string, updates: Partial<Category>) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;
    addGoal: (goal: Omit<Goal, 'id'>) => Promise<void>;
    updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>;
    deleteGoal: (id: string) => Promise<void>;
    addCostCenter: (cc: Omit<CostCenter, 'id'> & { scope?: 'personal' | 'org' }) => Promise<void>;
    updateCostCenter: (id: string, updates: Partial<CostCenter>) => Promise<void>;
    deleteCostCenter: (id: string) => Promise<void>;
    addRecurrence: (rec: Omit<Recurrence, 'id'>) => Promise<void>;
    updateRecurrence: (id: string, updates: Partial<Recurrence>) => Promise<void>;
    deleteRecurrence: (id: string) => Promise<void>;
    meiOpeningDate?: string;
    setMeiOpeningDate: (date: string) => void;
    totalBalance: number;
    accountBalances: Record<string, number>;
    totalInvested: number;
    portfolioValue: number;
    portfolioPL: number;
    netWorth: number;
    financialScore: number;
    exportData: () => void;
    importData: (jsonString: string) => void;
    isPrivacyMode: boolean;
    togglePrivacyMode: () => void;
    getInsights: () => { type: 'positive' | 'negative' | 'neutral', message: string, icon: string }[];
    organizationInfo?: { id?: string; name?: string; seats?: number; usedSeats?: number } | null;
    orgRole?: string | null;
    planInfo?: { id?: string; name?: string; tier?: string; seats?: number; limits?: { transactions?: number; storage?: string } } | null;
    subscriptionInfo?: SubscriptionInfo | null;
    capabilities: PlanCapabilities;
    entitlements?: any;
    usage?: any;
    viewMode: 'personal' | 'organization';
    toggleViewMode: () => void;
    refreshData: () => void;
    userPreferences: UserPreferences;
    updateUserPreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
    userProfile?: { fullName?: string; document?: string } | null;
    aiInsights: { 
        type: 'positive' | 'negative' | 'neutral', 
        message: string, 
        icon: string, 
        action?: { label: string; actionType: string; params: any },
        isAi?: boolean 
    }[];
    isAiLoading: boolean;
    executeAdvisorAction: (actionType: string, params: any) => Promise<{ success: boolean; error?: string }>;
}

const FinancialDataContext = createContext<FinancialDataContextType | undefined>(undefined);

export const FinancialDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { showToast } = useToast();
    const { user, signOut } = useAuth();
    const dbProvider = 'neon';
    const locked = false;
    const MARKET_CACHE_TTL_DEFAULT = 10 * 60 * 1000;
    
    // View Mode State - Always start 'personal' as per business rules
    const [viewMode, setViewMode] = useState<'personal' | 'organization'>('personal');
    const [viewModeHasInitialized, setViewModeHasInitialized] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [accounts, setAccounts] = useState<BankAccount[]>(() => {
        if (!user) return [];
        return loadFromStorage('accounts', defaultData.accounts);
    });
    const [transactions, setTransactions] = useState<Transaction[]>(() => {
        if (!user) return [];
        return loadFromStorage('transactions', defaultData.transactions);
    });
    const [investments, setInvestments] = useState<Investment[]>(() => {
        if (!user) return [];
        return loadFromStorage('investments', defaultData.investments);
    });
    const [fixedIncomeInvestments, setFixedIncomeInvestments] = useState<FixedIncomeInvestment[]>(() => {
        if (!user) return [];
        return loadFromStorage('fixedIncomeInvestments', defaultData.fixedIncomeInvestments);
    });
    const [categories, setCategories] = useState<Category[]>(() => {
        if (!user) return [];
        return loadFromStorage('categories', defaultData.categories);
    });
    const [goals, setGoals] = useState<Goal[]>(() => {
        if (!user) return [];
        return loadFromStorage('goals', defaultData.goals);
    });
    const [recurrences, setRecurrences] = useState<Recurrence[]>(() => {
        if (!user) return [];
        return loadFromStorage('recurrences', []);
    });
    const [costCenters, setCostCenters] = useState<CostCenter[]>(() => {
        if (!user) return [];
        return loadFromStorage('costCenters', defaultData.costCenters);
    });
    const [isPrivacyMode, setIsPrivacyMode] = useState<boolean>(() => loadFromStorage('privacyMode', false));
    const [isMei, setIsMei] = useState<boolean>(() => loadFromStorage('isMei', false));
    const [meiOpeningDate, setMeiOpeningDateState] = useState<string | undefined>(() => loadFromStorage('meiOpeningDate', undefined));
    
    const [marketData, setMarketData] = useState<MarketData>(() => loadFromStorage('marketData', {}));
    const [marketDataSources, setMarketDataSources] = useState<{ uri: string; title: string; }[]>(() => loadFromStorage('marketDataSources', []));
    const [marketDataTs, setMarketDataTs] = useState<number>(() => loadFromStorage('marketDataTs', 0));
    const [hasMoreTransactions, setHasMoreTransactions] = useState<boolean>(false);
    const [organizationInfo, setOrganizationInfo] = useState<{ id?: string; name?: string; seats?: number; usedSeats?: number } | null>(null);
    const [orgRole, setOrgRole] = useState<string | null>(null);
    const [planInfo, setPlanInfo] = useState<{ id?: string; name?: string; tier?: string; seats?: number; limits?: { transactions?: number; storage?: string } } | null>(() => loadFromStorage('planInfo', null));
    const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(() => loadFromStorage('subscriptionInfo', null));
    const [userPreferences, setUserPreferences] = useState<UserPreferences>(() => loadFromStorage('userPreferences', {}));
    const [capabilities, setCapabilities] = useState<PlanCapabilities>(() => loadFromStorage('capabilities', defaultCapabilities));
    const [entitlements, setEntitlements] = useState<any>(() => loadFromStorage('entitlements', defaultEntitlements));
    const [usage, setUsage] = useState<any>(() => loadFromStorage('usage', null));
    const [userProfile, setUserProfile] = useState<{ fullName?: string; document?: string } | null>(null);
    const [aiInsights, setAiInsights] = useState<{ type: 'positive' | 'negative' | 'neutral', message: string, icon: string }[]>([]);
    const [isAiLoading, setIsAiLoading] = useState(false);

    const readCache = <T,>(key: string, ttlMs: number): T | null => {
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            const ts = Number(obj?.ts || 0);
            if (Number.isFinite(ts) && ts > 0 && (Date.now() - ts) < ttlMs) return obj?.data as T;
        } catch {}
        return null;
    };
    const writeCache = (key: string, data: any) => {
        try { window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
    };
    const isAuthError = (err: any) => {
        try {
            const msg = String((err?.message || err?.error?.message || '')).toLowerCase();
            const status = Number(err?.status || 0);
            return msg.includes('jwt') || msg.includes('permission') || status === 401;
        } catch { return false; }
    };
    const handleAuthError = async (err: any) => {
        if (isAuthError(err)) {
            try { showToast('Sessão expirada. Entre novamente.', 'warning', 'Entrar novamente', () => { try { const el = document.querySelector('input[placeholder="E-mail"]') as HTMLInputElement; el && el.focus(); } catch {} }); } catch {}
            try { await signOut(); } catch {}
            return true;
        }
        return false;
    };

    const getAuthHeaders = async (): Promise<Record<string,string>> => {
        const headers: Record<string,string> = { 'content-type': 'application/json' };
        try {
            const token = window.localStorage.getItem('gestor_financeiro_app_token') || window.localStorage.getItem('financeplus_app_token') || '';
            if (token) headers['authorization'] = `Bearer ${token}`;
            headers['x-view-mode'] = viewMode;
        } catch {}
        return headers;
    };

    const callApi = async (type: string, data: any = {}) => {
        try {
            const headers = await getAuthHeaders();
            headers['x-view-mode'] = viewMode;
            const res = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type, data }) });
            if (res.status === 401) { await signOut(); throw new Error('unauthorized'); }
            if (!res.ok) {
                const errBody = await res.text();
                if (errBody.includes('permission_denied_cc')) {
                    showToast('Você não tem permissão para alterar registros deste Centro de Custo.', 'error');
                } else if (errBody.includes('permission_denied_member')) {
                     showToast('Membros não têm permissão para esta ação.', 'error');
                } else if (errBody.includes('permission_denied')) {
                    showToast('Permissão negada.', 'error');
                } else if (errBody.includes('limit_reached_accounts')) {
                    showToast('Limite de contas bancárias do seu plano atingido. Faça upgrade para adicionar mais contas.', 'error');
                } else if (errBody.includes('limit_reached_cost_centers')) {
                    showToast('Limite de centros de custo do seu plano atingido. Faça upgrade para adicionar mais.', 'error');
                } else if (errBody.includes('limit_reached_transactions_month')) {
                    showToast('Limite de lançamentos do mês atingido. Faça upgrade para continuar lançando.', 'error');
                } else if (errBody.includes('subscription_inactive') || errBody.includes('subscription_expired')) {
                    showToast('Assinatura inativa ou expirada. Atualize seu plano para continuar.', 'error');
                    try {
                        const g: any = globalThis as any;
                        const now = Date.now();
                        if (!g.__gf_last_checkout_nav || now - Number(g.__gf_last_checkout_nav) > 3000) {
                            g.__gf_last_checkout_nav = now;
                            window.dispatchEvent(new CustomEvent('gestor_financeiro_go_checkout', { detail: { reason: errBody.includes('subscription_expired') ? 'expired' : 'inactive' } }));
                        }
                    } catch {}
                }
                console.error('API Error:', res.status, errBody);
                throw new Error(`Request failed: ${res.status} ${errBody}`);
            }
            return await res.json();
        } catch (e) { console.error(e); return { error: e }; }
    };

    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const uid = user.id;
                const cacheKey = `gestor_financeiro_cache_accounts_${uid}_${viewMode}`;
                const ac = readCache<BankAccount[]>(cacheKey, 10 * 60 * 1000);
                if (ac) setAccounts(ac);
                
                const shouldFetchLists = dbProvider !== 'neon';
                const [accRes, txRes, invRes, fiRes, catRes, goalRes, recRes, ccRes, profRes, bootRes] = await Promise.all([
                    shouldFetchLists ? callApi('accounts_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('transactions_list', { limit: 500 }) : Promise.resolve(null),
                    shouldFetchLists ? callApi('investments_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('fixed_income_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('categories_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('goals_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('recurrences_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('cost_centers_list') : Promise.resolve(null),
                    shouldFetchLists ? callApi('profile_get') : Promise.resolve(null),
                    (dbProvider === 'neon') ? fetch(`/api/bootstrap?userId=${encodeURIComponent(uid)}&t=${Date.now()}`, { headers: await getAuthHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null)
                ]);

                if (bootRes) {
                    const j = bootRes;
                    if (j.organization) setOrganizationInfo({ id: j.organization.id, name: j.organization.name, seats: Number(j.organization.seats || 0), usedSeats: Number(j.organization.usedSeats ?? 0) });
                    if (j.org_role) setOrgRole(j.org_role);
                    const effectiveTier = (j.status?.tier || j.plan?.tier || 'starter').toLowerCase();
                    if (j.plan || j.status) {
                        const pInfo = { 
                            id: j.plan?.id, 
                            name: j.plan?.name || (effectiveTier === 'pro' ? 'Pro' : effectiveTier === 'plus' ? 'Plus' : 'Starter'), 
                            tier: effectiveTier,
                            seats: j.entitlements?.limits?.users || (effectiveTier === 'pro' ? 2 : 1),
                            limits: j.plan?.limits
                        };
                        setPlanInfo(pInfo);
                        saveToStorage('planInfo', pInfo);
                    }
                    if (j.subscription) {
                        const sInfo = { 
                            provider: j.subscription.provider, 
                            status: j.subscription.status, 
                            periodStart: j.subscription.period_start, 
                            periodEnd: j.subscription.period_end,
                            billing_period: j.subscription.billing_period,
                            isTrial: j.subscription.isTrial,
                            isExpired: j.subscription.isExpired,
                            isInsideGrace: j.subscription.isInsideGrace,
                            isTotalBlocked: j.subscription.isTotalBlocked,
                            isOverQuota: j.subscription.isOverQuota,
                            gracePeriodDays: j.subscription.gracePeriodDays,
                            trialDaysRemaining: j.subscription.trialDaysRemaining
                        };
                        setSubscriptionInfo(sInfo);
                        saveToStorage('subscriptionInfo', sInfo);
                    }
                    if (j.capabilities) {
                        setCapabilities(j.capabilities);
                        saveToStorage('capabilities', j.capabilities);
                    }
                    if (j.entitlements) {
                        setEntitlements(j.entitlements);
                        saveToStorage('entitlements', j.entitlements);
                    }
                    if (j.usage) {
                        setUsage(j.usage);
                        saveToStorage('usage', j.usage);
                    }
                    if (j.profile) setUserProfile({ fullName: j.profile.full_name, document: j.profile.document });
                    
                    if (j.status) {
                        // Enforce starting viewMode from bootstrap only ONCE per page load
                        if (j.status.viewMode && !viewModeHasInitialized) {
                            setViewMode(j.status.viewMode);
                            saveToStorage('viewMode', j.status.viewMode);
                            setViewModeHasInitialized(true);
                        }
                    }

                    if (j.business_profile) {
                        const isMeiFromBoot = String(j.business_profile).toLowerCase() === 'mei';
                        setIsMei(isMeiFromBoot);
                        saveToStorage('isMei', isMeiFromBoot);
                    }
                    
                    // Sync main lists from bootstrap
                    if (Array.isArray(j.accounts)) {
                        const accList = j.accounts.map((r: any) => ({ id: r.id, name: r.name, bank: r.bank || '', initialBalance: Number(r.initial_balance || 0) }));
                        setAccounts(accList);
                        writeCache(`gestor_financeiro_cache_accounts_${uid}_${viewMode}`, accList);
                    }
                    if (Array.isArray(j.transactions)) {
                        const txList = j.transactions.map((r: any) => ({ 
                            id: r.id, date: r.date, accountId: r.account_id, toAccountId: r.to_account_id || undefined, 
                            transactionType: r.transaction_type, category: r.category, description: r.description || '', 
                            amount: Number(r.amount || 0), paymentMethod: r.payment_method || '', costCenterId: r.cost_center_id || undefined,
                            isBusinessRevenue: !!r.is_business_revenue, isBusinessExpense: !!r.is_business_expense
                        }));
                        setTransactions(txList);
                        setHasMoreTransactions(txList.length === 500);
                    }
                    if (Array.isArray(j.categories)) {
                        const catList = j.categories.map((r: any) => ({ id: r.id, name: r.name, type: r.type, icon: r.icon || '', meiCategory: r.mei_category || undefined }));
                        setCategories(catList);
                        writeCache(`gestor_financeiro_cache_categories_${uid}_${viewMode}`, catList);
                    }
                    if (Array.isArray(j.cost_centers)) {
                        const ccList = j.cost_centers.map((c: any) => ({ id: c.id, name: c.name, orgId: c.org_id }));
                        setCostCenters(ccList);
                        writeCache(`gestor_financeiro_cache_cost_centers_${uid}_${viewMode}`, ccList);
                    }
                    if (Array.isArray(j.investments)) {
                        const invList = j.investments.map((r: any) => ({ id: r.id, type: r.type, ticker: r.ticker || '', quantity: Number(r.quantity || 0), purchasePrice: Number(r.purchase_price || 0), purchaseDate: r.purchase_date || '' }));
                        setInvestments(invList);
                        writeCache(`gestor_financeiro_cache_investments_${uid}_${viewMode}`, invList);
                    }
                    if (Array.isArray(j.fixed_income_investments)) {
                        const fiList = j.fixed_income_investments.map((r: any) => ({ id: r.id, name: r.name, issuer: r.issuer || '', amountInvested: Number(r.amount_invested || 0), yieldRate: r.yield_rate || '', purchaseDate: r.purchase_date || '', maturityDate: r.maturity_date || '' }));
                        setFixedIncomeInvestments(fiList);
                        writeCache(`gestor_financeiro_cache_fixed_income_${uid}_${viewMode}`, fiList);
                    }
                    if (Array.isArray(j.goals)) {
                        const goalList = j.goals.map((r: any) => ({ id: r.id, name: r.name, targetAmount: Number(r.target_amount || 0), currentAmount: Number(r.current_amount || 0), color: r.color || '#22c55e' }));
                        setGoals(goalList);
                        writeCache(`gestor_financeiro_cache_goals_${uid}_${viewMode}`, goalList);
                    }
                    if (Array.isArray(j.recurrences)) {
                        const recList = j.recurrences.map((r: any) => ({ id: r.id, label: r.label || '', amount: Number(r.amount || 0), category: r.category || '', accountId: r.account_id || '', paymentMethod: r.payment_method || '', dayOfMonth: r.day_of_month || undefined, businessDayRule: r.business_day_rule || undefined, costCenterId: r.cost_center_id || undefined, active: !!r.active }));
                        setRecurrences(recList);
                        writeCache(`gestor_financeiro_cache_recurrences_${uid}_${viewMode}`, recList);
                    }
                }

                if (accRes?.rows) {
                    const accList = accRes.rows.map((r: any) => ({ id: r.id, name: r.name, bank: r.bank || '', initialBalance: Number(r.initial_balance || 0) }));
                    setAccounts(accList);
                    writeCache(`gestor_financeiro_cache_accounts_${uid}_${viewMode}`, accList);
                }
                if (txRes?.rows) {
                    const txList = txRes.rows.map((r: any) => ({ 
                        id: r.id, 
                        date: r.date, 
                        accountId: r.account_id, 
                        toAccountId: r.to_account_id || undefined, 
                        transactionType: r.transaction_type, 
                        category: r.category, 
                        description: r.description || '', 
                        amount: Number(r.amount || 0),
                        paymentMethod: r.payment_method || '',
                        costCenterId: r.cost_center_id || undefined,
                        isBusinessRevenue: !!r.is_business_revenue,
                        isBusinessExpense: !!r.is_business_expense
                    }));
                    setTransactions(txList);
                    setHasMoreTransactions(txList.length === 500);
                }
                if (invRes?.rows) {
                    const invList = invRes.rows.map((r: any) => ({ id: r.id, type: r.type, ticker: r.ticker || '', quantity: Number(r.quantity || 0), purchasePrice: Number(r.purchase_price || 0), purchaseDate: r.purchase_date || '' }));
                    setInvestments(invList);
                    writeCache(`gestor_financeiro_cache_investments_${uid}_${viewMode}`, invList);
                }
                if (fiRes?.rows) {
                    const fiList = fiRes.rows.map((r: any) => ({ id: r.id, name: r.name, issuer: r.issuer || '', amountInvested: Number(r.amount_invested || 0), yieldRate: r.yield_rate || '', purchaseDate: r.purchase_date || '', maturityDate: r.maturity_date || '' }));
                    setFixedIncomeInvestments(fiList);
                    writeCache(`gestor_financeiro_cache_fixed_income_${uid}_${viewMode}`, fiList);
                }
                if (catRes?.rows) {
                    const catList = catRes.rows.map((r: any) => ({ id: r.id, name: r.name, type: r.type as any, icon: r.icon || '', meiCategory: r.mei_category || undefined }));
                    setCategories(catList);
                    writeCache(`gestor_financeiro_cache_categories_${uid}_${viewMode}`, catList);
                }
                if (goalRes?.rows) {
                    const goalList = goalRes.rows.map((r: any) => ({ id: r.id, name: r.name, targetAmount: Number(r.target_amount || 0), currentAmount: Number(r.current_amount || 0), color: r.color || '#22c55e' }));
                    setGoals(goalList);
                    writeCache(`gestor_financeiro_cache_goals_${uid}_${viewMode}`, goalList);
                }
                if (recRes?.rows) {
                    const recList = recRes.rows.map((r: any) => ({ id: r.id, label: r.label || '', amount: Number(r.amount || 0), category: r.category || '', accountId: r.account_id || '', paymentMethod: r.payment_method || '', dayOfMonth: r.day_of_month || undefined, businessDayRule: r.business_day_rule || undefined, costCenterId: r.cost_center_id || undefined, active: !!r.active }));
                    setRecurrences(recList);
                    writeCache(`gestor_financeiro_cache_recurrences_${uid}_${viewMode}`, recList);
                }
                if (ccRes?.rows) {
                    const ccList = ccRes.rows.map((c: any) => ({ id: c.id, name: c.name, orgId: c.org_id }));
                    setCostCenters(ccList);
                    writeCache(`gestor_financeiro_cache_cost_centers_${uid}_${viewMode}`, ccList);
                }
                if (profRes?.rows && profRes.rows.length > 0) {
                    const row = profRes.rows[0];
                    const prefs = row.preferences || {};
                    setUserPreferences(prefs);
                    
                    const isMeiFromDb = String(row.business_profile || '').toLowerCase() === 'mei';
                    setIsMei(isMeiFromDb);
                    try { saveToStorage('isMei', isMeiFromDb); } catch {}
                }
                // Bootstrap logic now parallelized in the main Promise.all block above.
            } catch (e) { console.error(e); }
        })();
    }, [user?.id, refreshTrigger, viewMode]);

    const executeAdvisorAction = async (actionType: string, params: any) => {
        try {
            const headers = await getAuthHeaders();
            const res = await fetch('/api/ai/execute', {
                method: 'POST',
                headers,
                body: JSON.stringify({ actionType, params })
            });
            const data = await res.json();
            if (data.success) {
                // Clear AI insight cache to force refresh
                sessionStorage.removeItem('gf_ai_insights_fetched');
                sessionStorage.removeItem('gf_ai_insights_data');
                
                setRefreshTrigger(prev => prev + 1); // Refresh all data
                showToast('Ação executada com sucesso!', 'success');
                return { success: true };
            }
            return { success: false, error: data.error || 'Ocorreu um erro' };
        } catch (err: any) {
            console.error('Advisor Action Failed:', err);
            return { success: false, error: err.message };
        }
    };

    // AI Insights Session-based Effect
    useEffect(() => {
        if (!user) return;

        const fetchInsights = async () => {
            try {
                // Cache versioning - bump this when proactive.ts logic changes
                const INSIGHTS_CACHE_VERSION = 'v4';
                const cacheKey = `gf_ai_insights_data_${INSIGHTS_CACHE_VERSION}_${viewMode}_${organizationInfo?.id || 'personal'}`;
                const hasFetchedKey = `gf_ai_insights_fetched_${INSIGHTS_CACHE_VERSION}_${viewMode}_${organizationInfo?.id || 'personal'}`;
                const hasFetched = sessionStorage.getItem(hasFetchedKey);
                const isManualRefresh = refreshTrigger > 0;
                
                if (hasFetched && !isManualRefresh) {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) {
                        setAiInsights(JSON.parse(cached));
                        return;
                    }
                }

                setAiInsights([]); // Reset to show loading state
                setIsAiLoading(true);
                const headers = await getAuthHeaders();
                headers['x-view-mode'] = viewMode;
                const res = await fetch('/api/ai/proactive', { 
                    method: 'POST', 
                    headers,
                    body: JSON.stringify({ 
                        orgId: viewMode === 'organization' ? organizationInfo?.id : null, 
                        viewMode 
                    })
                });
                
                if (res.ok) {
                    const data = await res.json();
                    if (data.insights && Array.isArray(data.insights)) {
                        setAiInsights(data.insights);
                        sessionStorage.setItem(hasFetchedKey, 'true');
                        sessionStorage.setItem(cacheKey, JSON.stringify(data.insights));
                    }
                }
            } catch (err) {
                console.error('Advisor: AI Insight fetch failed.', err);
            } finally {
                setIsAiLoading(false);
            }
        };

        fetchInsights();
    }, [user?.id, refreshTrigger, viewMode, organizationInfo?.id]);

    useEffect(() => {
        if (user) return;
        try {
            setAccounts([]);
            setTransactions([]);
            setInvestments([]);
            setFixedIncomeInvestments([]);
            setCategories([]);
            setGoals([]);
            setRecurrences([]);
            setCostCenters([]);
            setHasMoreTransactions(false);
            setCapabilities(defaultCapabilities);
            setEntitlements(defaultEntitlements);
            setUsage(null);
            setPlanInfo(null);
            setSubscriptionInfo(null);
            localStorage.removeItem('gestor_financeiro_capabilities');
            localStorage.removeItem('gestor_financeiro_entitlements');
            localStorage.removeItem('gestor_financeiro_usage');
            localStorage.removeItem('gestor_financeiro_planInfo');
            localStorage.removeItem('gestor_financeiro_subscriptionInfo');
        } catch {}
    }, [user]);

    useEffect(() => {
        const businessProfile = (userPreferences?.businessProfile || (isMei ? 'mei' : (organizationInfo?.id ? 'empresa' : 'pf'))).toLowerCase();
        const canOrgMode = businessProfile !== 'pf' && !!organizationInfo?.id;
        if (!canOrgMode && viewMode !== 'personal') {
            setViewMode('personal');
            try { window.localStorage.setItem('gestor_financeiro_viewMode', JSON.stringify('personal')); } catch {}
        }
    }, [organizationInfo?.id, viewMode, userPreferences?.businessProfile, isMei]);

    const loadMoreTransactions = async () => {
        if (!user) return;
        const current = transactions.length;
        if (dbProvider === 'neon') {
            const PAGE = 300;
            try {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'transactions_list', data: { limit: PAGE, offset: current } }) });
                const j = await r.json();
                const rows: any[] = (j.rows || []);
                if (!rows.length) { setHasMoreTransactions(false); return; }
                const appended = rows.map((r: any) => ({ id: r.id, date: r.date, accountId: r.account_id, toAccountId: r.to_account_id || undefined, transactionType: r.transaction_type, category: r.category, description: r.description || '', amount: Number(r.amount || 0), paymentMethod: r.payment_method || '', costCenterId: r.cost_center_id || undefined, isBusinessRevenue: !!r.is_business_revenue, isBusinessExpense: !!r.is_business_expense }));
                setTransactions(prev => [...prev, ...appended]);
                setHasMoreTransactions(rows.length === PAGE);
            } catch {}
        }
    };

    const loadOlderTransactions = async () => {
        if (!user || transactions.length === 0) return;
        const oldest = transactions.reduce((min, t) => {
            const d = new Date(t.date).getTime();
            return d < min ? d : min;
        }, new Date().getTime());
        const oldestDate = new Date(oldest);
        const iso = `${oldestDate.getFullYear()}-${String(oldestDate.getMonth()+1).padStart(2,'0')}-${String(oldestDate.getDate()).padStart(2,'0')}`;
        if (dbProvider === 'neon') {
            const PAGE = 300;
            try {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'transactions_list', data: { beforeDate: iso, limit: PAGE } }) });
                const j = await r.json();
                const rows: any[] = (j.rows || []);
                if (!rows.length) { setHasMoreTransactions(false); return; }
                const appended = rows.map((r: any) => ({ id: r.id, date: r.date, accountId: r.account_id, toAccountId: r.to_account_id || undefined, transactionType: r.transaction_type, category: r.category, description: r.description || '', amount: Number(r.amount || 0), paymentMethod: r.payment_method || '', costCenterId: r.cost_center_id || undefined, isBusinessRevenue: !!r.is_business_revenue, isBusinessExpense: !!r.is_business_expense }));
                setTransactions(prev => [...prev, ...appended].sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime()));
                setHasMoreTransactions(rows.length === PAGE);
            } catch {}
        }
    };






    useEffect(() => localStorage.setItem('gestor_financeiro_privacyMode', JSON.stringify(isPrivacyMode)), [isPrivacyMode]);
    useEffect(() => localStorage.setItem('gestor_financeiro_isMei', JSON.stringify(isMei)), [isMei]);
    useEffect(() => localStorage.setItem('gestor_financeiro_marketData', JSON.stringify(marketData)), [marketData]);
    useEffect(() => localStorage.setItem('gestor_financeiro_marketDataSources', JSON.stringify(marketDataSources)), [marketDataSources]);
    useEffect(() => localStorage.setItem('gestor_financeiro_marketDataTs', JSON.stringify(marketDataTs)), [marketDataTs]);

    useEffect(() => localStorage.setItem('gestor_financeiro_userPreferences', JSON.stringify(userPreferences)), [userPreferences]);

    // --- MIGRATION EFFECT: Auto-assign icons to existing categories if missing ---
    useEffect(() => {
        const hasMissingIcons = categories.some(c => !c.icon);
        if (hasMissingIcons) {
            const updatedCategories = categories.map(c => {
                if (c.icon) return c;
                // Try to find a default icon matching the name
                const defaultCat = defaultData.categories.find(dc => dc.name === c.name);
                return defaultCat ? { ...c, icon: defaultCat.icon } : c;
            });
            // Only update if there was a change to avoid infinite loops
            if (JSON.stringify(updatedCategories) !== JSON.stringify(categories)) {
                setCategories(updatedCategories);
                console.log("Migrated categories to include default icons.");
            }
        }
    }, []); // Run once on mount

    // Load cost centers from Supabase if configured (Removed)
    useEffect(() => {
        // No-op
    }, []);

    const [isMarketLoading, setIsMarketLoading] = useState<boolean>(false);
    const refreshMarketData = async (force?: boolean) => {
        try {
            if (locked && !force) { setIsMarketLoading(false); return; }
            setIsMarketLoading(true);
            const now = Date.now();
            const hasCrypto = investments.some(inv => inv.type === AssetType.CRYPTO);
            const hasB3 = investments.some(inv => inv.type === AssetType.STOCK || inv.type === AssetType.REAL_ESTATE_FUND);
            const ttl = hasCrypto ? (2 * 60 * 1000) : (hasB3 ? MARKET_CACHE_TTL_DEFAULT : (15 * 60 * 1000));
            if (!force && marketDataTs && (now - marketDataTs) < ttl) {
                showToast('Usando cache de cotações recente.', 'info');
                setIsMarketLoading(false);
                return;
            }
            const tickers = [...new Set([...investments.map(inv => inv.ticker), '^BVSP', 'BTC', 'USD'])];
            if (tickers.length > 0) {
                const { data, sources } = await getMarketData(tickers, !!force);
                if (Object.keys(data).length > 0) {
                    setMarketData(data);
                    setMarketDataSources(sources);
                    setMarketDataTs(Date.now());
                    showToast('Cotações atualizadas.', 'success');
                } else {
                    showToast('Nenhuma cotação foi atualizada.', 'info');
                }
            } else {
                showToast('Nenhum ativo para atualizar.', 'info');
            }
        } catch (e) {
            console.error('Erro ao atualizar cotações', e);
            showToast('Falha ao atualizar cotações.', 'error');
        } finally {
            setIsMarketLoading(false);
        }
    };

    useEffect(() => {
        if (locked) return;
        const now = Date.now();
        const tickers = investments.map(inv => inv.ticker);
        if (tickers.length > 0) {
            const hasCrypto = investments.some(inv => inv.type === AssetType.CRYPTO);
            const hasB3 = investments.some(inv => inv.type === AssetType.STOCK || inv.type === AssetType.REAL_ESTATE_FUND);
            const ttl = hasCrypto ? (2 * 60 * 1000) : (hasB3 ? MARKET_CACHE_TTL_DEFAULT : (15 * 60 * 1000));
            const isStale = !marketDataTs || (now - marketDataTs) > ttl;
            if (isStale) {
                refreshMarketData?.();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked]);
    useEffect(() => {
        try {
            if (!user) return;
            const startedAt = window.localStorage.getItem('gestor_financeiro_session_started_at') || '';
            const doneAt = window.localStorage.getItem('gestor_financeiro_first_quotes_done_at') || '';
            const shouldForce = !!startedAt && (!doneAt || new Date(doneAt).getTime() < new Date(startedAt).getTime());
            if (!shouldForce) return;
            const tickers = investments.map(inv => inv.ticker).filter(Boolean);
            if (tickers.length === 0) return;
            (async () => {
                await refreshMarketData(true);
                try { window.localStorage.setItem('gestor_financeiro_first_quotes_done_at', new Date().toISOString()); } catch {}
            })();
        } catch {}
    }, [user, investments.length]);
    
    // --- ACTIONS ---
    const addAccount = async (account: Omit<BankAccount, 'id'>) => {
        try {
            if (dbProvider === 'neon' && user) {
                const j = await callApi('accounts_insert', { name: account.name, bank: account.bank, initialBalance: account.initialBalance });
                if (j.error) return;
                const row = (j.rows || [])[0];
                if (!row) { showToast('Conta não retornada pela Neon.', 'error'); return; }
                setAccounts(prev => [...prev, { id: row.id, name: row.name, bank: row.bank || '', initialBalance: Number(row.initial_balance || 0) }]);
            } else {
                setAccounts(prev => [...prev, { ...account, id: new Date().toISOString() }]);
            }
            showToast('Conta adicionada com sucesso!', 'success');
        } catch (e) {
            setAccounts(prev => [...prev, { ...account, id: new Date().toISOString() }]);
            showToast('Conta criada no dispositivo (offline).', 'info');
        }
    };
    const updateAccount = async (id: string, updates: Partial<BankAccount>) => {
        if (dbProvider === 'neon' && user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'accounts_update', data: { id, name: updates.name, bank: updates.bank, initialBalance: updates.initialBalance } }) });
            if (!r.ok) { showToast('Falha ao atualizar conta na Neon.', 'error'); return; }

        }
        setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updates } : acc));
        showToast('Conta atualizada!', 'success');
    };
    const deleteAccount = async (id: string) => {
        if (dbProvider === 'neon' && user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'accounts_delete', data: { id } }) });
            if (!r.ok) { showToast('Falha ao remover conta na Neon.', 'error'); return; }

        }
        setAccounts(prev => prev.filter(acc => acc.id !== id));
        showToast('Conta removida.', 'info');
    };

    const addTransaction = async (transaction: Omit<Transaction, 'id'>) => {
        if (dbProvider === 'neon' && user) {
            const j = await callApi('transactions_insert', { date: transaction.date, accountId: transaction.accountId, toAccountId: transaction.toAccountId ?? null, transactionType: transaction.transactionType, category: transaction.category, description: transaction.description ?? null, amount: transaction.amount, paymentMethod: transaction.paymentMethod ?? null, costCenterId: transaction.costCenterId ?? null, isBusinessRevenue: transaction.isBusinessRevenue ?? false, isBusinessExpense: transaction.isBusinessExpense ?? false });
            
            if (j.error) {
                setTransactions(prev => [...prev, { ...transaction, id: new Date().toISOString() }].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                showToast('Lançamento adicionado no dispositivo.', 'info');
                return;
            }
            const rrow = (j.rows || [])[0];
            if (!rrow) {
                setTransactions(prev => [...prev, { ...transaction, id: new Date().toISOString() }].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
                showToast('Lançamento adicionado no dispositivo.', 'info');
                return;
            }
            const newTx = { id: rrow.id, date: rrow.date, accountId: rrow.account_id, toAccountId: rrow.to_account_id || undefined, transactionType: rrow.transaction_type, category: rrow.category, description: rrow.description || '', amount: Number(rrow.amount || 0), paymentMethod: rrow.payment_method || '', costCenterId: rrow.cost_center_id || undefined, isBusinessRevenue: !!rrow.is_business_revenue, isBusinessExpense: !!rrow.is_business_expense };
            setTransactions(prev => [newTx, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } else {
            setTransactions(prev => [...prev, { ...transaction, id: new Date().toISOString() }].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        }
        showToast('Lançamento adicionado!', 'success');
    };
    const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
        const current = transactions.find(transaction => transaction.id === id);
        if (dbProvider === 'neon' && user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'transactions_update', data: { id, date: updates.date ?? null, accountId: updates.accountId ?? null, toAccountId: updates.toAccountId ?? null, transactionType: updates.transactionType ?? null, category: updates.category ?? null, description: updates.description ?? null, amount: updates.amount ?? null, paymentMethod: updates.paymentMethod ?? null, costCenterId: updates.costCenterId ?? null, isBusinessRevenue: updates.isBusinessRevenue ?? current?.isBusinessRevenue ?? false, isBusinessExpense: updates.isBusinessExpense ?? current?.isBusinessExpense ?? false } }) });
            if (!r.ok) { showToast('Falha ao atualizar lançamento na Neon.', 'error'); return; }

        }
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        showToast('Lançamento atualizado.', 'success');
    };
    const deleteTransaction = async (id: string) => {
        if (dbProvider === 'neon' && user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'transactions_delete', data: { id } }) });
            if (!r.ok) { showToast('Falha ao remover lançamento na Neon.', 'error'); return; }

        }
        setTransactions(prev => prev.filter(t => t.id !== id));
        showToast('Lançamento removido.', 'info');
    };

    const appendTransactionsLocal = (txs: Transaction[]) => {
        try {
            if (!Array.isArray(txs) || txs.length === 0) return;
            setTransactions(prev => [...txs, ...prev].sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch {}
    };

    const addInvestment = async (investment: Omit<Investment, 'id'>) => {
        if (user) {
            const j = await callApi('investments_insert', { type: investment.type, ticker: investment.ticker || null, quantity: investment.quantity ?? null, purchasePrice: investment.purchasePrice ?? null, purchaseDate: investment.purchaseDate || null });
            if (j.error) return;
            const row = (j.rows || [])[0];
            if (!row) { showToast('Investimento não retornado pela Neon.', 'error'); return; }
            setInvestments(prev => [...prev, { id: row.id, type: row.type, ticker: row.ticker || '', quantity: Number(row.quantity || 0), purchasePrice: Number(row.purchase_price || 0), purchaseDate: row.purchase_date || '' }]);
        } else {
            setInvestments(prev => [...prev, { ...investment, id: new Date().toISOString() }]);
        }
        showToast('Investimento adicionado!', 'success');
    };
    const updateInvestment = async (id: string, updates: Partial<Investment>) => {
        if (user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'investments_update', data: { id, type: updates.type ?? null, ticker: updates.ticker ?? null, quantity: updates.quantity ?? null, purchasePrice: updates.purchasePrice ?? null, purchaseDate: updates.purchaseDate ?? null } }) });
            if (!r.ok) { showToast('Falha ao atualizar investimento na Neon.', 'error'); return; }
        }
        setInvestments(prev => prev.map(inv => (inv.id === id ? { ...inv, ...updates } : inv)));
        showToast('Investimento atualizado.', 'success');
    };
    const deleteInvestment = async (id: string) => {
        if (user) {
            const headers = await getAuthHeaders();
            const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'investments_delete', data: { id } }) });
            if (!r.ok) { showToast('Falha ao remover investimento na Neon.', 'error'); return; }
        }
        setInvestments(prev => prev.filter(inv => inv.id !== id));
        showToast('Investimento removido.', 'info');
    };
    
    const addFixedIncomeInvestment = async (investment: Omit<FixedIncomeInvestment, 'id'>) => {
        try {
            if (user) {
                const j = await callApi('fixed_income_insert', { name: investment.name, issuer: investment.issuer || null, amountInvested: investment.amountInvested, yieldRate: investment.yieldRate || null, purchaseDate: investment.purchaseDate || null, maturityDate: investment.maturityDate || null });
                if (j.error) return;
                const row = (j.rows || [])[0];
                if (!row) { showToast('Renda fixa não retornada pela Neon.', 'error'); return; }
                setFixedIncomeInvestments(prev => [...prev, { id: row.id, type: AssetType.FIXED_INCOME, name: row.name, issuer: row.issuer || '', amountInvested: Number(row.amount_invested || 0), yieldRate: row.yield_rate || '', purchaseDate: row.purchase_date || '', maturityDate: row.maturity_date || '' }]);
            } else {
                setFixedIncomeInvestments(prev => [...prev, { ...investment, id: new Date().toISOString(), type: AssetType.FIXED_INCOME }]);
            }
            showToast('Renda fixa adicionada!', 'success');
        } catch (e) {
            setFixedIncomeInvestments(prev => [...prev, { ...investment, id: new Date().toISOString(), type: AssetType.FIXED_INCOME }]);
            showToast('Renda fixa criada no dispositivo (offline).', 'info');
        }
    };
    const updateFixedIncomeInvestment = async (id: string, updates: Partial<FixedIncomeInvestment>) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'fixed_income_update', data: { id, name: updates.name, issuer: updates.issuer ?? null, amountInvested: updates.amountInvested, yieldRate: updates.yieldRate ?? null, purchaseDate: updates.purchaseDate ?? null, maturityDate: updates.maturityDate ?? null } }) });
                if (!r.ok) { showToast('Falha ao atualizar renda fixa na Neon.', 'error'); return; }
            }
            setFixedIncomeInvestments(prev => prev.map(inv => (inv.id === id ? { ...inv, ...updates } : inv)));
            showToast('Renda fixa atualizada.', 'success');
        } catch (e) {
            setFixedIncomeInvestments(prev => prev.map(inv => (inv.id === id ? { ...inv, ...updates } : inv)));
            showToast('Renda fixa atualizada no dispositivo (offline).', 'info');
        }
    };
    const deleteFixedIncomeInvestment = async (id: string) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'fixed_income_delete', data: { id } }) });
                if (!r.ok) { showToast('Falha ao remover renda fixa na Neon.', 'error'); return; }
            }
            setFixedIncomeInvestments(prev => prev.filter(inv => inv.id !== id));
            showToast('Investimento removido.', 'info');
        } catch (e) {
            setFixedIncomeInvestments(prev => prev.filter(inv => inv.id !== id));
            showToast('Investimento removido do dispositivo (offline).', 'info');
        }
    };

    const getCategoryEmoji = (raw: string): string => {
        const name = String(raw || '').toLowerCase();
        if (name.includes('cripto') || name.includes('crypto') || name.includes('btc') || name.includes('bitcoin')) return '🪙';
        if (name.includes('ação') || name.includes('acoes') || name.includes('stock')) return '📈';
        if (name.includes('fii') || name.includes('fundo imobili') || name.includes('fundos imobili')) return '🏢';
        if (name.includes('renda fixa') || name.includes('cdb') || name.includes('lci') || name.includes('lca') || name.includes('tesouro')) return '💵';
        if (name.includes('internacional') || name.includes('exterior') || name.includes('ação internacional') || name.includes('reit')) return '🌎';
        if (name.includes('transporte')) return '🚗';
        if (name.includes('combustível') || name.includes('combustivel') || name.includes('gasolina') || name.includes('diesel') || name.includes('etanol') || name.includes('gnv') || name.includes('posto')) return '⛽';
        if (name.includes('alimentação') || name.includes('alimentacao') || name.includes('comida')) return '🍔';
        if (name.includes('mercado') || name.includes('supermercado') || name.includes('hortifruti')) return '🛒';
        if (name.includes('aluguel')) return '🧾';
        if (name.includes('condomínio') || name.includes('condominio')) return '🏢';
        if (name.includes('internet')) return '🌐';
        if (name.includes('energia') || name.includes('luz')) return '⚡';
        if (name.includes('água') || name.includes('agua')) return '💧';
        if (name.includes('gás') || name.includes('gas')) return '🔥';
        if (name.includes('telefonia') || name.includes('telefone') || name.includes('celular')) return '📱';
        if (name.includes('restaurante') || name.includes('almoço') || name.includes('jantar') || name.includes('lanche')) return '🍽️';
        if (name.includes('padaria') || name.includes('café') || name.includes('cafe') || name.includes('pão')) return '☕';
        if (name.includes('delivery') || name.includes('ifood')) return '🍕';
        if (name.includes('bebidas') || name.includes('refrigerante') || name.includes('cerveja') || name.includes('vinho') || name.includes('whisky') || name.includes('vodka') || name.includes('adega')) return '🥤';
        if (name.includes('saúde') || name.includes('saude') || name.includes('farmácia') || name.includes('farmacia') || name.includes('remédio') || name.includes('medicamento')) return '💊';
        if (name.includes('academia') || name.includes('gym') || name.includes('musculação') || name.includes('musculacao')) return '🏋️';
        if (name.includes('educação') || name.includes('educacao') || name.includes('escola') || name.includes('curso') || name.includes('faculdade')) return '🎓';
        if (name.includes('imposto') || name.includes('taxa') || name.includes('iptu') || name.includes('ipva') || name.includes('darf') || name.includes('das')) return '🧾';
        if (name.includes('bancár') || name.includes('bancario') || name.includes('bancária') || name.includes('tarifa') || name.includes('anuidade')) return '🏦';
        if (name.includes('vestuário') || name.includes('vestuario') || name.includes('roupa') || name.includes('calçados') || name.includes('calcados') || name.includes('sapato') || name.includes('tênis') || name.includes('tenis')) return '👗';
        if (name.includes('beleza') || name.includes('barbearia') || name.includes('cabeleireiro') || name.includes('salão') || name.includes('salao')) return '💇';
        if (name.includes('pet') || name.includes('veterinário') || name.includes('veterinario') || name.includes('ração') || name.includes('racao') || name.includes('banho') || name.includes('tosa')) return '🐾';
        if (name.includes('assinatura') || name.includes('netflix') || name.includes('spotify') || name.includes('prime video') || name.includes('disney')) return '📺';
        if (name.includes('lazer') || name.includes('cinema') || name.includes('show')) return '🎉';
        if (name.includes('utilidade')) return '🔌';
        if (name.includes('tecnologia')) return '💻';
        if (name.includes('eletrônico') || name.includes('eletronico') || name.includes('eletrônicos')) return '🖥️';
        if (name.includes('ferramenta')) return '🧰';
        if (name.includes('limpeza')) return '🧼';
        if (name.includes('reforma') || name.includes('obra')) return '🛠️';
        if (name.includes('jardinagem') || name.includes('jardim')) return '🌿';
        if (name.includes('escritório') || name.includes('escritorio')) return '🗂️';
        if (name.includes('home office')) return '🏡';
        if (name.includes('jogos') || name.includes('psn') || name.includes('xbox') || name.includes('steam')) return '🎮';
        if (name.includes('música') || name.includes('musica') || name.includes('instrumento')) return '🎵';
        if (name.includes('viagem') || name.includes('viagens')) return '🏖️';
        if (name.includes('passagens')) return '✈️';
        if (name.includes('hotel')) return '🏨';
        if (name.includes('estacionamento')) return '🅿️';
        if (name.includes('carro')) return '🚙';
        if (name.includes('manutenção') || name.includes('manutencao') || name.includes('oficina') || name.includes('mecânico') || name.includes('mecanico') || name.includes('óleo') || name.includes('oleo') || name.includes('pneu')) return '🔧';
        if (name.includes('jurídico') || name.includes('juridico') || name.includes('advogado') || name.includes('cartório') || name.includes('cartorio')) return '⚖️';
        if (name.includes('presentes') || name.includes('presente') || name.includes('aniversário') || name.includes('aniversario') || name.includes('casamento')) return '🎁';
        if (name.includes('doações') || name.includes('doacao') || name.includes('doação') || name.includes('dízimo') || name.includes('dizimo')) return '🙏';
        if (name.includes('academia') || name.includes('crossfit') || name.includes('pilates')) return '🏋️';
        if (name.includes('esportes') || name.includes('futebol') || name.includes('corrida') || name.includes('bicicleta')) return '⚽';
        if (name.includes('cuidados pessoais') || name.includes('higiene') || name.includes('shampoo') || name.includes('creme')) return '🧴';
        return '';
    };
    const addCategory = async (category: Omit<Category, 'id'>) => {
        try {
            const icon = category.icon || getCategoryEmoji(category.name);
            if (user) {
                const j = await callApi('categories_insert', { name: category.name, type: category.type, icon: icon || null, meiCategory: category.meiCategory ?? null });
                if (j.error) return;
                const row = (j.rows || [])[0];
                if (!row) { showToast('Categoria não retornada pela Neon.', 'error'); return; }
                setCategories(prev => [...prev, { id: row.id, name: row.name, type: (row.type as any), icon: row.icon || icon || '', meiCategory: row.mei_category || undefined }]);
            } else {
                setCategories(prev => [...prev, { ...category, icon, id: new Date().toISOString() }]);
            }
            showToast('Categoria criada.', 'success');
        } catch (e) {
            const icon = category.icon || getCategoryEmoji(category.name);
            setCategories(prev => [...prev, { ...category, icon, id: new Date().toISOString() }]);
            showToast('Categoria criada no dispositivo (offline).', 'info');
        }
    };
    const updateCategory = async (id: string, updates: Partial<Category>) => {
        try {
            let nextIcon = updates.icon;
            if (!nextIcon && updates.name) nextIcon = getCategoryEmoji(updates.name);
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'categories_update', data: { id, name: updates.name ?? null, type: updates.type ?? null, icon: nextIcon ?? null, meiCategory: updates.meiCategory ?? null } }) });
                if (!r.ok) { showToast('Falha ao atualizar categoria na Neon.', 'error'); return; }
            }
            setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates, icon: (nextIcon ?? c.icon) } : c));
            showToast('Categoria atualizada.', 'success');
        } catch (e) {
            let nextIcon = updates.icon;
            if (!nextIcon && updates.name) nextIcon = getCategoryEmoji(updates.name);
            setCategories(prev => prev.map(c => c.id === id ? { ...c, ...updates, icon: (nextIcon ?? c.icon) } : c));
            showToast('Categoria atualizada no dispositivo (offline).', 'info');
        }
    };
    const deleteCategory = async (id: string) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'categories_delete', data: { id } }) });
                if (!r.ok) { showToast('Falha ao remover categoria na Neon.', 'error'); return; }
            }
            setCategories(prev => prev.filter(c => c.id !== id));
            showToast('Categoria removida.', 'info');
        } catch (e) {
            setCategories(prev => prev.filter(c => c.id !== id));
            showToast('Categoria removida do dispositivo (offline).', 'info');
        }
    };

    const addCostCenter = async (cc: Omit<CostCenter, 'id'> & { scope?: 'personal' | 'org' }) => {
        try {
            if (user) {
                const j = await callApi('cost_centers_insert', { name: cc.name, scope: cc.scope });
                if (j.error) return;
                const row = (j.rows || [])[0];
                if (!row) { showToast('Centro de custo não retornado pela Neon.', 'error'); return; }
                setCostCenters(prev => [...prev, { id: row.id, name: row.name }]);
            } else {
                setCostCenters(prev => [...prev, { ...cc, id: new Date().toISOString() }]);
            }
            showToast('Centro de custo criado.', 'success');
        } catch (e) {
            setCostCenters(prev => [...prev, { ...cc, id: new Date().toISOString() }]);
            showToast('Centro criado no dispositivo (offline).', 'info');
        }
    };
    const updateCostCenter = async (id: string, updates: Partial<CostCenter>) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'cost_centers_update', data: { id, name: updates.name } }) });
                if (!r.ok) { showToast('Falha ao atualizar centro na Neon.', 'error'); return; }
            }
            setCostCenters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
            showToast('Centro de custo atualizado.', 'success');
        } catch (e) {
            setCostCenters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
            showToast('Centro atualizado no dispositivo (offline).', 'info');
        }
    };
    const deleteCostCenter = async (id: string) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'cost_centers_delete', data: { id } }) });
                if (!r.ok) { showToast('Falha ao excluir centro de custo na Neon.', 'error'); return; }
            }
            setCostCenters(prev => prev.filter(c => c.id !== id));
            showToast('Centro de custo removido.', 'info');
        } catch (e) {
            setCostCenters(prev => prev.filter(c => c.id !== id));
            showToast('Centro removido do dispositivo (offline).', 'info');
        }
    };

    const addGoal = async (goal: Omit<Goal, 'id'>) => {
        try {
            if (user) {
                const j = await callApi('goals_insert', { name: goal.name, targetAmount: goal.targetAmount, currentAmount: goal.currentAmount ?? 0, color: goal.color || null });
                if (j.error) return;
                const row = (j.rows || [])[0];
                if (!row) { showToast('Meta não retornada pela Neon.', 'error'); return; }
                setGoals(prev => [...prev, { id: row.id, name: row.name, targetAmount: Number(row.target_amount || 0), currentAmount: Number(row.current_amount || 0), color: row.color || '#22c55e' }]);
            } else {
                setGoals(prev => [...prev, { ...goal, id: new Date().toISOString() }]);
            }
            showToast('Meta criada com sucesso!', 'success');
        } catch (e) {
            setGoals(prev => [...prev, { ...goal, id: new Date().toISOString() }]);
            showToast('Meta criada no dispositivo (offline).', 'info');
        }
    };
    const updateGoal = async (id: string, updates: Partial<Goal>) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'goals_update', data: { id, name: updates.name, targetAmount: updates.targetAmount, currentAmount: updates.currentAmount, color: updates.color ?? null } }) });
                if (!r.ok) { showToast('Falha ao atualizar meta na Neon.', 'error'); return; }
                const j = await r.json();
                const row = (j.rows || [])[0];
                if (row && row.id) {
                    setGoals(prev => prev.map(g => g.id === id ? { id: row.id, name: row.name, targetAmount: Number(row.target_amount || 0), currentAmount: Number(row.current_amount || 0), color: row.color || g.color || '#22c55e', deadline: g.deadline, destAccountId: g.destAccountId, preferredContributionPct: g.preferredContributionPct } : g));
                } else {
                    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
                }
            } else {
                setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
            }
            showToast('Meta atualizada.', 'success');
        } catch (e) {
            setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
            showToast('Meta atualizada no dispositivo (offline).', 'info');
        }
    };
    const deleteGoal = async (id: string) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'goals_delete', data: { id } }) });
                if (!r.ok) { showToast('Falha ao excluir meta na Neon.', 'error'); return; }
            }
            setGoals(prev => prev.filter(g => g.id !== id));
            showToast('Meta excluída.', 'info');
        } catch (e) {
            setGoals(prev => prev.filter(g => g.id !== id));
            showToast('Meta excluída do dispositivo (offline).', 'info');
        }
    };

    const addRecurrence = async (rec: Omit<Recurrence, 'id'>) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'recurrences_insert', data: { label: rec.label, amount: rec.amount, category: rec.category, accountId: rec.accountId, paymentMethod: rec.paymentMethod || null, dayOfMonth: rec.dayOfMonth ?? null, businessDayRule: rec.businessDayRule ?? null, costCenterId: rec.costCenterId ?? null, active: rec.active } }) });
                if (!r.ok) { showToast('Falha ao criar recorrência na Neon.', 'error'); return; }
                const j = await r.json();
                const row = (j.rows || [])[0];
                if (!row) { showToast('Recorrência não retornada pela Neon.', 'error'); return; }
                setRecurrences(prev => [{ id: row.id, label: row.label || '', amount: Number(row.amount || 0), category: row.category || '', accountId: row.account_id || '', paymentMethod: row.payment_method || '', type: (row.type as any) || 'Saída', dayOfMonth: row.day_of_month || undefined, businessDayRule: row.business_day_rule || undefined, costCenterId: row.cost_center_id || undefined, active: !!row.active }, ...prev]);
            } else {
                setRecurrences(prev => [{ ...rec, id: new Date().toISOString() }, ...prev]);
            }
            showToast('Recorrência criada.', 'success');
        } catch (e) {
            setRecurrences(prev => [{ ...rec, id: new Date().toISOString() }, ...prev]);
            showToast('Recorrência criada no dispositivo (offline).', 'info');
        }
    };
    const updateRecurrence = async (id: string, updates: Partial<Recurrence>) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'recurrences_update', data: { id, label: updates.label ?? null, amount: updates.amount ?? null, category: updates.category ?? null, accountId: updates.accountId ?? null, paymentMethod: updates.paymentMethod ?? null, dayOfMonth: updates.dayOfMonth ?? null, businessDayRule: updates.businessDayRule ?? null, costCenterId: updates.costCenterId ?? null, active: updates.active ?? null } }) });
                if (!r.ok) { showToast('Falha ao atualizar recorrência na Neon.', 'error'); return; }
            }
            setRecurrences(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
            showToast('Recorrência atualizada.', 'success');
        } catch (e) {
            setRecurrences(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
            showToast('Recorrência atualizada no dispositivo (offline).', 'info');
        }
    };
    const deleteRecurrence = async (id: string) => {
        try {
            if (user) {
                const headers = await getAuthHeaders();
                const r = await fetch('/api/query', { method: 'POST', headers, body: JSON.stringify({ type: 'recurrences_delete', data: { id } }) });
                if (!r.ok) { showToast('Falha ao excluir recorrência na Neon.', 'error'); return; }
            }
            setRecurrences(prev => prev.filter(r => r.id !== id));
            showToast('Recorrência excluída.', 'info');
        } catch (e) {
            setRecurrences(prev => prev.filter(r => r.id !== id));
            showToast('Recorrência excluída do dispositivo (offline).', 'info');
        }
    };

    const togglePrivacyMode = () => {
        setIsPrivacyMode(prev => !prev);
    };

    const toggleMei = async () => {
        const prevValue = isMei;
        const newValue = !prevValue;
        const prevPrefs = userPreferences;
        setIsMei(newValue);
        try { saveToStorage('isMei', newValue); } catch {}

        const nextPrefs = { ...prevPrefs, isMei: newValue, meiOpeningDate };
        setUserPreferences(nextPrefs);

        if (dbProvider === 'neon' && user) {
            try {
                // Update business_profile in profiles table (source of truth)
                await callApi('profile_update_business_profile', { business_profile: newValue ? 'mei' : 'pf' });
                // Also persist preferences for backward compatibility
                await callApi('profile_update_preferences', { preferences: nextPrefs });
                setRefreshTrigger(prev => prev + 1);
            } catch (e) {
                setIsMei(prevValue);
                try { saveToStorage('isMei', prevValue); } catch {}
                setUserPreferences(prevPrefs);
                showToast('Falha ao salvar a preferência do módulo MEI.', 'error');
            }
        }
    };

    const setMeiOpeningDate = async (date: string) => {
        const prevPrefs = userPreferences;
        setMeiOpeningDateState(date);
        try { saveToStorage('meiOpeningDate', date); } catch {}
        const nextPrefs = { ...prevPrefs, isMei, meiOpeningDate: date };
        setUserPreferences(nextPrefs);
        if (dbProvider === 'neon' && user) {
            try {
                await callApi('profile_update_preferences', { preferences: nextPrefs });
                setRefreshTrigger(prev => prev + 1);
            } catch (e) {
                setUserPreferences(prevPrefs);
                showToast('Falha ao salvar a data de abertura do MEI.', 'error');
            }
        }
    };
    
    const exportData = () => {
        const data = {
            accounts,
            transactions,
            investments,
            fixedIncomeInvestments,
            categories,
            goals,
            costCenters
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "finance_plus_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        showToast('Backup realizado com sucesso!', 'success');
    }

    const importData = (jsonString: string) => {
        try {
            const data = JSON.parse(jsonString);
            
            // Basic validation check to ensure it's a valid backup file
            if (!data.accounts || !Array.isArray(data.accounts) || !data.transactions || !Array.isArray(data.transactions)) {
                throw new Error("Formato de arquivo inválido.");
            }
            if (data.accounts) setAccounts(data.accounts);
            if (data.transactions) setTransactions(data.transactions);
            if (data.investments) setInvestments(data.investments);
            if (data.fixedIncomeInvestments) setFixedIncomeInvestments(data.fixedIncomeInvestments);
            if (data.categories) setCategories(data.categories);
            if (data.goals) setGoals(data.goals);
            if (data.costCenters) setCostCenters(data.costCenters);
            
            showToast('Dados importados com sucesso!', 'success');
        } catch (e) {
            console.error("Import Error:", e);
            showToast('Erro ao importar: arquivo inválido.', 'error');
        }
    };

    // --- MEMOIZED CALCULATIONS ---
    const accountBalances = useMemo(() => {
        const balances: Record<string, number> = {};
        accounts.forEach(acc => {
            balances[acc.id] = Number(acc.initialBalance || 0);
        });

        [...transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach(t => {
            const amount = Number(t.amount || 0);
            if (isNaN(amount) || amount === 0) return;
            const type = (t.transactionType || '').toLowerCase();

            if (['transferência', 'transferencia', 'transfer'].includes(type)) {
                if (t.accountId && balances[t.accountId] !== undefined) {
                    balances[t.accountId] -= amount;
                }
                if (t.toAccountId && balances[t.toAccountId] !== undefined) {
                    balances[t.toAccountId] += amount;
                }
            } else if (['entrada', 'income', 'receita'].includes(type)) {
                if (t.accountId && balances[t.accountId] !== undefined) {
                    balances[t.accountId] += amount;
                }
            } else if (['saída', 'saida', 'expense', 'despesa'].includes(type)) {
                if (t.accountId && balances[t.accountId] !== undefined) {
                    balances[t.accountId] -= amount;
                }
            }
        });

        Object.keys(balances).forEach(id => {
            balances[id] = Number(balances[id].toFixed(2));
        });
        return balances;
    }, [accounts, transactions]);

    const totalBalance = useMemo(() => Object.values(accountBalances).reduce((sum: number, balance: number) => sum + balance, 0), [accountBalances]);

    const accountsWithCurrentBalance = useMemo(() => accounts.map(acc => ({
        ...acc,
        balance: accountBalances[acc.id] ?? acc.initialBalance
    })), [accounts, accountBalances]);

    const { totalInvested, portfolioValue } = useMemo(() => {
        let totalVarInvested = investments.reduce((sum, inv) => sum + (inv.purchasePrice * inv.quantity), 0);
        let portfolioVarValue = investments.reduce((sum, inv) => {
            const currentPrice = marketData[inv.ticker]?.price ?? inv.purchasePrice;
            return sum + (currentPrice * inv.quantity);
        }, 0);
        const totalFixedInvested = fixedIncomeInvestments.reduce((sum, inv) => sum + inv.amountInvested, 0);
        return { 
            totalInvested: totalVarInvested + totalFixedInvested, 
            portfolioValue: portfolioVarValue + totalFixedInvested
        };
    }, [investments, fixedIncomeInvestments, marketData]);
    
    const portfolioPL = portfolioValue - totalInvested;
    
    const netWorth = totalBalance + portfolioValue;
    
    // --- FINANCIAL SCORE CALCULATION ---
    const financialScore = useMemo(() => {
        if (transactions.length === 0) return 0; // Neutral state
        
        let score = 50; // Base score
        
        // 1. Positive Balance? (Max +20)
        if (totalBalance > 1000) score += 20;
        else if (totalBalance > 0) score += 10;
        else if (totalBalance < 0) score -= 25;

        // 2. Savings Rate (Current Month) (Max +20)
        const now = new Date();
        const currentMonth = now.getMonth();
        const income = transactions.filter(t => t.transactionType === TransactionType.INCOME && new Date(t.date).getMonth() === currentMonth).reduce((s, t) => s + t.amount, 0);
        const expense = transactions.filter(t => t.transactionType === TransactionType.EXPENSE && new Date(t.date).getMonth() === currentMonth).reduce((s, t) => s + t.amount, 0);
        
        if (income > 0) {
            const savingsRate = (income - expense) / income;
            if (savingsRate > 0.2) score += 20;
            else if (savingsRate > 0.1) score += 10;
            else if (savingsRate < 0) score -= 15;
        }

        // 3. Predictive Cash Flow Factor (Simulated) (Max +/- 10)
        // Check if last 14 days had more expenses than income (Downward Trend)
        const fortAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const recentIncome = transactions.filter(t => t.transactionType === TransactionType.INCOME && new Date(t.date) >= fortAgo).reduce((s,t) => s + t.amount, 0);
        const recentExpense = transactions.filter(t => t.transactionType === TransactionType.EXPENSE && new Date(t.date) >= fortAgo).reduce((s,t) => s + t.amount, 0);
        
        if (recentExpense > recentIncome + 100) {
            score -= 10; // Penalize for recent burn rate
        } else if (recentIncome > recentExpense) {
            score += 5; // Reward for positive recent accumulation
        }

        // 4. Investments (Max +10)
        if (totalInvested > 0) score += 10;

        // Cap at 0-100
        return Math.max(0, Math.min(100, score));
    }, [totalBalance, transactions, totalInvested]);

    // --- INSIGHTS LOGIC ---
    const updateUserPreferences = async (prefs: Partial<UserPreferences>) => {
        const newPrefs = { ...userPreferences, ...prefs };
        setUserPreferences(newPrefs);
        if (dbProvider === 'neon' && user) {
             try {
                 await callApi('profile_update_preferences', { preferences: newPrefs });
             } catch (e) {
                 console.error('Failed to sync preferences', e);
             }
        }
    };

    const getInsights = () => {
        const insights: { type: 'positive' | 'negative' | 'neutral', message: string, icon: string }[] = [];
        
        // 1. Expense Reduction Insight
        const now = new Date();
        const currentMonth = now.getMonth();
        const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth();
        
        const currentExp = transactions.filter(t => t.transactionType === TransactionType.EXPENSE && new Date(t.date).getMonth() === currentMonth).reduce((s, t) => s + t.amount, 0);
        const prevExp = transactions.filter(t => t.transactionType === TransactionType.EXPENSE && new Date(t.date).getMonth() === prevMonth).reduce((s, t) => s + t.amount, 0);
        
        if (prevExp > 0 && currentExp < prevExp) {
             const reduction = ((prevExp - currentExp) / prevExp) * 100;
             if (reduction > 10) {
                 insights.push({ type: 'positive', message: `Você gastou ${reduction.toFixed(0)}% menos que no mês passado! 🎉`, icon: 'trend_down' });
             }
        } else if (currentExp > prevExp * 1.2 && prevExp > 0) {
             insights.push({ type: 'negative', message: `Alerta: Seus gastos subiram ${(currentExp/prevExp * 100 - 100).toFixed(0)}% este mês.`, icon: 'alert' });
        }

        // 2. Goal Progress
        const completedGoal = goals.find(g => g.currentAmount >= g.targetAmount);
        if (completedGoal) {
             insights.push({ type: 'positive', message: `Meta "${completedGoal.name}" atingida! Parabéns! 🏆`, icon: 'trophy' });
        }
        
        // 3. Net Worth Growth
        if (netWorth > 10000 && portfolioPL > 0) {
             insights.push({ type: 'positive', message: `Seus investimentos estão rendendo bem! (+${(portfolioPL/totalInvested*100).toFixed(1)}%)`, icon: 'trend_up' });
        }
        
        // Default insight if empty
        if (insights.length === 0) {
             insights.push({ type: 'neutral', message: 'Mantenha o foco nos seus objetivos financeiros.', icon: 'neutral' });
        }

        return insights;
    };

    const value: FinancialDataContextType = {
        accounts: accountsWithCurrentBalance,
        transactions,
        investments,
        fixedIncomeInvestments,
        categories,
        goals,
        costCenters,
        recurrences,
        isMei,
        toggleMei,
        meiOpeningDate,
        setMeiOpeningDate,
        marketData,
        marketDataSources,
        marketDataTs,
        isMarketLoading,
        refreshMarketData,
        hasMoreTransactions,
        loadMoreTransactions,
        loadOlderTransactions,
        addAccount,
        updateAccount,
        deleteAccount,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        appendTransactionsLocal,
        addInvestment,
        updateInvestment,
        deleteInvestment,
        addFixedIncomeInvestment,
        updateFixedIncomeInvestment,
        deleteFixedIncomeInvestment,
        addCategory,
        updateCategory,
        deleteCategory,
        addGoal,
        updateGoal,
        deleteGoal,
        addCostCenter,
        updateCostCenter,
        deleteCostCenter,
        addRecurrence,
        updateRecurrence,
        deleteRecurrence,
        totalBalance,
        accountBalances,
        totalInvested,
        portfolioValue,
        portfolioPL,
        netWorth,
        financialScore,
        exportData,
        importData,
        isPrivacyMode,
        togglePrivacyMode,
        getInsights,
        organizationInfo,
        orgRole,
        planInfo,
        subscriptionInfo,
        capabilities,
        entitlements,
        usage,
        viewMode,
        toggleViewMode: () => setViewMode(prev => {
            const businessProfile = (userPreferences?.businessProfile || (isMei ? 'mei' : (organizationInfo?.id ? 'empresa' : 'pf'))).toLowerCase();
            const canOrgMode = businessProfile !== 'pf' && !!organizationInfo?.id;
            if (!canOrgMode) return 'personal';
            const next = prev === 'personal' ? 'organization' : 'personal';
            if (typeof window !== 'undefined') {
                localStorage.setItem('gestor_financeiro_viewMode', JSON.stringify(next));
                // Clear AI cache to ensure fresh predictive analysis on mode switch
                sessionStorage.removeItem(`gf_ai_insights_fetched_${prev}_${organizationInfo?.id || 'personal'}`);
                sessionStorage.removeItem(`gf_ai_insights_fetched_${next}_${organizationInfo?.id || 'personal'}`);
            }
            return next;
        }),
        refreshData: () => setRefreshTrigger(prev => prev + 1),
        userPreferences,
        updateUserPreferences,
        userProfile,
        aiInsights,
        isAiLoading,
        executeAdvisorAction
    };

    return (
        <FinancialDataContext.Provider value={value}>
            {children}
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
