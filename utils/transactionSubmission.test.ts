import test from 'node:test';
import assert from 'node:assert/strict';
import { TransactionType } from '../types';
import { buildTransactionSubmission, createTransactionSubmission, hasPotentialTransactionDuplicate, type TransactionSubmissionInput } from './transactionSubmission';

const input = (overrides: Partial<TransactionSubmissionInput> = {}): TransactionSubmissionInput => ({
    transaction: {
        accountId: 'account', transactionType: TransactionType.EXPENSE,
        amount: 100, description: 'Compra', category: 'Compras', paymentMethod: 'Cartão de Crédito',
        date: '2026-01-10', costCenterId: 'org-center', isBusinessRevenue: false, isBusinessExpense: true,
    },
    purchaseDate: '2026-01-10', today: '2026-11-12', count: 3, frequency: 'monthly',
    closingDay: 25, dueDay: 5, viewMode: 'organization', ...overrides,
});
const ok = (init?: RequestInit) => new Response(JSON.stringify({
    operationId: JSON.parse(String(init?.body)).data.operationId, replayed: false, rows: [{ id: 'created-obligation' }],
}), { status: 200 });
function harness(value = input(), options: { duplicate?: boolean; transport?: typeof fetch; isCurrent?: () => boolean; addTransaction?: (value: any) => Promise<void> } = {}) {
    const bodies: any[] = [];
    const headers: Headers[] = [];
    const transactions: any[] = [];
    const controller = createTransactionSubmission(value, {
        duplicate: options.duplicate ?? false,
        isCurrent: options.isCurrent ?? (() => true),
        getToken: () => 'test-session',
        addTransaction: options.addTransaction ?? (async tx => { transactions.push(tx); }),
        transport: async (url, init) => {
            assert.equal(url, '/api/query');
            assert.equal(init?.method, 'POST');
            bodies.push(JSON.parse(String(init?.body)));
            headers.push(new Headers(init?.headers));
            return options.transport ? options.transport(url, init) : ok(init);
        },
    });
    return { controller, bodies, headers, transactions };
}

test('past, present and future card due dates ALWAYS create obligations without cash debit', async () => {
    for (const today of ['2026-02-04', '2026-02-05', '2026-11-12']) {
        const h = harness(input({ today, count: 1 }));
        assert.equal((await h.controller.submit()).status, 'success');
        assert.equal(h.transactions.length, 0);
        assert.equal(h.bodies[0].type, 'payables_insert');
        assert.equal(h.bodies[0].data.dueDate, '2026-02-05');
        assert.equal(h.bodies[0].data.issueDate, '2026-01-10');
        assert.equal(h.bodies[0].data.isBusinessExpense, true);
        assert.equal(h.bodies[0].data.isBusinessRevenue, false);
    }
});

test('all obligation calls preserve organizational scope, authentication, classification and exact cents', async () => {
    const h = harness();
    await h.controller.submit();
    assert.equal(h.bodies.reduce((sum, body) => sum + Math.round(body.data.amount * 100), 0), 10000);
    assert.equal(new Set(h.bodies.map(body => body.data.operationId)).size, 3);
    for (let i = 0; i < 3; i++) {
        assert.equal(h.headers[i].get('x-view-mode'), 'organization');
        assert.equal(h.headers[i].get('authorization'), 'Bearer test-session');
        assert.equal(h.headers[i].get('content-type'), 'application/json');
        assert.equal(h.bodies[i].data.costCenterId, 'org-center');
        assert.equal(h.bodies[i].data.isBusinessExpense, true);
        assert.match(h.bodies[i].data.operationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    }
});

test('HTTP rejection is not success, does not debit cash, and leaves all items unconfirmed', async () => {
    for (const status of [400, 401, 403, 409, 422, 500]) {
        const h = harness(input(), { transport: async () => new Response('rejected', { status }) });
        const result = await h.controller.submit();
        assert.equal(result.status, 'error');
        assert.equal(result.confirmed, 0);
        assert.equal(h.bodies.length, 1);
        assert.equal(h.transactions.length, 0);
        if (status === 409) assert.match(result.message!, /409/);
    }
});

test('future payable and receivable recurrence preserve issueDate and both business flags', async () => {
    for (const type of [TransactionType.INCOME, TransactionType.EXPENSE]) {
        const original = input({ purchaseDate: '2026-12-31', viewMode: 'personal', count: 2 });
        original.transaction = { ...original.transaction, transactionType: type, paymentMethod: 'PIX', date: '2026-12-31', isBusinessRevenue: type === TransactionType.INCOME, isBusinessExpense: type === TransactionType.EXPENSE };
        const h = harness(original);
        await h.controller.submit();
        assert.equal(h.bodies[0].type, type === TransactionType.INCOME ? 'receivables_insert' : 'payables_insert');
        assert.deepEqual(h.bodies.map(body => body.data.issueDate), ['2026-12-31', '2027-01-31']);
        assert.equal(h.bodies[0].data.isBusinessRevenue, type === TransactionType.INCOME);
        assert.equal(h.bodies[0].data.isBusinessExpense, type === TransactionType.EXPENSE);
        assert.equal(h.headers[0].get('x-view-mode'), 'personal');
    }
});

test('duplicate confirmation runs the same card plan, never bypasses it into addTransaction', async () => {
    const draft = input();
    assert.equal(hasPotentialTransactionDuplicate(draft.transaction, [{ ...draft.transaction, id: 'existing' }]), true);
    const h = harness(draft, { duplicate: true });
    assert.equal((await h.controller.submit()).status, 'duplicate_confirmation');
    assert.equal(h.bodies.length, 0);
    assert.equal((await h.controller.submit(true)).status, 'success');
    assert.equal(h.bodies.length, 3);
    assert.equal(h.transactions.length, 0);
});

test('duplicate approval also preserves future receivable recurrence instead of creating a transaction', async () => {
    const draft = input({ purchaseDate: '2026-12-01', count: 2 });
    draft.transaction = { ...draft.transaction, transactionType: TransactionType.INCOME, paymentMethod: 'PIX', isBusinessRevenue: true };
    const h = harness(draft, { duplicate: true });
    await h.controller.submit();
    await h.controller.submit(true);
    assert.equal(h.transactions.length, 0);
    assert.deepEqual(h.bodies.map(body => body.type), ['receivables_insert', 'receivables_insert']);
});

test('partial failure retries only unconfirmed installments using unchanged operationId and payload', async () => {
    let calls = 0;
    const draft = input();
    const h = harness(draft, { transport: async (_url, init) => ++calls === 2 ? new Response('quota', { status: 403 }) : ok(init) });
    const failed = await h.controller.submit();
    assert.equal(failed.status, 'error');
    assert.equal(failed.confirmed, 1);
    draft.transaction.amount = 999;
    draft.transaction.isBusinessExpense = false;
    draft.count = 20;
    const success = await h.controller.submit();
    assert.equal(success.status, 'success');
    assert.equal(success.confirmed, 3);
    assert.equal(h.bodies.length, 4);
    assert.deepEqual(h.bodies[1], h.bodies[2]);
    assert.equal(h.bodies[3].data.amount, 33.33);
    assert.equal(h.bodies[3].data.isBusinessExpense, true);
    await h.controller.submit();
    assert.equal(h.bodies.length, 4);
});

test('lost response after server commit replays the same UUID, relying on server journal, not local memory', async () => {
    const journal = new Map<string, string>();
    let commits = 0;
    let loseResponse = true;
    const h = harness(input({ count: 1 }), { transport: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        const previous = journal.get(body.data.operationId);
        if (previous) assert.equal(previous, String(init?.body));
        else { journal.set(body.data.operationId, String(init?.body)); commits++; }
        if (loseResponse) { loseResponse = false; throw new TypeError('network disconnected after commit'); }
        return ok(init);
    } });
    const failed = await h.controller.submit();
    assert.equal(failed.status, 'error');
    assert.equal(failed.confirmed, 0);
    assert.equal(failed.retryBlocked, false);
    assert.equal((await h.controller.submit()).status, 'success');
    assert.deepEqual(h.bodies[0], h.bodies[1]);
    assert.equal(commits, 1);
});

test('5xx retries keep the same operationId and serialized payload', async () => {
    let calls = 0;
    const h = harness(input({ count: 1 }), { transport: async (_url, init) => ++calls === 1 ? new Response('error', { status: 503 }) : ok(init) });
    assert.equal((await h.controller.submit()).status, 'error');
    assert.equal((await h.controller.submit()).status, 'success');
    assert.deepEqual(h.bodies[0], h.bodies[1]);
});

test('scope changes stop subsequent writes and never report success in another scope', async () => {
    let current = true;
    const h = harness(input(), { isCurrent: () => current, transport: async (_url, init) => { current = false; return ok(init); } });
    const result = await h.controller.submit();
    assert.equal(result.status, 'stale');
    assert.equal(result.confirmed, 1);
    assert.equal(h.bodies.length, 1);
    assert.equal((await h.controller.submit()).status, 'stale');
    assert.equal(h.bodies.length, 1);
});

test('duplicate confirmation after scope switch cannot write', async () => {
    let current = true;
    const h = harness(input(), { duplicate: true, isCurrent: () => current });
    await h.controller.submit();
    current = false;
    assert.equal((await h.controller.submit(true)).status, 'stale');
    assert.equal(h.bodies.length, 0);
});

test('concurrent submits share the same in-flight promise and do not repeat writes', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const h = harness(input({ count: 1 }), { transport: async (_url, init) => { await gate; return ok(init); } });
    const first = h.controller.submit();
    const second = h.controller.submit();
    assert.equal(first, second);
    release();
    await first;
    assert.equal(h.bodies.length, 1);
});

test('mixed recurrence retry never repeats a confirmed current bank movement', async () => {
    const draft = input({ today: '2026-01-10', count: 2 });
    draft.transaction.paymentMethod = 'PIX';
    let calls = 0;
    const h = harness(draft, { transport: async (_url, init) => ++calls === 1 ? new Response('rejected', { status: 422 }) : ok(init) });
    assert.equal((await h.controller.submit()).confirmed, 1);
    assert.equal((await h.controller.submit()).status, 'success');
    assert.equal(h.transactions.length, 1);
    assert.deepEqual(h.bodies[0], h.bodies[1]);
});

test('uncertain addTransaction errors block retry because that route has no obligation journal', async () => {
    const draft = input({ count: 1 });
    draft.transaction.paymentMethod = 'PIX';
    let calls = 0;
    const h = harness(draft, { addTransaction: async () => { calls++; throw new Error('lost response'); } });
    const result = await h.controller.submit();
    assert.equal(result.status, 'error');
    assert.equal(result.retryBlocked, true);
    await h.controller.submit();
    assert.equal(calls, 1);
});

test('weekly recurrence is date-only and monthly recurrence clamps month end', () => {
    const draft = input({ purchaseDate: '2026-01-31', today: '2026-01-01', count: 3 });
    draft.transaction.paymentMethod = 'PIX';
    const dates = (value: TransactionSubmissionInput) => buildTransactionSubmission(value).map(step => step.type !== 'transaction' && step.data.dueDate);
    assert.deepEqual(dates(draft), ['2026-01-31', '2026-02-28', '2026-03-31']);
    assert.deepEqual(dates({ ...draft, frequency: 'weekly' }), ['2026-01-31', '2026-02-07', '2026-02-14']);
});

test('invalid 2xx response is not confirmation and retry retains the operation UUID', async () => {
    for (const body of ['{}', 'not-json', JSON.stringify({ operationId: 'wrong-id', replayed: true, rows: [{ id: 'other' }] })]) {
        let calls = 0;
        const h = harness(input({ count: 1 }), { transport: async (_url, init) => ++calls === 1 ? new Response(body) : ok(init) });
        const failed = await h.controller.submit();
        assert.equal(failed.status, 'error');
        assert.equal(failed.confirmed, 0);
        assert.equal((await h.controller.submit()).status, 'success');
        assert.deepEqual(h.bodies[0], h.bodies[1]);
    }
});

test('missing authentication is rejected before transport', async () => {
    let sent = false;
    const controller = createTransactionSubmission(input(), {
        duplicate: false, isCurrent: () => true, getToken: () => '', addTransaction: async () => {},
        transport: async (_url, init) => { sent = true; return ok(init); },
    });
    assert.equal((await controller.submit()).status, 'error');
    assert.equal(sent, false);
});
