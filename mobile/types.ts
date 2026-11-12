export interface BankAccount {
    id: string;
    name: string;
    bank: string;
    initialBalance: number;
    currentBalance?: number; // Calculated or from API
}

export enum TransactionType {
    INCOME = 'Entrada',
    EXPENSE = 'Saída',
    TRANSFER = 'Transferência',
}

export interface Usage {
  transactionsUsed: number;
  transactionsLimit: number;
  storageUsed: number; 
  storageLimit: number;
  apiCalls?: number;
}

export interface Entitlements {
  features?: string[];
  modules: {
    investments: boolean;
    docsVault: boolean;
    reports: boolean;
    financeAccounting: boolean;
    aiConcierge?: 'basic' | 'advanced' | 'strategic';
    corporateManagement?: boolean;
    dualMode?: boolean; 
  };
  limits: {
    transactionsPerMonth: number;
    accounts: number;
    users: number;
    storageBytes: number;
  };
}

export interface SubscriptionInfo {
    provider?: string; 
    status?: string; 
    periodStart?: string | null; 
    periodEnd?: string | null;
    isTrial?: boolean;
    isExpired?: boolean;
    isInsideGrace?: boolean;
    isTotalBlocked?: boolean;
    isOverQuota?: boolean;
    gracePeriodDays?: number;
    billingPeriod?: 'monthly' | 'yearly' | 'trial';
}

export interface PlanCapabilities {
    canAccessInvestments: boolean;
    canAccessFinance: boolean;
    canAccessDocs: boolean;
    canAccessReports: boolean;
    canAccessAdmin?: boolean;
}

export interface PlanInfo {
  id?: string;
  name: string;
  tier: 'starter' | 'plus' | 'pro';
  seats?: number;
  limits?: any;
}

export interface Transaction {
    id: string;
    date: string;
    accountId: string;
    transactionType: TransactionType;
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
    costCenterId?: string;
    toAccountId?: string;
    isBusinessRevenue?: boolean;
    isBusinessExpense?: boolean;
}

export interface Category {
    id: string;
    name: string;
    type: 'Entrada' | 'Saída';
    icon?: string;
    meiCategory?: 'commerce' | 'service' | 'industry' | 'transport';
}

export interface User {
    id: string;
    email: string;
    isAdmin: boolean;
}

export interface AssetTypeEnum {
    FIXED_INCOME: 'Renda Fixa';
    STOCK: 'Ação';
    REAL_ESTATE_FUND: 'Fundo Imobiliário';
    CRYPTO: 'Criptomoeda';
    INTERNATIONAL_STOCK: 'Ação Internacional';
    REIT: 'REIT';
}

export const AssetType = {
    FIXED_INCOME: 'Renda Fixa',
    STOCK: 'Ação',
    REAL_ESTATE_FUND: 'Fundo Imobiliário',
    CRYPTO: 'Criptomoeda',
    INTERNATIONAL_STOCK: 'Ação Internacional',
    REIT: 'REIT',
} as const;

export interface Investment {
    id: string;
    type: string;
    ticker: string;
    quantity: number;
    purchasePrice: number;
    purchaseDate: string;
    name?: string; 
    issuer?: string;
    amountInvested?: number;
    yieldRate?: string;
    maturityDate?: string;
    currentPrice?: number;
}

export interface FixedIncomeInvestment {
    id: string;
    type: typeof AssetType.FIXED_INCOME;
    name: string;
    issuer: string;
    amountInvested: number;
    yieldRate: string;
    purchaseDate: string;
    maturityDate: string;
}

export type AnyInvestment = Investment | FixedIncomeInvestment;

export interface Goal {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    color?: string;
}

export interface CostCenter {
    id: string;
    name: string;
    orgId?: string;
}

export interface Payable {
    id: string;
    dueDate: string;
    description: string;
    amount: number;
    category: string;
    status: 'open' | 'paid';
    barcode?: string;
    recipientName?: string;
}

export interface Receivable {
    id: string;
    dueDate: string;
    title: string;
    amount: number;
    status: 'open' | 'received';
    description?: string;
    category?: string;
}

export interface Recurrence {
    id: string;
    label: string;
    amount: number;
    category: string;
    accountId: string;
    paymentMethod: string;
    dayOfMonth?: number;
    businessDayRule?: string;
    costCenterId?: string;
    active: boolean;
}

export interface UserPreferences {
    welcome_dismissed?: boolean;
    businessProfile?: 'pf' | 'mei' | 'empresa';
    isMei?: boolean;
}
