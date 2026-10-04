import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProactiveHandler } from './proactive';

test('member financial reads filter every transaction aggregate and payable, and viewer cannot execute a bill', async () => {
  const reads: string[] = [];
  const db = { query: async (sql: string) => {
    if (/profiles/i.test(sql)) return { rows: [{ org_id: 'org-owned' }] };
    if (/org_members/i.test(sql)) return { rows: [{ role: 'member' }] };
    if (/cost_center_permissions/i.test(sql) && !/payables|transactions/i.test(sql)) return { rows: [{ cost_center_id: 'cc-visible', role: 'viewer' }] };
    reads.push(sql);
    return { rows: /FROM public.payables/i.test(sql) && /SELECT id/i.test(sql) ? [{ id: 'bill-1', title: 'Bill', amount: 10, cost_center_id: 'cc-visible', due_date: new Date().toISOString() }] : [] };
  }};
  const handler = createProactiveHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => '' });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { viewMode: 'organization' } } as any, res as any);
  assert.equal(res.statusCode, 200);
  assert.ok(reads.filter(sql => /transactions|payables|recurrences|receivables/i.test(sql)).every(sql => /cost_center_id/.test(sql)));
  assert.ok(res.body.insights.some((i: any) => i.message.includes('Bill')));
  assert.equal(res.body.insights.some((i: any) => i.action), false);
});

test('authorized urgent bill emits executable action.type contract with billId, not actionType', async () => {
  const db = { query: async (sql: string) => ({ rows: /SELECT id, title/.test(sql) ? [{ id: 'bill-1', title: 'Bill', amount: 10, due_date: new Date().toISOString() }] : [] }) };
  const handler = createProactiveHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => '' });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: {} } as any, res as any);
  const action = res.body.insights.find((i: any) => i.action)?.action;
  assert.equal(action.type, 'pay_bill');
  assert.equal(action.params.billId, 'bill-1');
  assert.equal(action.actionType, undefined);
});

function response() { return { statusCode: 0, body: null as any, setHeader() {}, end(text: string) { this.body = JSON.parse(text); } }; }
test('proactive handler denies forged organization without fetching balances or contacting Azure', async () => {
  let financialReads = 0;
  let modelCalls = 0;
  const db = { query: async (sql: string) => {
    if (/profiles/i.test(sql)) return { rows: [{ org_id: 'org-owned' }] };
    if (/org_members/i.test(sql)) return { rows: [] };
    financialReads++;
    return { rows: [] };
  }};
  const handler = createProactiveHandler({ db, verifySession: async () => ({ userId: 'user-1' }), askAzureOpenAI: async () => { modelCalls++; return ''; } });
  const res = response();
  await handler({ method: 'POST', headers: {}, body: { viewMode: 'organization', orgId: 'org-victim' } } as any, res as any);
  assert.equal(res.statusCode, 403);
  assert.equal(financialReads, 0);
  assert.equal(modelCalls, 0);
});
