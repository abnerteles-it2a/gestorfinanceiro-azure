import crypto from 'node:crypto';
import { assertDateOnly } from '../utils/creditCard';
import type { FinancialDatabase, FinancialScope } from './_financial';

type DatabasePool = { connect(): Promise<FinancialDatabase & { release(): void }> };

export async function createObligation(pool: DatabasePool, scope: FinancialScope, kind: 'payable' | 'receivable', data: any,
  beforeInsert?: (id: string, date: string, db: FinancialDatabase) => Promise<void>) {
  const operationId = data.operationId ?? crypto.randomUUID();
  if (typeof operationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new Error('invalid_obligation_operation');
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw new Error('invalid_obligation_amount');
  if (typeof data.title !== 'string' || !data.title.trim()) throw new Error('invalid_obligation_title');
  try {
    assertDateOnly(data.dueDate);
    if (data.issueDate) assertDateOnly(data.issueDate);
  } catch { throw new Error('invalid_obligation_date'); }
  const request = {
    kind, title: data.title.trim(), amount, issueDate: data.issueDate || null, dueDate: data.dueDate,
    category: data.category || null, costCenterId: data.costCenterId || null,
    party: (kind === 'payable' ? data.supplier : data.customer) || null, notes: data.notes || null,
    isBusinessRevenue: kind === 'receivable' && data.isBusinessRevenue === true,
    isBusinessExpense: kind === 'payable' && data.isBusinessExpense === true,
  };
  const scopeType = scope.orgId ? 'org' : 'personal';
  const scopeId = scope.orgId || scope.userId;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`obligation:${scopeType}:${scopeId}:${operationId}`]);
    const prior = (await client.query('select user_id,request_payload,result_payload from public.obligation_creation_operations where scope_type=$1 and scope_id=$2 and operation_id=$3', [scopeType,scopeId,operationId])).rows[0];
    if (prior) {
      const previous = typeof prior.request_payload === 'string' ? JSON.parse(prior.request_payload) : prior.request_payload;
      if (prior.user_id !== scope.userId || Object.keys(request).some(key => previous[key] !== request[key as keyof typeof request])) throw new Error('obligation_operation_conflict');
      const result = typeof prior.result_payload === 'string' ? JSON.parse(prior.result_payload) : prior.result_payload;
      await client.query('COMMIT');
      return { rows: [result], operationId, replayed: true };
    }
    const id = crypto.randomUUID();
    const table = kind === 'payable' ? 'payables' : 'receivables';
    const partyColumn = kind === 'payable' ? 'supplier' : 'customer';
    if (beforeInsert) await beforeInsert(id, request.dueDate, client);
    const row = (await client.query(`insert into public.${table}(id,user_id,org_id,title,status,amount,issue_date,due_date,category,cost_center_id,${partyColumn},notes,is_business_revenue,is_business_expense) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [id,scope.userId,scope.orgId,request.title,'open',request.amount,request.issueDate,request.dueDate,request.category,request.costCenterId,request.party,request.notes,request.isBusinessRevenue,request.isBusinessExpense])).rows[0];
    await client.query('insert into public.obligation_creation_operations(scope_type,scope_id,operation_id,user_id,request_payload,result_payload) values($1,$2,$3,$4,$5,$6)', [scopeType,scopeId,operationId,scope.userId,JSON.stringify(request),JSON.stringify(row)]);
    await client.query('COMMIT');
    return { rows: [row], operationId, replayed: false };
  } catch (error: any) {
    await client.query('ROLLBACK');
    if (error?.code === '42P01' || error?.code === '42703') throw new Error('obligation_schema_required');
    throw error;
  } finally { client.release(); }
}
