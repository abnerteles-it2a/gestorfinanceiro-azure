import test from 'node:test';
import assert from 'node:assert/strict';
import { AxiosError, type AxiosAdapter } from 'axios';
import { api, createScopedApi, financialScope, setAuthToken, setFinancialViewMode, sendMobileInvestmentDisposal } from '../services/api';
import { createInvestmentOperationController } from '../../utils/investmentOperationClient';
import type { InvestmentDisposalRequest } from '../../types';

// In-memory Axios adapters only. No network or native runtime.
test('actual mobile interceptor scopes GET/POST and bound workflows cannot follow a view change', async () => {
  setAuthToken('synthetic-user-a'); setFinancialViewMode('organization');
  const calls: any[] = [];
  api.defaults.adapter = (async config => {
    calls.push(config);
    return { status: 200, statusText: 'OK', data: {}, headers: {}, config };
  }) as AxiosAdapter;
  const client = createScopedApi();
  await client.get('/bootstrap'); await client.post('/query', { type: 'payables_list' });
  assert.equal(calls.length, 2);
  for (const config of calls) {
    assert.equal(config.headers.get('x-view-mode'), 'organization');
    assert.equal(config.headers.get('Authorization'), 'Bearer synthetic-user-a');
  }
  setFinancialViewMode('personal');
  assert.throws(() => client.post('/query', { type: 'transactions_insert' }), /alterados/);
  assert.equal(calls.length, 2);
});

test('late response from previous view is discarded, including return to the same view', async () => {
  setAuthToken('synthetic-user-a');
  let finish!: () => void;
  api.defaults.adapter = (config => new Promise(resolve => { finish = () => resolve({ status: 200, statusText: 'OK', data: { old: true }, headers: {}, config }); })) as AxiosAdapter;
  const pending = api.get('/bootstrap');
  setFinancialViewMode('organization'); setFinancialViewMode('personal');
  finish(); await assert.rejects(pending, /anterior/);
});

test('late 401 does not invalidate a newer user or expose the previous auth error', async () => {
  setAuthToken('synthetic-user-a'); let fail!: () => void;
  api.defaults.adapter = (config => new Promise((_resolve, reject) => {
    fail = () => reject(new AxiosError('expired', '401', config, undefined, { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config }));
  })) as AxiosAdapter;
  const pending = api.get('/bootstrap'); setAuthToken('synthetic-user-b');
  fail(); await assert.rejects(pending, /anterior/);
  assert.equal(financialScope.snapshot().token, 'synthetic-user-b');
  assert.equal(financialScope.snapshot().viewMode, 'personal');
});

test('mobile Axios disposal adapter preserves atomic contract, definite rejection and retry payload', async () => {
  setAuthToken('synthetic-user-a'); setFinancialViewMode('organization');
  const scope = financialScope.snapshot();
  const request: InvestmentDisposalRequest = { operationId: '11111111-1111-4111-8111-111111111111', kind: 'variable', ticker: 'PETR4', assetType: 'Ações', quantity: 1, date: '2026-11-12', cash: null };
  const payloads: string[] = []; let mode: 'uncertain' | 'success' | 'reject' = 'uncertain', reconciliations = 0;
  api.defaults.adapter = (async config => {
    payloads.push(config.data); assert.equal(config.headers.get('x-view-mode'), 'organization');
    if (mode === 'uncertain') throw new Error('socket closed after commit');
    return { status: mode === 'reject' ? 409 : 200, statusText: 'result', headers: {}, config,
      data: mode === 'reject' ? '{"error":"investment_insufficient_quantity"}' : JSON.stringify({ operationId: request.operationId, kind: 'variable', replayed: true, updated: [], removedIds: [] }) };
  }) as AxiosAdapter;
  const makeController = () => createInvestmentOperationController({ execute: value => sendMobileInvestmentDisposal(value, scope), reconcile: async () => { reconciliations++; }, isCurrent: () => financialScope.isCurrent(scope), isRemote: () => true });
  const controller = makeController();
  assert.equal((await controller.submit(request)).status, 'error'); assert.equal(reconciliations, 0);
  mode = 'success'; assert.equal((await controller.submit({ ...request, quantity: 99 })).status, 'success');
  assert.equal(payloads[0], payloads[1]); assert.equal(JSON.parse(payloads[0]).type, 'investment_dispose');
  mode = 'reject'; const result = await makeController().submit(request);
  assert.equal(result.status, 'error'); if (result.status === 'error') assert.equal(result.rejected, true);
  assert.equal(reconciliations, 1);
});
