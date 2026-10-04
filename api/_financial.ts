import crypto from 'node:crypto';
export interface FinancialDatabase { query(sql: string, params?: any[]): Promise<{rows: any[]}>; }
export interface FinancialScope { userId: string; orgId: string | null; allowedCCs?: string[]; }
export async function resolveFinancialScope(db: FinancialDatabase, userId: string, viewMode: unknown) {
  if (viewMode !== 'organization' && viewMode !== 'corporate') return {userId,orgId:null,role:null,allowedCCs:undefined,editableCCs:undefined};
  const profile = (await db.query('select org_id from public.profiles where user_id=$1',[userId])).rows[0];
  if (!profile?.org_id) throw new Error('organization_access_denied');
  const role = (await db.query('select role from public.org_members where org_id=$1 and user_id=$2',[profile.org_id,userId])).rows[0]?.role;
  if (!['owner','admin','member'].includes(role)) throw new Error('organization_access_denied');
  const permissions = role === 'member' ? (await db.query('select cost_center_id, role from public.cost_center_permissions where org_id=$1 and user_id=$2',[profile.org_id,userId])).rows : [];
  return {userId,orgId:String(profile.org_id),role,allowedCCs:role === 'member' ? permissions.filter(p=>['viewer','editor','manager'].includes(p.role)).map(p=>String(p.cost_center_id)) : undefined,editableCCs:role === 'member' ? permissions.filter(p=>['editor','manager'].includes(p.role)).map(p=>String(p.cost_center_id)) : undefined};
}
function scoped(scope: FinancialScope, params: any[], alias = '') {
  params.push(scope.orgId || scope.userId);
  let filter = scope.orgId ? `${alias}org_id=$${params.length}` : `${alias}user_id=$${params.length} and ${alias}org_id is null`;
  if (scope.allowedCCs !== undefined) {
    params.push(scope.allowedCCs);
    filter += scope.allowedCCs.length ? ` and ${alias}cost_center_id = any($${params.length}::uuid[])` : ' and 1=0';
  }
  return filter;
}
export async function settleObligation(pool: {connect(): Promise<FinancialDatabase & {release(): void}>}, scope: FinancialScope, kind: 'payable' | 'receivable', data: any, beforeInsert?: (id: string, date: string, db: FinancialDatabase) => Promise<void>) {
  const table = kind === 'payable' ? 'payables' : 'receivables';
  const amountColumn = kind === 'payable' ? 'paid_amount' : 'received_amount';
  const operationId = data.operationId || crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) throw new Error('invalid_settlement_operation');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const params = [data.id];
    const where = scoped(scope,params);
    const row = (await client.query(`select * from public.${table} where id=$1 and ${where} for update`,params)).rows[0];
    if (!row) throw new Error('not_found');
    const settled = Number(row[amountColumn] || 0);
    const remaining = Math.max(0,Number(row.amount)-settled);
    const existing = (await client.query('select * from public.obligation_settlements where operation_id=$1', [operationId])).rows[0];
    if (existing) {
      if (existing.obligation_id !== data.id || existing.kind !== kind || (data.accountId && existing.account_id !== data.accountId) || (data[kind === 'payable' ? 'paidAmount' : 'receivedAmount'] != null && Number(existing.principal_amount) !== Number(data[kind === 'payable' ? 'paidAmount' : 'receivedAmount']))) throw new Error('settlement_operation_conflict');
      const expectedCash = Math.round((Number(existing.principal_amount)-Number(data.discountAmount || 0)+Number(data.penaltyAmount || 0))*100)/100;
      if (Number(existing.cash_amount) !== expectedCash) throw new Error('settlement_operation_conflict');
      const tx = (await client.query('select * from public.transactions where id=$1',[existing.transaction_id])).rows[0];
      await client.query('COMMIT');
      return {rows:[{...row,remaining_amount:remaining}],tx,replayed:true};
    }
    const cents = (value: any) => Math.round(Number(value)*100);
    const principal = cents(data[kind === 'payable' ? 'paidAmount' : 'receivedAmount'] ?? remaining);
    const discount = cents(data.discountAmount || 0); const penalty = cents(data.penaltyAmount || 0);
    if (!Number.isFinite(principal) || principal <= 0 || principal > cents(remaining) || ['paid','received','cancelled'].includes(row.status) || !Number.isFinite(discount) || discount < 0 || discount > principal || !Number.isFinite(penalty) || penalty < 0) throw new Error('invalid_settlement_amount');
    const cash = principal-discount+penalty;
    if (cash <= 0 || !data.accountId) throw new Error('invalid_settlement_amount');
    const accountParams = [data.accountId,scope.orgId || scope.userId];
    const account = await client.query(`select id from public.accounts where id=$1 and ${scope.orgId ? 'org_id=$2' : 'user_id=$2 and org_id is null'}`,accountParams);
    if (!account.rows.length) throw new Error('permission_denied_account');
    const txId = crypto.randomUUID();
    const date = data[kind === 'payable' ? 'paidDate' : 'receivedDate'] || row.due_date;
    if (beforeInsert) await beforeInsert(txId,date instanceof Date ? date.toISOString().slice(0,10) : String(date),client);
    const tx = (await client.query('insert into public.transactions(id,user_id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *',[txId,scope.userId,date,data.accountId,null,kind === 'payable' ? 'Saída' : 'Entrada',row.category || (kind === 'payable' ? 'Contas a Pagar' : 'Contas a Receber'),data.description || row.title,cash/100,data.paymentMethod || null,row.cost_center_id,scope.orgId])).rows[0];
    const cumulative = (cents(settled)+principal)/100;
    const status = cents(cumulative) >= cents(row.amount) ? (kind === 'payable' ? 'paid' : 'received') : 'open';
    const updateParams: any[] = [status,cumulative,txId,data.id];
    const updateWhere = scoped(scope,updateParams);
    const updated = (await client.query(`update public.${table} set status=$1, ${amountColumn}=$2, transaction_id=$3, updated_at=now() where id=$4 and ${updateWhere} returning *`,updateParams)).rows[0];
    await client.query('insert into public.obligation_settlements(operation_id,obligation_id,kind,principal_amount,cash_amount,account_id,transaction_id) values($1,$2,$3,$4,$5,$6,$7)',[operationId,data.id,kind,principal/100,cash/100,data.accountId,txId]);
    await client.query('COMMIT');
    return {rows:[{...updated,remaining_amount:Math.max(0,(cents(row.amount)-cents(cumulative))/100)}],tx,operationId,replayed:false};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export async function financialSnapshot(db: FinancialDatabase, scope: FinancialScope, period?: {startDate: string;endDate: string}) {
  const now = new Date();
  const startDate = period?.startDate || new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10);
  const endDate = period?.endDate || new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString().slice(0,10);
  if (![startDate,endDate].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))) || endDate <= startDate) throw new Error('invalid_date_range');
  const params: any[] = []; const txWhere = scoped(scope,params);
  params.push(scope.orgId || scope.userId); const accountWhere = scope.orgId ? `org_id=$${params.length}` : `user_id=$${params.length} and org_id is null`;
  params.push(startDate,endDate); const start=`$${params.length-1}::date`; const end=`$${params.length}::date`;
  const result = await db.query(`with scoped_transactions as (
    select *, lower(transaction_type) as kind from public.transactions where ${txWhere}
  ), account_balances as (
    select a.id, coalesce(a.initial_balance,0) + coalesce(sum(
      case when t.kind in ('transferência','transferencia','transfer') and t.to_account_id=a.id then t.amount else 0 end
      - case when t.kind in ('transferência','transferencia','transfer') and t.account_id=a.id then t.amount else 0 end
      + case when t.kind in ('entrada','income','receita') and t.account_id=a.id then t.amount else 0 end
      - case when t.kind in ('saída','saida','expense','despesa') and t.account_id=a.id then t.amount else 0 end
    ),0) as balance
    from (select * from public.accounts where ${accountWhere}) a
    left join scoped_transactions t on t.account_id=a.id or t.to_account_id=a.id group by a.id,a.initial_balance
  ) select jsonb_build_object(
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'balance',balance)) from account_balances),'[]'::jsonb),
    'totals',jsonb_build_object('income',coalesce(sum(amount) filter(where kind in ('entrada','income','receita')),0),'expense',coalesce(sum(amount) filter(where kind in ('saída','saida','expense','despesa')),0),'transfers',coalesce(sum(amount) filter(where kind in ('transferência','transferencia','transfer')),0)),
    'period',jsonb_build_object('startDate',${start},'endDate',${end},'income',coalesce(sum(amount) filter(where kind in ('entrada','income','receita') and date >= ${start} and date < ${end}),0),'expense',coalesce(sum(amount) filter(where kind in ('saída','saida','expense','despesa') and date >= ${start} and date < ${end}),0)),
    'transactionCount',count(*)) as snapshot from scoped_transactions`,params);
  return result.rows[0].snapshot;
}
export async function patchInvestment(db: FinancialDatabase, scope: FinancialScope, kind: 'investment' | 'fixed', data: any) {
  const table = kind === 'investment' ? 'investments' : 'fixed_income_investments';
  const fields = kind === 'investment' ? {type:'type',ticker:'ticker',quantity:'quantity',purchasePrice:'purchase_price',purchaseDate:'purchase_date'} : {name:'name',issuer:'issuer',amountInvested:'amount_invested',yieldRate:'yield_rate',purchaseDate:'purchase_date',maturityDate:'maturity_date'};
  const params: any[] = [];
  const sets = Object.entries(fields).filter(([key]) => Object.prototype.hasOwnProperty.call(data,key) && data[key] !== undefined).map(([key,column]) => {params.push(data[key]);return `${column}=$${params.length}`;});
  params.push(data.id); const idParam=params.length; const where=scoped(scope,params);
  return db.query(sets.length ? `update public.${table} set ${sets.join(',')} where id=$${idParam} and ${where} returning *` : `select * from public.${table} where id=$${idParam} and ${where}`,params);
}
export async function financialTransactions(db: FinancialDatabase, scope: FinancialScope) {
  const params: any[] = [];
  const where = scoped(scope,params);
  return db.query(`select * from public.transactions where ${where} order by date desc, created_at desc, id desc`,params);
}
export async function listTransactions(db: FinancialDatabase, scope: FinancialScope, data: any = {}) {
  const params: any[] = [];
  let where = scoped(scope, params);
  const limit = Math.max(1, Math.min(Math.trunc(Number(data.limit) || 100), 500));
  if (data.cursor) {
    const {date, createdAt, id} = data.cursor;
    if (!date || !createdAt || !id) throw new Error('invalid_transaction_cursor');
    params.push(date,createdAt,id);
    where += ` and (date, created_at, id) < ($${params.length-2}::date,$${params.length-1}::timestamptz,$${params.length}::uuid)`;
  } else if (data.beforeDate) {
    params.push(data.beforeDate); where += ` and date < $${params.length}`;
  }
  params.push(limit+1);
  let sql = `select * from public.transactions where ${where} order by date desc, created_at desc, id desc limit $${params.length}`;
  if (!data.cursor && data.offset !== undefined) {
    params.push(Math.max(0,Math.trunc(Number(data.offset)||0))); sql += ` offset $${params.length}`;
  }
  const result = await db.query(sql,params);
  const rows = result.rows.slice(0,limit);
  const last = rows.at(-1);
  return {rows,hasMore:result.rows.length>limit,nextCursor:last ? {date: last.date instanceof Date ? last.date.toISOString().slice(0,10) : last.date,createdAt:last.created_at instanceof Date ? last.created_at.toISOString() : last.created_at,id:last.id} : null};
}
