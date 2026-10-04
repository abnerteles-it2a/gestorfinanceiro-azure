import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Category, Transaction, TransactionType } from '../types';
import { calculateMeiFiscal } from './meiFiscalCalculator';

const categories: Category[] = [
    { id: 'commerce', name: 'Vendas', type: 'Entrada', meiCategory: 'commerce' },
    { id: 'industry', name: 'Produção', type: 'Entrada', meiCategory: 'industry' },
    { id: 'service', name: 'Consultoria', type: 'Entrada', meiCategory: 'service' },
    { id: 'transport', name: 'Fretes', type: 'Entrada', meiCategory: 'transport' },
    { id: 'uncategorized', name: 'Receita Avulsa', type: 'Entrada' },
    { id: 'expense', name: 'Operação', type: 'Saída' },
];

const transaction = (overrides: Partial<Transaction>): Transaction => ({
    id: crypto.randomUUID(),
    date: '2026-01-15',
    accountId: 'account-1',
    transactionType: TransactionType.INCOME,
    category: 'Vendas',
    description: 'Lançamento de teste',
    amount: 100,
    paymentMethod: 'PIX',
    ...overrides,
});

const calculate = (transactions: Transaction[], openingDate?: string) => calculateMeiFiscal({
    transactions,
    categories,
    year: 2026,
    openingDate,
});

describe('calculateMeiFiscal', () => {
    it('inclui somente receitas empresariais e exclui entradas pessoais e transferências', () => {
        const result = calculate([
            transaction({ amount: 1_000, isBusinessRevenue: true, category: 'Vendas' }),
            transaction({ amount: 5_000, isBusinessRevenue: false, category: 'Vendas', description: 'Salário PF' }),
            transaction({ amount: 300, transactionType: TransactionType.TRANSFER, isBusinessRevenue: true, category: 'Transferência' }),
        ]);

        assert.equal(result.annualRevenue, 1_000);
        assert.equal(result.revenueByActivity.commerce, 1_000);
        assert.equal(result.revenueByActivity.unclassified, 0);
    });

    it('classifica receitas empresariais por atividade e calcula isenção por percentual', () => {
        const result = calculate([
            transaction({ amount: 1_000, isBusinessRevenue: true, category: 'Vendas' }),
            transaction({ amount: 2_000, isBusinessRevenue: true, category: 'Produção' }),
            transaction({ amount: 3_000, isBusinessRevenue: true, category: 'Consultoria' }),
            transaction({ amount: 4_000, isBusinessRevenue: true, category: 'Fretes' }),
        ]);

        assert.equal(result.revenueByActivity.commerce, 1_000);
        assert.equal(result.revenueByActivity.industry, 2_000);
        assert.equal(result.revenueByActivity.service, 3_000);
        assert.equal(result.revenueByActivity.transport, 4_000);
        assert.equal(result.annualRevenue, 10_000);
        assert.equal(result.irpfExemptAmount, 1_840);
    });

    it('mantém receita sem atividade no faturamento, mas não presume isenção', () => {
        const result = calculate([
            transaction({ amount: 1_200, isBusinessRevenue: true, category: 'Receita Avulsa' }),
        ]);

        assert.equal(result.annualRevenue, 1_200);
        assert.equal(result.revenueByActivity.unclassified, 1_200);
        assert.equal(result.unclassifiedBusinessRevenueCount, 1);
        assert.equal(result.unclassifiedBusinessRevenueAmount, 1_200);
        assert.equal(result.irpfExemptAmount, 0);
    });

    it('considera somente despesas empresariais do exercício', () => {
        const result = calculate([
            transaction({ amount: 2_000, isBusinessRevenue: true }),
            transaction({ amount: 500, transactionType: TransactionType.EXPENSE, category: 'Operação', isBusinessExpense: true }),
            transaction({ amount: 250, transactionType: TransactionType.EXPENSE, category: 'Operação', isBusinessExpense: false }),
            transaction({ amount: 300, transactionType: TransactionType.EXPENSE, category: 'Operação', isBusinessExpense: true, date: '2025-12-31' }),
        ]);

        assert.equal(result.businessExpenses, 500);
        assert.equal(result.grossBusinessProfit, 1_500);
    });

    it('ignora lançamentos fora do exercício e valores inválidos', () => {
        const result = calculate([
            transaction({ amount: 100, isBusinessRevenue: true, date: '2025-12-31' }),
            transaction({ amount: 0, isBusinessRevenue: true }),
            transaction({ amount: -10, isBusinessRevenue: true }),
            transaction({ amount: Number.NaN, isBusinessRevenue: true }),
        ]);

        assert.equal(result.annualRevenue, 0);
        assert.equal(result.businessExpenses, 0);
    });

    it('calcula o teto proporcional para abertura no exercício', () => {
        assert.equal(calculate([], '2026-01-01').effectiveAnnualLimit, 81_000);
        assert.equal(calculate([], '2026-06-01').effectiveAnnualLimit, 47_250);
        assert.equal(calculate([], '2026-12-01').effectiveAnnualLimit, 6_750);
        assert.equal(calculate([], '2025-06-01').effectiveAnnualLimit, 81_000);
    });

    it('produz doze meses e concilia a série mensal com o faturamento anual', () => {
        const result = calculate([
            transaction({ amount: 1_000, isBusinessRevenue: true, date: '2026-01-15' }),
            transaction({ amount: 2_500, isBusinessRevenue: true, category: 'Consultoria', date: '2026-03-20' }),
        ]);

        assert.equal(result.monthlyRevenue.length, 12);
        assert.equal(result.monthlyRevenue[0].total, 1_000);
        assert.equal(result.monthlyRevenue[2].total, 2_500);
        assert.equal(result.monthlyRevenue.reduce((sum, month) => sum + month.total, 0), result.annualRevenue);
    });

    it('nunca retorna rendimento tributável negativo', () => {
        const result = calculate([
            transaction({ amount: 1_000, isBusinessRevenue: true, category: 'Consultoria' }),
            transaction({ amount: 2_000, transactionType: TransactionType.EXPENSE, category: 'Operação', isBusinessExpense: true }),
        ]);

        assert.equal(result.grossBusinessProfit, -1_000);
        assert.equal(result.estimatedTaxableAmount, 0);
    });
});
