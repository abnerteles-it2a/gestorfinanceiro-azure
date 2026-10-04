import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAdviceHandler } from './advice';
test('invalid kind or non-text question is rejected before Azure', async () => {
  let calls = 0;
  const handler = createAdviceHandler({ db: {} as any, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => { calls++; return 'answer'; } });
  const res = response();
  await handler({ method: 'POST', body: { kind: 'arbitrary', question: { malicious: true } } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(calls, 0);
});

test('malformed extraction result cannot become a successful zero-amount transaction', async () => {
  const handler = createAdviceHandler({ db: {} as any, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => '{}' });
  const res = response();
  await handler({ method: 'POST', body: { kind: 'transaction', question: 'gastei' } }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: 'invalid_ai_response', kind: 'transaction' });
});

test('invalid investment extraction cannot become a successful zero-valued purchase', async () => {
  const handler = createAdviceHandler({ db: {} as any, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => '{}' });
  const res = response();
  await handler({ method: 'POST', body: { kind: 'investment_transaction', question: 'comprei ações' } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.error, 'invalid_ai_response');
});

const response = () => ({ statusCode: 0, body: null as any, setHeader() {}, end(text: string) { this.body = JSON.parse(text); } });
test('payable extraction outage returns unavailable, not a successful zero-valued financial diagnosis', async () => {
  const handler = createAdviceHandler({ db: {} as any, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => { throw new Error('offline'); } });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { kind: 'payable', question: 'aluguel 2000 amanhã' } }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.body, { error: 'ai_unavailable', kind: 'payable' });
});
