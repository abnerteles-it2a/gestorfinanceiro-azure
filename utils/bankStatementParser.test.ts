import { test, describe } from 'node:test';
import assert from 'node:assert';
import { 
    parseOFXContent, 
    parseCSVContent, 
    flagDuplicates, 
    parseBrazilianNumber,
    normalizeDate,
    suggestCategory
} from './bankStatementParser';
import { TransactionType, Category, Transaction } from '../types';

describe('bankStatementParser', () => {

    test('parseBrazilianNumber correctly parses BR currency notations', () => {
        assert.strictEqual(parseBrazilianNumber('1.250,50'), 1250.5);
        assert.strictEqual(parseBrazilianNumber('R$ 49,90'), 49.9);
        assert.strictEqual(parseBrazilianNumber('-150,00'), -150);
        assert.strictEqual(parseBrazilianNumber('350.00'), 350);
    });

    test('normalizeDate normalizes OFX, BR and ISO formats to YYYY-MM-DD', () => {
        assert.strictEqual(normalizeDate('20260908120000[-03:EST]'), '2026-09-08');
        assert.strictEqual(normalizeDate('15/09/2026'), '2026-09-15');
        assert.strictEqual(normalizeDate('2026-09-20'), '2026-09-20');
    });

    test('suggestCategory identifies appropriate categories from keywords', () => {
        const mockCategories: Category[] = [
            { id: '1', name: 'Alimentação', type: 'Saída' },
            { id: '2', name: 'Transporte', type: 'Saída' },
            { id: '3', name: 'Assinaturas', type: 'Saída' },
            { id: '4', name: 'Salário', type: 'Entrada' }
        ];

        assert.strictEqual(suggestCategory('PAGTO UBER DO BRASIL', TransactionType.EXPENSE, mockCategories), 'Transporte');
        assert.strictEqual(suggestCategory('IFOOD *RESTAURANTE', TransactionType.EXPENSE, mockCategories), 'Alimentação');
        assert.strictEqual(suggestCategory('NETFLIX.COM MENSALIDADE', TransactionType.EXPENSE, mockCategories), 'Assinaturas');
        assert.strictEqual(suggestCategory('TED RECEBIDA FOLHA SALARIO', TransactionType.INCOME, mockCategories), 'Salário');
    });

    test('parseOFXContent extracts transactions accurately', () => {
        const sampleOFX = `
OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260901
<DTEND>20260910
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260905120000
<TRNAMT>-120.50
<FITID>TX1001
<MEMO>PAGTO UBER TRIP
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260906100000
<TRNAMT>4500.00
<FITID>TX1002
<MEMO>SALARIO MENSAL IT2A
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

        const res = parseOFXContent(sampleOFX, []);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.items.length, 2);
        
        // Debit item
        assert.strictEqual(res.items[0].amount, 120.50);
        assert.strictEqual(res.items[0].transactionType, TransactionType.EXPENSE);
        assert.strictEqual(res.items[0].date, '2026-09-05');
        
        // Credit item
        assert.strictEqual(res.items[1].amount, 4500.00);
        assert.strictEqual(res.items[1].transactionType, TransactionType.INCOME);
        assert.strictEqual(res.items[1].date, '2026-09-06');
    });

    test('parseCSVContent parses semicolon and comma separated statements', () => {
        const sampleCSV = `Data;Descrição;Valor\n05/09/2026;Supermercado Pão de Açúcar;-250,90\n07/09/2026;Pix Recebido Cliente;1200,00`;
        const res = parseCSVContent(sampleCSV, []);
        assert.strictEqual(res.success, true);
        assert.strictEqual(res.items.length, 2);
        assert.strictEqual(res.items[0].amount, 250.90);
        assert.strictEqual(res.items[0].transactionType, TransactionType.EXPENSE);
        assert.strictEqual(res.items[1].amount, 1200.00);
        assert.strictEqual(res.items[1].transactionType, TransactionType.INCOME);
    });

    test('flagDuplicates prevents double-counting of existing transactions', () => {
        const existing: Transaction[] = [
            {
                id: 'tx_old_1',
                date: '2026-09-05T00:00:00.000Z',
                accountId: 'acc_1',
                transactionType: TransactionType.EXPENSE,
                category: 'Alimentação',
                description: 'Supermercado',
                amount: 250.90,
                paymentMethod: 'Débito'
            }
        ];

        const candidates = [
            {
                id: 'cand_1',
                date: '2026-09-05',
                amount: 250.90,
                transactionType: TransactionType.EXPENSE,
                category: 'Alimentação',
                description: 'Supermercado Pão de Açúcar',
                paymentMethod: 'Débito',
                isDuplicate: false,
                selected: true
            },
            {
                id: 'cand_2',
                date: '2026-09-06',
                amount: 99.00,
                transactionType: TransactionType.EXPENSE,
                category: 'Transporte',
                description: 'Uber',
                paymentMethod: 'Cartão',
                isDuplicate: false,
                selected: true
            }
        ];

        const result = flagDuplicates(candidates, existing, 'acc_1');
        assert.strictEqual(result.duplicateCount, 1);
        assert.strictEqual(result.items[0].isDuplicate, true);
        assert.strictEqual(result.items[0].selected, false); // protected from auto-selection
        assert.strictEqual(result.items[1].isDuplicate, false);
        assert.strictEqual(result.items[1].selected, true);
    });
});
