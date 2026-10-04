import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgentHandler } from './agent';
test('agent personal reads exclude organization rows including account movements and never use a real adapter', async () => {
  const reads: string[] = [];
  let prompt = '';
  const db = { query: async (sql: string) => { reads.push(sql); return { rows: [] }; } };
  const handler = createAgentHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async (input) => { prompt = input.messages.map(m => m.content).join('\n'); return 'Resposta de teste'; } });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { query: 'saldo?' } } as any, res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(reads.length, 8);
  assert.ok(reads.every(sql => /org_id IS NULL/.test(sql)));
  assert.ok(prompt.includes('DADOS REAIS'));
});

test('organization admins include authorized organization holdings and exclude personal holdings', async () => {
  let prompt = '';
  const db = { query: async (sql: string, params?: any[]) => {
    if (/profiles/.test(sql)) return { rows: [{ org_id: 'org-owned' }] };
    if (/org_members/.test(sql)) return { rows: [{ role: 'admin' }] };
    if (/FROM public.investments/.test(sql)) return { rows: /WHERE org_id=\$1/.test(sql) && params?.[0] === 'org-owned' ? [{ ticker: 'ORG-HOLDING', quantity: 1, purchase_price: 100 }] : [{ ticker: 'PRIVATE', quantity: 1, purchase_price: 100 }] };
    if (/FROM public.fixed_income_investments/.test(sql)) return { rows: /WHERE org_id=\$1/.test(sql) && params?.[0] === 'org-owned' ? [{ name: 'ORG-BOND', amount_invested: 200 }] : [{ name: 'PRIVATE-BOND', amount_invested: 200 }] };
    return { rows: [] };
  } };
  const handler = createAgentHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async input => { prompt = input.messages.map(m => m.content).join('\n'); return 'answer'; } });
  const res = response();
  await handler({ method: 'POST', headers: { 'x-view-mode': 'organization' }, body: { query: 'saldo?' } } as any, res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(prompt.includes('PRIVATE'), false);
  assert.equal(prompt.includes('ORG-HOLDING'), true);
  assert.match(prompt, /Investimentos: Total R\$\s*300,00 \(Renda Fixa: R\$\s*200,00 \| Renda Variável: R\$\s*100,00\)/);
});

test('failed financial reads report unavailable instead of a fabricated zero-balance summary', async () => {
  let modelCalls = 0;
  const db = { query: async () => { throw new Error('offline'); } };
  const handler = createAgentHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => { modelCalls++; throw new Error('offline'); } });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { query: 'saldo?' } } as any, res as any);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'financial_data_unavailable');
  assert.equal(modelCalls, 0);
});

test('member context labels restricted investments rather than claiming complete zero holdings', async () => {
  let prompt = '';
  let investmentReads = 0;
  const db = { query: async (sql: string) => {
    if (/profiles/.test(sql)) return { rows: [{ org_id: 'org-owned' }] };
    if (/org_members/.test(sql)) return { rows: [{ role: 'member' }] };
    if (/FROM public.(investments|fixed_income_investments)/.test(sql)) investmentReads++;
    return { rows: [] };
  } };
  const handler = createAgentHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async input => { prompt = input.messages.map(m => m.content).join('\n'); return 'answer'; } });
  const res = response();
  await handler({ method: 'POST', headers: { 'x-view-mode': 'organization' }, body: { query: 'patrimônio?' } } as any, res as any);
  assert.equal(res.statusCode, 200);
  assert.equal(investmentReads, 0);
  assert.match(prompt, /Investimentos: acesso restrito/);
  assert.match(prompt, /Patrimônio parcial/);
});

const response = () => ({ statusCode: 0, body: null as any, setHeader() {}, end(text: string) { this.body = JSON.parse(text); } });
test('agent refuses missing membership rather than reading personal balances as organizational', async () => {
  let reads = 0;
  let modelCalls = 0;
  const db = { query: async (sql: string) => {
    if (/profiles/i.test(sql)) return { rows: [{ org_id: 'org-owned' }] };
    if (/org_members/i.test(sql)) return { rows: [] };
    reads++; return { rows: [] };
  }};
  const handler = createAgentHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => { modelCalls++; return 'answer'; } });
  const res = response();
  await handler({ method: 'POST', headers: { 'x-view-mode': 'organization' }, body: { query: 'saldo?' } } as any, res as any);
  assert.equal(res.statusCode, 403);
  assert.equal(reads, 0);
  assert.equal(modelCalls, 0);
});
