import { describe, expect, it } from 'vitest';
import { TransactionType } from '../types';
import { calculateMeiMonthlyClosing } from './meiMonthlyClosing';

const categories = [{ id: 'service', name: 'Serviço', type: 'Entrada' as const, meiCategory: 'service' as const }];
const tx = (overrides: any = {}) => ({
    id: crypto.randomUUID(), date: '2026-08-10', accountId: 'a', transactionType: TransactionType.INCOME,
    category: 'Serviço', description: 'Receita', amount: 100, paymentMethod: 'PIX', ...overrides,
});

describe('calculateMeiMonthlyClosing', () => {
    it('reconciles monthly business revenue and expenses and excludes transfers', () => {
        const result = calculateMeiMonthlyClosing({
            year: 2026,
            month: 8,
            categories,
            transactions: [
                tx({ amount: 1000, isBusinessRevenue: true }),
                tx({ amount: 200, transactionType: TransactionType.EXPENSE, isBusinessExpense: true }),
                tx({ amount: 500, transactionType: TransactionType.TRANSFER }),
            ],
            obligations: [{ obligation_type: 'das_mei', reference_year: 2026, reference_month: 8, status: 'pending', total_amount: 0 }],
        });
        expect(result.revenue).toBe(1000);
        expect(result.expenses).toBe(200);
        expect(result.result).toBe(800);
        expect(result.entries).toHaveLength(2);
        expect(result.warnings).toContain('DAS da competência está pending.');
    });

    it('warns about missing activity and missing obligation', () => {
        const result = calculateMeiMonthlyClosing({
            year: 2026,
            month: 8,
            categories,
            transactions: [tx({ category: 'Outra', isBusinessRevenue: true })],
        });
        expect(result.unclassifiedRevenue).toBe(100);
        expect(result.warnings).toHaveLength(2);
    });
});
