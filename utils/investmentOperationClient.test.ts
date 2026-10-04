import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvestmentOperationController, sendInvestmentDisposal, buildInvestmentDisposalRequest } from './investmentOperationClient';
import type { InvestmentDisposalRequest } from '../types';

test('crypto disposal derives eight-decimal quantity from explicit positive unit price', () => {
    const input = { operationId: 'id', assetType: 'Criptomoeda', ticker: 'BTC', date: '2026-10-03', quantity: 0, unitPrice: 300000, amount: 1000, cash: null };
    const value = buildInvestmentDisposalRequest(input);
    assert.equal(value.kind === 'variable' && value.quantity, 0.00333333);
    assert.throws(() => buildInvestmentDisposalRequest({ ...input, unitPrice: 0 }), /Preço/);
});

test('fixed redemption requires selected ID and keeps principal separate from cash', () => {
    const input = { operationId: 'id', assetType: 'Renda Fixa', assetId: 'selected-lot', date: '2026-10-03', quantity: 0, unitPrice: 0, amount: 800, cash: { amount: 850, accountId: 'account', category: 'Investimentos', description: 'Resgate CDB', paymentMethod: 'PIX' } };
    assert.deepEqual(buildInvestmentDisposalRequest(input), { operationId: 'id', kind: 'fixed', assetId: 'selected-lot', date: '2026-10-03', principalAmount: 800, cash: input.cash });
    assert.throws(() => buildInvestmentDisposalRequest({ ...input, assetId: undefined }), /Selecione/);
});

test('stock disposal preserves explicit quantity and rejects invalid principal or quantities', () => {
    const input = { operationId: 'id', assetType: 'Ação', ticker: 'PETR4', date: '2026-10-03', quantity: 150, unitPrice: 30, amount: 0, cash: null };
    assert.equal((buildInvestmentDisposalRequest(input) as any).quantity, 150);
    assert.throws(() => buildInvestmentDisposalRequest({ ...input, quantity: -1 }), /Quantidade/);
    assert.throws(() => buildInvestmentDisposalRequest({ ...input, assetType: 'Renda Fixa', assetId: 'selected', amount: 0 }), /Principal/);
});

test('definite server rejection unlocks editing while ambiguous failures preserve the original command', async () => {
    const sent: InvestmentDisposalRequest[] = [];
    const controller = createInvestmentOperationController({
        execute: async value => { sent.push(value); if (sent.length === 1) return sendInvestmentDisposal(value, { authorization: 'Bearer token' }, async () => new Response('{"error":"invalid_investment_quantity"}', { status: 400 })); return response; },
        reconcile: async () => {}, isCurrent: () => true, isRemote: () => true,
    });
    const failed = await controller.submit(request());
    assert.equal(failed.status === 'error' && failed.rejected, true);
    await controller.submit({ ...request(), quantity: 10 } as InvestmentDisposalRequest);
    assert.equal((sent[1] as any).quantity, 10);
});

test('scope changes during reconciliation never report completion to the old dialog', async () => {
    let current = true;
    const controller = createInvestmentOperationController({
        execute: async () => response, reconcile: async () => { current = false; }, isCurrent: () => current, isRemote: () => true,
    });
    assert.equal((await controller.submit(request())).status, 'stale');
});

const request = (): InvestmentDisposalRequest => ({ operationId: '1224c1ba-5365-4393-a911-240971110bee', kind: 'variable', date: '2026-10-03', ticker: 'PETR4', assetType: 'Ação', quantity: 150, cash: { amount: 4500, accountId: 'account', category: 'Investimentos', description: 'Venda PETR4', paymentMethod: 'PIX' } });
const response = { operationId: request().operationId, replayed: false, kind: 'variable' as const, updated: [], removedIds: [] };

test('a rejected sale stays unconfirmed and never reconciles positions or cash', async () => {
    let refreshes = 0;
    const controller = createInvestmentOperationController({
        execute: async () => { throw new Error('quota rejected'); },
        reconcile: async () => { refreshes++; },
        isCurrent: () => true,
        isRemote: () => true,
    });
    assert.deepEqual(await controller.submit(request()), { status: 'error', committed: false, message: 'quota rejected' });
    assert.equal(refreshes, 0);
});

test('unknown outcome retries retain immutable quantity and operation ID', async () => {
    const sent: InvestmentDisposalRequest[] = [];
    const controller = createInvestmentOperationController({
        execute: async value => { sent.push(value); if (sent.length === 1) throw new Error('Connection lost'); return { ...response, replayed: true }; },
        reconcile: async () => {}, isCurrent: () => true, isRemote: () => true,
    });
    const original = request();
    await controller.submit(original);
    original.quantity = 5;
    original.cash!.amount = 1;
    const result = await controller.submit(original);
    assert.deepEqual(sent.map(value => [value.operationId, value.kind === 'variable' ? value.quantity : 0, value.cash?.amount]), [
        [response.operationId, 150, 4500], [response.operationId, 150, 4500],
    ]);
    assert.equal(result.status, 'success');
    assert.equal(result.status === 'success' && result.replayed, true);
});

test('committed sale with failed refresh retries reconciliation, never resubmits disposal', async () => {
    let executions = 0;
    let refreshes = 0;
    const controller = createInvestmentOperationController({
        execute: async () => { executions++; return response; },
        reconcile: async () => { if (++refreshes === 1) throw new Error('Snapshot unavailable'); },
        isCurrent: () => true, isRemote: () => true,
    });
    assert.deepEqual(await controller.submit(request()), { status: 'reconciliation_pending', committed: true, operationId: response.operationId, message: 'Snapshot unavailable' });
    assert.equal((await controller.submit(request())).status, 'success');
    assert.equal(executions, 1);
});

test('transport sends one atomic command and rejects a non-committed HTTP response', async () => {
    let body: any;
    await assert.rejects(sendInvestmentDisposal(request(), { authorization: 'Bearer token' }, async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({ error: 'insufficient_position' }), { status: 409 });
    }), /insufficient_position/);
    assert.deepEqual(body, { type: 'investment_dispose', data: request() });
});

test('a response belonging to a prior user or view never reconciles into the current scope', async () => {
    let current = true;
    let refreshed = false;
    const controller = createInvestmentOperationController({
        execute: async () => { current = false; return response; },
        reconcile: async () => { refreshed = true; },
        isCurrent: () => current, isRemote: () => true,
    });
    const result = await controller.submit(request());
    assert.equal(result.status, 'stale');
    assert.equal(refreshed, false);
});

test('local or unauthenticated sales are rejected without invoking the remote command', async () => {
    let executed = false;
    const controller = createInvestmentOperationController({
        execute: async () => { executed = true; return response; },
        reconcile: async () => {}, isCurrent: () => true, isRemote: () => false,
    });
    assert.equal((await controller.submit(request())).status, 'error');
    assert.equal(executed, false);
});

test('simultaneous submits share one pending operation and one reconciliation', async () => {
    let executions = 0;
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const controller = createInvestmentOperationController({
        execute: async () => { executions++; await waiting; return response; },
        reconcile: async () => {}, isCurrent: () => true, isRemote: () => true,
    });
    const first = controller.submit(request());
    const second = controller.submit(request());
    release();
    await Promise.all([first, second]);
    assert.equal(executions, 1);
});
