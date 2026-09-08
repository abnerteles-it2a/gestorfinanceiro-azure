import { Pool } from 'pg';
import crypto from 'crypto';
import { verifySession } from '../_auth_shared';

let pool: Pool | null = null;
const getPool = () => {
  const global = globalThis as any;
  if (global.__gf_pg_pool) return global.__gf_pg_pool as Pool;
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
};

const respond = (res: any, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
};

export default async function handler(req: any, res: any) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    respond(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const result = await verifySession(req, res, getPool());
  if (!result) return;
  const { userId } = result;
  const { actionType, params } = req.body || {};
  if (actionType !== 'pay_bill' || !params?.billId || !params?.accountId) {
    respond(res, 400, { error: actionType === 'pay_bill' ? 'missing_params' : 'unsupported_action' });
    return;
  }

  const db = getPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const profile = await client.query('select org_id from public.profiles where user_id=$1', [userId]);
    const profileOrgId = profile.rows[0]?.org_id || null;
    const requestedOrganizationScope = String(req.headers['x-view-mode'] || '').toLowerCase() === 'organization';
    const orgId = requestedOrganizationScope ? profileOrgId : null;

    let membership: any = null;
    if (orgId) {
      const membershipResult = await client.query('select role from public.org_members where org_id=$1 and user_id=$2', [orgId, userId]);
      membership = membershipResult.rows[0];
      if (!membership) {
        await client.query('ROLLBACK');
        respond(res, 403, { error: 'organization_access_denied' });
        return;
      }
    }

    const billScopeSql = orgId
      ? 'select * from public.payables where id=$1 and org_id=$2 for update'
      : 'select * from public.payables where id=$1 and user_id=$2 and org_id is null for update';
    const billResult = await client.query(billScopeSql, orgId ? [params.billId, orgId] : [params.billId, userId]);
    const bill = billResult.rows[0];
    if (!bill) {
      await client.query('ROLLBACK');
      respond(res, 404, { error: 'bill_not_found' });
      return;
    }
    if (bill.status !== 'open') {
      await client.query('ROLLBACK');
      respond(res, 409, { error: 'bill_already_paid' });
      return;
    }

    if (orgId && membership.role === 'member') {
      const permission = await client.query(
        'select 1 from public.cost_center_permissions where user_id=$1 and cost_center_id=$2 and role in ($3,$4) limit 1',
        [userId, bill.cost_center_id, 'editor', 'manager'],
      );
      if (!bill.cost_center_id || permission.rows.length === 0) {
        await client.query('ROLLBACK');
        respond(res, 403, { error: 'permission_denied_cc' });
        return;
      }
    }

    const accountScopeSql = orgId
      ? 'select id from public.accounts where id=$1 and org_id=$2 for update'
      : 'select id from public.accounts where id=$1 and user_id=$2 and org_id is null for update';
    const account = await client.query(accountScopeSql, orgId ? [params.accountId, orgId] : [params.accountId, userId]);
    if (!account.rows[0]) {
      await client.query('ROLLBACK');
      respond(res, 404, { error: 'account_not_found' });
      return;
    }

    const txId = crypto.randomUUID();
    const updateResult = await client.query(
      'update public.payables set status=$1, transaction_id=$2, paid_amount=$3, updated_at=now() where id=$4 and status=$5 returning id',
      ['paid', txId, bill.amount, bill.id, 'open'],
    );
    if (!updateResult.rows[0]) {
      await client.query('ROLLBACK');
      respond(res, 409, { error: 'bill_already_paid' });
      return;
    }

    await client.query(
      `insert into public.transactions
       (id,user_id,date,account_id,transaction_type,category,description,amount,cost_center_id,org_id)
       values($1,$2,current_date,$3,$4,$5,$6,$7,$8,$9)`,
      [txId, userId, params.accountId, 'Saída', bill.category || 'Pagamento', `Pagamento: ${bill.title}`, bill.amount, bill.cost_center_id, orgId],
    );
    await client.query('COMMIT');
    respond(res, 200, { success: true, transactionId: txId });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('AI payment execution failed:', error?.message);
    respond(res, 500, { error: 'internal_error' });
  } finally {
    client.release();
  }
}
