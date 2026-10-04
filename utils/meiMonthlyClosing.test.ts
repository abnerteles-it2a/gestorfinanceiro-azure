import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
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
        assert.equal(result.revenue, 1000);
        assert.equal(result.expenses, 200);
        assert.equal(result.result, 800);
        assert.equal(result.entries.length, 2);
        assert.ok(result.warnings.includes('DAS da competência está pending.'));
    });

    it('warns about missing activity and missing obligation', () => {
        const result = calculateMeiMonthlyClosing({
            year: 2026,
            month: 8,
            categories,
            transactions: [tx({ category: 'Outra', isBusinessRevenue: true })],
        });
        assert.equal(result.unclassifiedRevenue, 100);
        assert.equal(result.warnings.length, 2);
    });
});
