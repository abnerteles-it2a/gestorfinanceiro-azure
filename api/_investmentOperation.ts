import crypto from 'node:crypto';
import type { FinancialDatabase, FinancialScope } from './_financial';
import { planLotReduction } from '../utils/investmentLots';

export interface InvestmentCash {
  amount: number;
  accountId: string;
  category: string;
  description?: string;
  paymentMethod?: string;
  costCenterId?: string | null;
}
export type InvestmentDisposeCommand = {
  operationId: string;
  date: string;
  cash?: InvestmentCash;
} & ({ kind: 'variable'; assetId?: string; ticker?: string; assetType?: string; quantity: number }
  | { kind: 'fixed'; assetId: string; principalAmount: number });
export interface InvestmentDisposeResult {
  operationId: string;
  replayed: boolean;
  kind: 'variable' | 'fixed';
  updated: any[];
  removedIds: string[];
  tx?: any;
}
type Pool = { connect(): Promise<FinancialDatabase & { release(): void }> };
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const money = (value: unknown): value is number => positive(value) && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
// Matches investments.quantity numeric(14,8); integer units avoid fractional FIFO dust.
const quantityUnits = (value: number) => {
  const units = Math.round(value * 1e8);
  if (!Number.isSafeInteger(units) || Math.abs(value * 1e8 - units) > 1e-6 || units < 0) throw new Error('invalid_investment_quantity');
  return units;
};

export async function disposeInvestment(pool: Pool, scope: FinancialScope, data: InvestmentDisposeCommand,
  beforeInsert?: (id: string, date: string, db: FinancialDatabase) => Promise<void>): Promise<InvestmentDisposeResult> {
  if (!data || !uuid(data.operationId)) throw new Error('invalid_investment_operation');
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0,10) !== data.date) throw new Error('invalid_investment_date');
  if (data.kind === 'fixed') {
    if (!uuid(data.assetId) || !money(data.principalAmount)) throw new Error('invalid_investment_principal');
  } else if (data.kind === 'variable') {
    if (!positive(data.quantity) || (data.assetId ? !uuid(data.assetId) : typeof data.ticker !== 'string' || !data.ticker.trim() || typeof data.assetType !== 'string' || !data.assetType.trim())) throw new Error('invalid_investment_quantity');
  } else throw new Error('invalid_investment_kind');
  if (data.cash && (!money(data.cash.amount) || !uuid(data.cash.accountId) || typeof data.cash.category !== 'string' || !data.cash.category.trim() || (data.cash.costCenterId != null && !uuid(data.cash.costCenterId)) || (data.cash.description !== undefined && typeof data.cash.description !== 'string') || (data.cash.paymentMethod !== undefined && typeof data.cash.paymentMethod !== 'string'))) throw new Error('invalid_investment_cash');
  // Freeze the validated request before any await, so the journal matches exactly what ran.
  data = structuredClone(data);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Scope-wide serialization also covers a first retry after its target lot was deleted.
    // Legacy CRUD endpoints do not participate in this advisory lock.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`investment:${scope.orgId ? 'org' : 'personal'}:${scope.orgId || scope.userId}`]);
    const journalParams = [scope.orgId ? 'org' : 'personal', scope.orgId || scope.userId, data.operationId];
    let prior: any;
    try {
      prior = (await client.query('select * from public.investment_operations where scope_type=$1 and scope_id=$2 and operation_id=$3', journalParams)).rows[0];
    } catch (error: any) {
      if (['42P01', '42703'].includes(error.code)) throw new Error('investment_operation_schema_unavailable');
      throw error;
    }
    if (prior) {
      if (prior.user_id !== scope.userId || canonical(prior.request_payload) !== canonical(data)) throw new Error('investment_operation_conflict');
      await client.query('COMMIT');
      return { ...prior.result_payload, replayed: true };
    }
    const where = scope.orgId ? 'org_id=$2' : 'user_id=$2 and org_id is null';
    const targetScope = scope.orgId || scope.userId;
    const updated: any[] = [];
    const removedIds: string[] = [];
    const table = data.kind === 'fixed' ? 'fixed_income_investments' : 'investments';
    let reductions: { id: string; quantity: number }[];
    if (data.kind === 'fixed') {
      const row = (await client.query(`select * from public.fixed_income_investments where id=$1 and ${where} for update`, [data.assetId, targetScope])).rows[0];
      if (!row) throw new Error('investment_not_found');
      const principalCents = Math.round(data.principalAmount * 100);
      const investedCents = Math.round(Number(row.amount_invested) * 100);
      if (!Number.isSafeInteger(investedCents) || principalCents > investedCents) throw new Error('invalid_investment_principal');
      reductions = [{ id: row.id, quantity: (investedCents - principalCents) / 100 }];
    } else {
      let ticker = data.ticker?.trim().toUpperCase();
      let assetType = data.assetType;
      if (data.assetId) {
        const row = (await client.query(`select * from public.investments where id=$1 and ${where}`, [data.assetId, targetScope])).rows[0];
        if (!row) throw new Error('investment_not_found');
        ticker = String(row.ticker).toUpperCase();
        assetType = row.type;
      }
      const lots = (await client.query(`select * from public.investments where upper(ticker)=$1 and ${where} and type=$3 order by purchase_date,id for update`, [ticker, targetScope, assetType])).rows;
      const units = quantityUnits(data.quantity);
      if (units <= 0) throw new Error('invalid_investment_quantity');
      try {
        reductions = planLotReduction(lots.map(row => ({ id: row.id, quantity: quantityUnits(Number(row.quantity)), purchaseDate: row.purchase_date instanceof Date ? row.purchase_date.toISOString().slice(0,10) : String(row.purchase_date) })), units).map(row => ({ id: row.id, quantity: row.quantity / 1e8 }));
      } catch (error: any) {
        if (error.message === 'insufficient_quantity') throw new Error('investment_insufficient_quantity');
        throw error;
      }
    }
    for (const reduction of reductions) {
      if (reduction.quantity === 0) {
        await client.query(`delete from public.${table} where id=$1 and ${where} returning *`, [reduction.id, targetScope]);
        removedIds.push(reduction.id);
      } else {
        const rows = (await client.query(`update public.${table} set ${data.kind === 'fixed' ? 'amount_invested' : 'quantity'}=$1 where id=$2 and ${scope.orgId ? 'org_id=$3' : 'user_id=$3 and org_id is null'} returning *`, [reduction.quantity, reduction.id, targetScope])).rows;
        updated.push(...rows);
      }
    }
    let tx: any;
    if (data.cash) {
      const cash = data.cash;
      const account = (await client.query(`select id from public.accounts where id=$1 and ${scope.orgId ? 'org_id=$2' : 'user_id=$2 and org_id is null'} for share`, [cash.accountId, scope.orgId || scope.userId])).rows[0];
      if (!account) throw new Error('permission_denied_account');
      if (cash.costCenterId) {
        const center = (await client.query(`select id from public.cost_centers where id=$1 and ${where} for share`, [cash.costCenterId, targetScope])).rows[0];
        if (!center) throw new Error('permission_denied_cost_center');
      }
      const txId = crypto.randomUUID();
      if (beforeInsert) await beforeInsert(txId, data.date, client);
      tx = (await client.query('insert into public.transactions(id,user_id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *', [txId, scope.userId, data.date, cash.accountId, null, 'Entrada', cash.category, cash.description || null, cash.amount, cash.paymentMethod || null, cash.costCenterId || null, scope.orgId])).rows[0];
    }
    const result = { operationId: data.operationId, replayed: false, kind: data.kind, updated, removedIds, ...(tx ? { tx } : {}) };
    await client.query('insert into public.investment_operations(scope_type,scope_id,operation_id,user_id,request_payload,result_payload) values($1,$2,$3,$4,$5,$6)', [...journalParams, scope.userId, JSON.stringify(data), JSON.stringify(result)]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
