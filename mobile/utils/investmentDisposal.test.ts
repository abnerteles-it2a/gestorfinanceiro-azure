import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMobileDisposal, parseInvestmentDecimal } from './investmentDisposal';
import { createInvestmentOperationController, sendInvestmentDisposal } from '../../utils/investmentOperationClient';

const input = { operationId: '11111111-1111-4111-8111-111111111111', ticker: ' petr4 ', assetType: 'Ações', date: '2026-11-12', quantity: 0.3, unitPrice: 10.01,
  lots: [{ id: 'b', ticker: 'PETR4', type: 'Ações', quantity: 0.2, purchaseDate: '2026-02-01' }, { id: 'a', ticker: 'PETR4', type: 'Ações', quantity: 0.1, purchaseDate: '2026-01-01' }],
  cash: { amount: 0, accountId: '22222222-2222-4222-8222-222222222222', category: 'Investimentos', description: 'Venda', paymentMethod: 'PIX' } };

test('mobile disposal sends a variable FIFO command and cent-rounded cash, not an insert', () => {
  const request = buildMobileDisposal(input);
  assert.equal(request.kind, 'variable'); assert.equal(request.cash?.amount, 3);
  if (request.kind === 'variable') { assert.equal(request.quantity, 0.3); assert.equal(request.ticker, 'PETR4'); }
  assert.equal(input.lots[0].quantity, 0.2);
});
test('reject oversell, invalid dates/precision/price and ambiguous editing', () => {
  assert.throws(() => buildMobileDisposal({ ...input, quantity: 0.30000001 }), /insufficient_quantity/);
  assert.throws(() => buildMobileDisposal({ ...input, quantity: 0 }), /invalid_sale_quantity/);
  assert.throws(() => buildMobileDisposal({ ...input, quantity: 0.123456789 }), /Quantidade/);
  assert.throws(() => buildMobileDisposal({ ...input, unitPrice: 0 }));
  assert.throws(() => buildMobileDisposal({ ...input, unitPrice: NaN }));
  assert.throws(() => buildMobileDisposal({ ...input, date: '2026-02-30' }));
  assert.throws(() => buildMobileDisposal({ ...input, date: '2025-01-01' }), /anterior/);
  assert.throws(() => buildMobileDisposal({ ...input, editingId: 'a' }), /edição/);
  assert.throws(() => buildMobileDisposal({ ...input, assetType: 'FIIs' }), /insufficient_quantity/);
});
test('quantity parser retains 8 decimals without accepting partial input or money grouping', () => {
  assert.equal(parseInvestmentDecimal('0,12345678'), 0.12345678);
  assert.equal(parseInvestmentDecimal('0.12345678'), 0.12345678);
  for (const value of ['1abc', '1.000,50', '-1', '0', 'Infinity', '1,123456789']) assert.throws(() => parseInvestmentDecimal(value));
});
test('uncertain result preserves identical request/id, reconciles only after confirmation and deduplicates clicks', async () => {
  const request = buildMobileDisposal(input); const sent: string[] = []; let reconciliations = 0;
  const execute = async (value: typeof request) => {
    sent.push(JSON.stringify(value));
    if (sent.length === 1) throw new Error('timeout after commit');
    return { operationId: value.operationId, kind: value.kind, replayed: true, updated: [], removedIds: [] };
  };
  const controller = createInvestmentOperationController({ execute, reconcile: async () => { reconciliations++; }, isCurrent: () => true, isRemote: () => true });
  const first = controller.submit(request); assert.equal(controller.submit(request), first);
  assert.equal((await first).status, 'error'); assert.equal(reconciliations, 0);
  const restored = JSON.parse(JSON.stringify(request));
  const result = await controller.submit({ ...restored, operationId: 'different', cash: { ...restored.cash, amount: 1000 } });
  assert.equal(result.status, 'success'); assert.equal(reconciliations, 1); assert.equal(sent[0], sent[1]);
});
test('confirmed sale retries reconciliation without resending; changed scope never reconciles', async () => {
  const request = buildMobileDisposal(input); let executions = 0, refreshes = 0, current = true;
  const controller = createInvestmentOperationController({ execute: async value => { executions++; return { operationId: value.operationId, kind: value.kind, replayed: false, updated: [], removedIds: [] }; },
    reconcile: async () => { refreshes++; if (refreshes === 1) throw new Error('snapshot unavailable'); }, isCurrent: () => current, isRemote: () => true });
  assert.equal((await controller.submit(request)).status, 'reconciliation_pending');
  current = false; assert.equal((await controller.submit(request)).status, 'stale'); assert.equal(refreshes, 1);
  current = true; assert.equal((await controller.submit(request)).status, 'success'); assert.equal(executions, 1);
});
test('wire contract uses investment_dispose, keeps scope and rejects malformed success as uncertain', async () => {
  const request = buildMobileDisposal(input); let body: any;
  const transport = (async (_url: any, init: any) => { body = JSON.parse(init.body); assert.equal(init.headers['x-view-mode'], 'organization'); return new Response('{}', { status: 200 }); }) as typeof fetch;
  await assert.rejects(() => sendInvestmentDisposal(request, { authorization: 'Bearer test', 'x-view-mode': 'organization' }, transport), /Resposta/);
  assert.deepEqual(body, { type: 'investment_dispose', data: JSON.parse(JSON.stringify(request)) });
});
