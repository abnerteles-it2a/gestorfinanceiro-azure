import { Category, Transaction, TransactionType } from '../types';
import { calculateMeiFiscal } from './meiFiscalCalculator';
import { dateKey } from './formatters';

export type MonthlyClosingStatus = 'open' | 'reviewed' | 'closed' | 'reopened';

export interface MeiMonthlyClosing {
    year: number;
    month: number;
    status: MonthlyClosingStatus;
    revenue: number;
    expenses: number;
    result: number;
    revenueByActivity: Record<string, number>;
    unclassifiedRevenue: number;
    das?: { status: string; totalAmount: number; dueDate?: string };
    entries: Transaction[];
    warnings: string[];
    rulesVersion: string;
}

export const calculateMeiMonthlyClosing = ({ transactions, categories, obligations = [], year, month, status = 'open' }: {
    transactions: Transaction[];
    categories: Category[];
    obligations?: any[];
    year: number;
    month: number;
    status?: MonthlyClosingStatus;
}): MeiMonthlyClosing => {
    const monthTransactions = transactions.filter(transaction => {
        if (transaction.transactionType === TransactionType.TRANSFER) return false;
        const date = dateKey(transaction.date).slice(0, 7);
        return date === `${year}-${String(month).padStart(2, '0')}`;
    });
    const fiscal = calculateMeiFiscal({ transactions: monthTransactions, categories, year });
    const das = obligations.find(item => item.obligation_type === 'das_mei' && Number(item.reference_year) === year && Number(item.reference_month) === month);
    const warnings: string[] = [];
    if (fiscal.unclassifiedBusinessRevenueAmount > 0) warnings.push('Há receita empresarial sem atividade MEI classificada.');
    if (!das) warnings.push('A obrigação DAS desta competência não foi gerada.');
    else if (das.status !== 'paid') warnings.push(`DAS da competência está ${das.status}.`);

    return {
        year,
        month,
        status,
        revenue: fiscal.annualRevenue,
        expenses: fiscal.businessExpenses,
        result: fiscal.grossBusinessProfit,
        revenueByActivity: fiscal.revenueByActivity,
        unclassifiedRevenue: fiscal.unclassifiedBusinessRevenueAmount,
        das: das ? { status: das.status, totalAmount: Number(das.total_amount || 0), dueDate: das.due_date } : undefined,
        entries: monthTransactions.filter(transaction => transaction.isBusinessRevenue || transaction.isBusinessExpense),
        warnings,
        rulesVersion: 'phase3-closing-v1',
    };
};
