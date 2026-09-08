import { Category, Transaction, TransactionType } from '../types';
import { dateKey } from './formatters';

export type MeiActivity = 'commerce' | 'industry' | 'service' | 'transport';

type ActivityTotals = Record<MeiActivity | 'unclassified', number>;

export interface MeiFiscalCalculation {
    year: number;
    annualRevenue: number;
    businessExpenses: number;
    grossBusinessProfit: number;
    revenueByActivity: ActivityTotals;
    monthlyRevenue: Array<{ month: string; total: number } & ActivityTotals>;
    effectiveAnnualLimit: number;
    remainingLimit: number;
    limitUsagePercent: number;
    irpfExemptAmount: number;
    estimatedTaxableAmount: number;
    unclassifiedBusinessRevenueCount: number;
    unclassifiedBusinessRevenueAmount: number;
}

const ANNUAL_REVENUE_LIMIT = 81_000;
const EXEMPT_PERCENT_BY_ACTIVITY: Record<MeiActivity, number> = {
    commerce: 0.08,
    industry: 0.08,
    service: 0.32,
    transport: 0.16,
};

const emptyActivities = (): ActivityTotals => ({
    commerce: 0,
    industry: 0,
    service: 0,
    transport: 0,
    unclassified: 0,
});

const activityFor = (transaction: Transaction, categories: Category[]): MeiActivity | undefined => {
    const category = categories.find(item => item.name === transaction.category);
    const activity = category?.meiCategory;
    return activity === 'commerce' || activity === 'industry' || activity === 'service' || activity === 'transport'
        ? activity
        : undefined;
};

const isYear = (transaction: Transaction, year: number) => {
    const date = dateKey(transaction.date);
    return Number(date.slice(0, 4)) === year;
};

export const calculateMeiFiscal = ({
    transactions,
    categories,
    year,
    openingDate,
}: {
    transactions: Transaction[];
    categories: Category[];
    year: number;
    openingDate?: string;
}): MeiFiscalCalculation => {
    const revenueByActivity = emptyActivities();
    const months = new Map<string, ActivityTotals>();
    let annualRevenue = 0;
    let businessExpenses = 0;
    let unclassifiedBusinessRevenueCount = 0;

    for (const transaction of transactions) {
        if (!isYear(transaction, year) || transaction.transactionType === TransactionType.TRANSFER) continue;
        const amount = Number(transaction.amount || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        if (transaction.transactionType === TransactionType.INCOME && transaction.isBusinessRevenue) {
            const activity = activityFor(transaction, categories);
            const key = activity || 'unclassified';
            const month = dateKey(transaction.date).slice(0, 7);
            const monthly = months.get(month) || emptyActivities();

            annualRevenue += amount;
            revenueByActivity[key] += amount;
            monthly[key] += amount;
            months.set(month, monthly);
            if (!activity) unclassifiedBusinessRevenueCount += 1;
        }

        if (transaction.transactionType === TransactionType.EXPENSE && transaction.isBusinessExpense) {
            businessExpenses += amount;
        }
    }

    const openedThisYear = openingDate && Number(dateKey(openingDate).slice(0, 4)) === year;
    const openingMonth = openedThisYear ? Number(dateKey(openingDate!).slice(5, 7)) : 1;
    const activeMonths = Math.max(1, 13 - openingMonth);
    const effectiveAnnualLimit = openedThisYear ? ANNUAL_REVENUE_LIMIT * activeMonths / 12 : ANNUAL_REVENUE_LIMIT;
    const irpfExemptAmount = (Object.keys(EXEMPT_PERCENT_BY_ACTIVITY) as MeiActivity[])
        .reduce((total, activity) => total + revenueByActivity[activity] * EXEMPT_PERCENT_BY_ACTIVITY[activity], 0);
    const grossBusinessProfit = annualRevenue - businessExpenses;
    const monthlyRevenue = Array.from({ length: 12 }, (_, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`;
        const activities = months.get(month) || emptyActivities();
        return {
            month,
            ...activities,
            total: Object.values(activities).reduce((total, value) => total + value, 0),
        };
    });

    return {
        year,
        annualRevenue,
        businessExpenses,
        grossBusinessProfit,
        revenueByActivity,
        monthlyRevenue,
        effectiveAnnualLimit,
        remainingLimit: effectiveAnnualLimit - annualRevenue,
        limitUsagePercent: effectiveAnnualLimit > 0 ? annualRevenue / effectiveAnnualLimit * 100 : 0,
        irpfExemptAmount,
        estimatedTaxableAmount: Math.max(0, grossBusinessProfit - irpfExemptAmount),
        unclassifiedBusinessRevenueCount,
        unclassifiedBusinessRevenueAmount: revenueByActivity.unclassified,
    };
};
