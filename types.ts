
export interface BankAccount {
    id: string;
    name: string;
    bank: string;
    initialBalance: number;
    balance?: number; // Calculated dynamically
}

export enum TransactionType {
    INCOME = 'Entrada',
    EXPENSE = 'Saída',
    TRANSFER = 'Transferência',
}

export interface Usage {
  transactionsUsed: number;
  transactionsLimit: number;
  storageUsed: number; // In bytes
  storageLimit: number; // In bytes
  apiCalls: number;
  lastMonthTransactions?: number;
}

export interface Entitlements {
  features: string[];
  modules: {
    investments: boolean;
    docsVault: boolean;
    reports: boolean;
    financeAccounting: boolean;
    aiConcierge: 'basic' | 'advanced' | 'strategic';
    dualMode: boolean; // PF + PJ Toggle
  };
  limits: {
    transactionsPerMonth: number;
    accounts: number;
    users: number;
    backupFrequency: 'none' | 'weekly' | 'daily' | 'hourly';
    storageBytes: number;
  };
}

export interface PlanInfo {
  tier: 'starter' | 'plus' | 'pro';
  name: string;
  expiresAt?: string;
  isTrial: boolean;
  status: 'active' | 'past_due' | 'canceled';
}

export interface Capabilities {
  canAccessInvestments: boolean;
  canAccessDocs: boolean;
  canAccessFinance: boolean;
  canAccessReports: boolean;
  canAccessAdmin: boolean;
  canSwitchMode: boolean; // Pro only
}

export interface Transaction {
    id: string;
    date: string; // ISO string format
    accountId: string;
    transactionType: TransactionType;
    category: string;
    description: string;
    amount: number;
    paymentMethod: string;
    costCenterId?: string;
    // For transfers
    toAccountId?: string;
    isBusinessRevenue?: boolean;
    isBusinessExpense?: boolean;
}

export interface CostCenter {
    id: string;
    name: string;
    orgId?: string;
}

export interface UserPreferences {
    welcome_dismissed?: boolean;
    isMei?: boolean;
    businessProfile?: 'pf' | 'mei' | 'empresa';
    meiOpeningDate?: string;
    reportProfile?: {
        companyName?: string;
        tradeName?: string;
        cnpj?: string;
        email?: string;
        phone?: string;
        addressLine1?: string;
        addressLine2?: string;
        city?: string;
        state?: string;
        zip?: string;
    };
    weatherMode?: 'auto' | 'geo' | 'fixed';
    weatherCity?: string;
    smartCategoryPrefs?: Record<string, string>;
    smartAccountPrefs?: Record<string, string>;
    smartPaymentPrefs?: Record<string, string>;
    goalThreshold?: number;
    budgetThreshold?: number;
}

export interface Category {
    id: string;
    name: string;
    type: 'Entrada' | 'Saída';
    budget?: number; // Monthly budget limit
    icon?: string; // Emoji or icon identifier
    meiCategory?: 'commerce' | 'service' | 'industry' | 'transport'; // MEI specific classification
}

export interface Goal {
    id: string;
    name: string;
    targetAmount: number;
    currentAmount: number;
    deadline?: string;
    color?: string;
    destAccountId?: string;
    preferredContributionPct?: number;
}

export enum AssetType {
    FIXED_INCOME = 'Renda Fixa',
    STOCK = 'Ação',
    REAL_ESTATE_FUND = 'Fundo Imobiliário',
    CRYPTO = 'Criptomoeda',
    INTERNATIONAL_STOCK = 'Ação Internacional',
    REIT = 'REIT',
}

// For variable income assets
export interface Investment {
    id: string;
    type: Exclude<AssetType, AssetType.FIXED_INCOME>;
    ticker: string; // e.g., PETR4, AAPL, BTC
    quantity: number;
    purchasePrice: number;
    purchaseDate: string; // ISO string format
}

// For fixed income assets
export interface FixedIncomeInvestment {
    id: string;
    type: AssetType.FIXED_INCOME;
    name: string; // e.g., CDB Liquidez Diária
    issuer: string; // e.g., Banco Inter
    amountInvested: number;
    yieldRate: string; // e.g., "110% CDI" or "IPCA + 5.5%"
    purchaseDate: string;
    maturityDate: string;
}

export type AnyInvestment = Investment | FixedIncomeInvestment;

export interface Recurrence {
    id: string;
    label: string;
    amount: number;
    category: string;
    accountId: string;
    paymentMethod: string;
    type: 'Entrada' | 'Saída';
    dayOfMonth?: number;
    businessDayRule?: 'fifth' | 'exact';
    costCenterId?: string;
    active: boolean;
}

export type ModalType = 'transaction' | 'account' | 'investment' | null;
