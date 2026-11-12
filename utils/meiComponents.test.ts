import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { calculateMeiFiscal } from './meiFiscalCalculator';
import { TransactionType } from '../types';

// Execute the real component and event handlers with only React hooks/context/HTTP
// adapted. No DOM, provider, API server, or database is required.
function mount(name: string, context: any, initialRows: any[] = [], failMutation = false) {
    const file = new URL(`../components/${name}.tsx`, import.meta.url);
    const require = createRequire(file);
    const states: any[] = [];
    const deps: any[][] = [];
    let cursor = 0;
    let effects: (() => void)[] = [];
    let rows = initialRows;
    const requests: any[] = [];
    const fiscalResults: ReturnType<typeof calculateMeiFiscal>[] = [];
    const hooks = {
        useState(initial: any) {
            const index = cursor++;
            if (!(index in states)) states[index] = initial;
            return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
        },
        useMemo: (callback: () => any) => callback(),
        useEffect(callback: () => void, nextDeps: any[]) {
            const index = cursor++;
            if (!deps[index] || nextDeps.some((value, i) => value !== deps[index][i])) effects.push(callback);
            deps[index] = nextDeps;
        },
    };
    const module = { exports: {} as any };
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    }).outputText;
    runInNewContext(compiled, {
        module, exports: module.exports,
        require(id: string) {
            if (id === 'react') return { ...hooks, default: hooks };
            if (id.includes('FinancialDataContext')) return { useFinancialData: () => context };
            if (id.includes('meiFiscalCalculator')) return { calculateMeiFiscal(input: any) {
                const result = calculateMeiFiscal(input); fiscalResults.push(result); return result;
            } };
            if (id === './shared/Modal') return { Modal: 'modal' };
            if (id === './icons') return new Proxy({}, { get: () => 'icon' });
            return require(id);
        },
        window: { localStorage: { getItem: () => null } },
        alert: () => {}, confirm: () => true,
        fetch: async (_url: string, options: any) => {
            const request = JSON.parse(options.body);
            requests.push({ ...request, headers: options.headers });
            if (failMutation && request.type !== 'mei_obligations_list') return { ok: false };
            if (request.type === 'mei_obligation_mark_paid') rows = rows.map(row => row.id === request.data.id ? { ...row, status: 'paid' } : row);
            if (request.type === 'mei_obligation_upsert') rows = rows.map(row => row.id === request.data.id ? { ...row, status: 'scheduled' } : row);
            return { ok: true, json: async () => ({ rows }) };
        },
    });
    const render = () => { cursor = 0; return module.exports[name]({ isOpen: true, onClose() {} }); };
    const flush = async () => {
        const pending = effects; effects = [];
        pending.forEach(effect => effect());
        await new Promise(resolve => setImmediate(resolve));
    };
    return { render, flush, requests, fiscalResults };
}

function elements(node: any): any[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== 'object') return [];
    return [node, ...elements(node.props?.children)];
}

const year = new Date().getFullYear();
const fullHistory = Array.from({ length: 150 }, (_, i) => ({
    id: `revenue-${i}`, date: `${year}-01-15`, accountId: 'bank',
    transactionType: TransactionType.INCOME, category: 'Vendas', description: 'Venda',
    amount: 100, paymentMethod: 'PIX', isBusinessRevenue: true,
}));
const makeContext = () => ({
    transactions: fullHistory.slice(0, 100), financialTransactions: fullHistory,
    categories: [{ id: 'sales', name: 'Vendas', type: 'Entrada', meiCategory: 'commerce' }],
    accounts: [{ id: 'bank' }], isMei: true, viewMode: 'organization', refreshData() {},
});

describe('MEI component contracts', () => {
    for (const name of ['MeiMonitoringWidget', 'MeiReportsModal']) {
        it(`${name} computes from full history regardless of the visible page`, () => {
            const context = makeContext();
            const component = mount(name, context);
            component.render();
            context.transactions = fullHistory.slice(100);
            component.render();
            context.transactions = [];
            component.render();
            for (const fiscal of component.fiscalResults) {
                assert.equal(fiscal.annualRevenue, 15_000);
                assert.equal(fiscal.monthlyRevenue[0].total, 15_000);
                assert.equal(fiscal.irpfExemptAmount, 1_200);
            }
            context.financialTransactions = [...fullHistory, { ...fullHistory[0], id: 'new', amount: 500 }];
            component.render();
            assert.equal(component.fiscalResults.at(-1)?.annualRevenue, 15_500);
        });
    }

    it('does not refresh or display paid after a rejected payment', async () => {
        let refreshes = 0;
        const component = mount('MeiReportsModal', { ...makeContext(), refreshData: () => { refreshes++; } }, [{
            id: 'das-dec', obligation_type: 'das_mei', reference_year: year, reference_month: 12,
            due_date: `${year + 1}-01-20`, principal_amount: 80, total_amount: 80, status: 'pending',
        }], true);
        component.render();
        await component.flush();
        const tree = component.render();
        const pay = elements(tree).filter(node => node.type === 'button' && node.props.children === 'Pagar Agora').at(-1);
        await pay.props.onClick();
        const after = component.render();
        await component.flush();
        assert.equal(refreshes, 0);
        assert.equal(component.requests.filter(item => item.type === 'mei_obligations_list').length, 1);
        assert.equal(elements(after).filter(node => node.type === 'button' && node.props.children === 'Pagar Agora').length, 12);
    });

    it('sends the shared December schedule contract and reloads after scheduling/payment', async () => {
        let refreshes = 0;
        const component = mount('MeiReportsModal', { ...makeContext(), refreshData: () => { refreshes++; } }, [{
            id: 'das-dec', obligation_type: 'das_mei', reference_year: year, reference_month: 12,
            due_date: `${year + 1}-02-05`, principal_amount: '80', interest_amount: '2', penalty_amount: '3', total_amount: '85',
            status: 'pending', source: 'manual', rules_version: 'official-input', notes: 'Override',
        }]);
        component.render();
        await component.flush();
        let tree = component.render();
        const schedule = elements(tree).filter(node => node.type === 'button' && node.props.children === 'Agendar').at(-1);
        assert.equal(schedule.props.disabled, false);
        await schedule.props.onClick();
        const request = component.requests.find(item => item.type === 'mei_obligation_upsert');
        assert.equal(request.data.id, 'das-dec');
        assert.equal(request.data.referenceMonth, 12);
        assert.equal(request.data.dueDate, `${year + 1}-02-05`);
        assert.equal(request.data.principalAmount, 80);
        assert.equal(request.data.interestAmount, 2);
        assert.equal(request.data.penaltyAmount, 3);
        assert.equal(request.headers['x-view-mode'], 'organization');
        component.render();
        await component.flush();
        tree = component.render();
        const pay = elements(tree).filter(node => node.type === 'button' && node.props.children === 'Pagar Agora').at(-1);
        assert.equal(pay.props.disabled, false);
        await pay.props.onClick();
        component.render();
        await component.flush();
        tree = component.render();
        assert.equal(refreshes, 2);
        assert.equal(component.requests.filter(item => item.type === 'mei_obligations_list').length, 3);
        assert.equal(elements(tree).filter(node => node.type === 'button' && node.props.children === 'Pagar Agora').length, 11);
        assert.ok(elements(tree).some(node => JSON.stringify(node.props?.children) === '["Status: ","Pago"]'));
    });
});
