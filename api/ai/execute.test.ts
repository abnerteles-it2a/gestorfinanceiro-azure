import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createExecuteHandler } from './execute';

function response() {
  return {
    statusCode: 0,
    body: null as any,
    setHeader() {},
    end(text?: string) {
      if (text) this.body = JSON.parse(text);
    },
  };
}

test('execute rejects invalid actionType or missing billId/accountId', async () => {
  const handler = createExecuteHandler({
    db: { query: async () => ({ rows: [] }) },
    verifySession: async () => ({ userId: 'user-1' } as any),
  });
  const res = response();
  await handler({ method: 'POST', body: { actionType: 'invalid' } } as any, res as any);
  assert.equal(res.statusCode, 400);
});

test('paying a partially settled bill settles remaining amount and logs to obligation_settlements', async () => {
  const executedSqls: string[] = [];
  const insertedParams: any[] = [];
  const db = {
    connect: async () => ({
      query: async (sql: string, params: any[] = []) => {
        executedSqls.push(sql);
        if (/select org_id from public\.profiles/i.test(sql)) return { rows: [{ org_id: null }] };
        if (/select \* from public\.payables/i.test(sql)) {
          return {
            rows: [{
              id: 'bill-1',
              user_id: 'user-1',
              title: 'Energia',
              amount: 250,
              paid_amount: 100,
              status: 'partial',
              category: 'Utilidades',
              cost_center_id: null,
            }],
          };
        }
        if (/select id from public\.accounts/i.test(sql)) return { rows: [{ id: 'acc-1' }] };
        if (/update public\.payables/i.test(sql)) return { rows: [{ id: 'bill-1' }] };
        if (/insert into public\.transactions/i.test(sql)) {
          insertedParams.push(params);
          return { rows: [] };
        }
        if (/insert into public\.obligation_settlements/i.test(sql)) {
          insertedParams.push(params);
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {},
    }),
  };

  const handler = createExecuteHandler({
    db,
    verifySession: async () => ({ userId: 'user-1' } as any),
  });
  const res = response();
  await handler({
    method: 'POST',
    headers: {},
    body: {
      actionType: 'pay_bill',
      params: { billId: 'bill-1', accountId: 'acc-1' },
    },
  } as any, res as any);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.ok(res.body.transactionId);
  assert.ok(res.body.operationId);

  // Remaining amount: 250 - 100 = 150
  const txParams = insertedParams[0];
  assert.equal(txParams[5], 'Pagamento: Energia');
  assert.equal(txParams[6], 150);

  // Settlement params
  const settlementParams = insertedParams[1];
  assert.equal(settlementParams[1], 'bill-1');
  assert.equal(settlementParams[2], 'payable');
  assert.equal(settlementParams[3], 150);
  assert.equal(settlementParams[4], 150);
  assert.equal(settlementParams[5], 'acc-1');
});
