import type { Pool, PoolClient } from 'pg';

export type BillingPayment = {
    paymentId: string;
    userId: string;
    orgId: string | null;
    tier: string;
    billingPeriod: string | null;
};

const scopeKey = (p: BillingPayment) => p.orgId ? `org:${p.orgId}` : `user:${p.userId}`;
const subscription = (p: BillingPayment) => p.orgId
    ? { table: 'org_subscriptions', column: 'org_id', id: p.orgId }
    : { table: 'user_subscriptions', column: 'user_id', id: p.userId };

export async function billingTransaction<T>(pool: Pool, payment: BillingPayment, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Same order in checkout/webhook. The user lock also serializes profile/trial changes across scopes.
        for (const key of [`billing:user:${payment.userId}`, `billing:${scopeKey(payment)}`, `billing:payment:${payment.paymentId}`]) {
            await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
        }
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
        throw error;
    } finally {
        client.release();
    }
}

export async function assertBillingSchema(pool: Pool) {
    // Fail before contacting the provider if the journal migration is unavailable.
    await pool.query('SELECT payment_id, sequence_id, scope_key, user_id, org_id, tier, billing_period, state, applied_at FROM public.billing_payments LIMIT 0');
    await pool.query('SELECT asaas_payment_id, created_at, billing_period, requested_tier, period_start, period_end FROM public.user_subscriptions LIMIT 0');
    await pool.query('SELECT asaas_payment_id, created_at, billing_period, requested_tier, period_start, period_end, pending_payment_id, pending_billing_period, pending_requested_tier, pending_period_start, pending_period_end FROM public.org_subscriptions LIMIT 0');
}

async function readSubscription(client: PoolClient, p: BillingPayment) {
    const s = subscription(p);
    const result = await client.query(`SELECT * FROM public.${s.table} WHERE ${s.column}=$1 ORDER BY created_at DESC FOR UPDATE`, [s.id]);
    if (result.rows.length > 1) throw new Error('Ambiguous billing subscription; reconcile duplicate subscription rows first.');
    return result.rows[0];
}

async function insertPayment(client: PoolClient, p: BillingPayment, state = 'pending') {
    const result = await client.query(
        `INSERT INTO public.billing_payments (payment_id, scope_key, user_id, org_id, tier, billing_period, state)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [p.paymentId, scopeKey(p), p.userId, p.orgId, p.tier, p.billingPeriod, state]
    );
    return result.rows[0];
}

export async function registerBillingPayment(pool: Pool, p: BillingPayment, nextEnd: Date) {
    return billingTransaction(pool, p, async client => {
        const row = await readSubscription(client, p);
        // Anchor legacy paid access before assigning a sequence to the new checkout.
        // Otherwise a late callback for the old payment would look newer than this renewal.
        if (row?.asaas_payment_id && ['active', 'expired'].includes(row.status) && row.billing_period !== 'trial') {
            const existing = await client.query('SELECT * FROM public.billing_payments WHERE payment_id=$1 FOR UPDATE', [row.asaas_payment_id]);
            if (!existing.rows.length) {
                await insertPayment(client, {
                    ...p, paymentId: row.asaas_payment_id,
                    tier: row.requested_tier || p.tier,
                    billingPeriod: ['yearly', 'annually'].includes(row.billing_period) ? 'yearly' : 'monthly'
                }, 'applied');
            }
        }
        await insertPayment(client, p);
        const s = subscription(p);
        const active = row?.status === 'active' && (!row.period_end || new Date(row.period_end).getTime() >= Date.now());
        if (active) {
            if (p.orgId) {
                await client.query(
                    `UPDATE public.org_subscriptions SET pending_payment_id=$1, pending_billing_period=$2,
                     pending_requested_tier=$3, pending_period_start=now(), pending_period_end=$4 WHERE org_id=$5`,
                    [p.paymentId, p.billingPeriod, p.tier, nextEnd, p.orgId]
                );
            }
            // Personal checkout is recorded in the journal without overwriting paid access.
        } else if (row) {
            await client.query(
                `UPDATE public.${s.table} SET provider='asaas', status='pending', asaas_payment_id=$1,
                 billing_period=$2, requested_tier=$3, period_start=now(), period_end=$4 WHERE ${s.column}=$5`,
                [p.paymentId, p.billingPeriod, p.tier, nextEnd, s.id]
            );
        } else {
            await client.query(
                `INSERT INTO public.${s.table} (${s.column}, provider, status, asaas_payment_id, billing_period, requested_tier, period_start, period_end)
                 VALUES ($1,'asaas','pending',$2,$3,$4,now(),$5)`,
                [s.id, p.paymentId, p.billingPeriod, p.tier, nextEnd]
            );
        }
    });
}

function addMonths(base: Date, count: number) {
    const end = new Date(base);
    const day = end.getDate();
    end.setMonth(end.getMonth() + count);
    if (end.getDate() < day) end.setDate(0);
    return end;
}

export async function applyBillingEvent(pool: Pool, p: BillingPayment, event: string) {
    const success = event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
    const overdue = event === 'PAYMENT_OVERDUE';
    const failed = ['PAYMENT_CANCELED', 'PAYMENT_DELETED', 'PAYMENT_REFUNDED'].includes(event);
    if (!success && !overdue && !failed) return;
    return billingTransaction(pool, p, async client => {
        const row = await readSubscription(client, p);
        let record = (await client.query('SELECT * FROM public.billing_payments WHERE payment_id=$1 FOR UPDATE', [p.paymentId])).rows[0];
        if (!record) {
            // Only import legacy payments still explicitly linked to this subscription.
            const pending = row?.pending_payment_id === p.paymentId;
            const current = row?.asaas_payment_id === p.paymentId;
            if (!row || (!pending && !current)) throw new Error('Payment not registered; retry after checkout or reconcile legacy payment.');
            const bill = p.billingPeriod || (pending ? row.pending_billing_period : row.billing_period);
            const tier = (pending ? row.pending_requested_tier : row.requested_tier) || p.tier;
            const applied = current && ['active', 'expired'].includes(row.status);
            record = await insertPayment(client, { ...p, tier, billingPeriod: ['yearly', 'annually'].includes(bill) ? 'yearly' : 'monthly' }, applied ? 'applied' : 'pending');
        }
        if (record.scope_key !== scopeKey(p) || record.user_id !== p.userId || record.org_id !== p.orgId || record.tier !== p.tier || (p.billingPeriod && record.billing_period !== p.billingPeriod)) {
            throw new Error('Payment reference does not match registered checkout.');
        }
        // Applied is terminal: confirmation variants and delayed failures cannot undo paid access.
        if (['applied', 'superseded', 'failed'].includes(record.state)) return;
        if (!row) throw new Error('Subscription missing for registered payment.');
        const newer = await client.query(
            `SELECT payment_id FROM public.billing_payments WHERE scope_key=$1 AND sequence_id>$2 AND state='applied' LIMIT 1`,
            [scopeKey(p), record.sequence_id]
        );
        if (newer.rows.length) {
            await client.query('UPDATE public.billing_payments SET state=$1 WHERE payment_id=$2', ['superseded', p.paymentId]);
            return;
        }
        const s = subscription(p);
        if (!success) {
            await client.query('UPDATE public.billing_payments SET state=$1 WHERE payment_id=$2', [overdue ? 'overdue' : 'failed', p.paymentId]);
            if (row.asaas_payment_id === p.paymentId && row.status !== 'active') {
                await client.query(`UPDATE public.${s.table} SET status=$1 WHERE ${s.column}=$2 AND asaas_payment_id=$3`, [overdue ? 'overdue' : 'canceled', s.id, p.paymentId]);
            }
            if (failed && p.orgId) {
                await client.query(
                    `UPDATE public.org_subscriptions SET pending_payment_id=null, pending_billing_period=null,
                     pending_requested_tier=null, pending_period_start=null, pending_period_end=null
                     WHERE org_id=$1 AND pending_payment_id=$2`, [p.orgId, p.paymentId]
                );
            }
            // Keep the payment association on overdue so a subsequent confirmation can recover it.
            return;
        }
        const currentEnd = row.period_end ? new Date(row.period_end).getTime() : 0;
        const sameTier = String(row.requested_tier || '').toLowerCase() === record.tier;
        const base = sameTier && row.billing_period !== 'trial' && row.status === 'active' && currentEnd > Date.now()
            ? new Date(currentEnd) : new Date();
        const end = addMonths(base, record.billing_period === 'yearly' ? 12 : 1);
        await client.query(
            `UPDATE public.${s.table} SET provider='asaas', status='active', period_start=$1, period_end=$2,
             billing_period=$3, requested_tier=$4, asaas_payment_id=$5 WHERE ${s.column}=$6`,
            [base, end, record.billing_period, record.tier, p.paymentId, s.id]
        );
        if (p.orgId) {
            await client.query(
                `UPDATE public.org_subscriptions SET pending_payment_id=null, pending_billing_period=null,
                 pending_requested_tier=null, pending_period_start=null, pending_period_end=null
                 WHERE org_id=$1 AND pending_payment_id=$2`, [p.orgId, p.paymentId]
            );
        }
        // Serialize creation of a previously unseen tier across independent subscriptions.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`billing:plan:${record.tier}`]);
        const plans = await client.query('SELECT id FROM public.plans WHERE lower(tier)=$1 LIMIT 1', [record.tier]);
        let planId = plans.rows[0]?.id;
        if (!planId) {
            planId = (await client.query('INSERT INTO public.plans (id, name, tier) VALUES (gen_random_uuid(), $1, $2) RETURNING id', [record.tier.toUpperCase(), record.tier])).rows[0]?.id;
        }
        if (p.orgId) {
            await client.query('UPDATE public.organizations SET plan_id=$1, seats=$2 WHERE id=$3', [planId, record.tier === 'pro' ? 2 : 1, p.orgId]);
            await client.query('UPDATE public.profiles SET org_id=$1 WHERE user_id=$2', [p.orgId, p.userId]);
            await client.query("UPDATE public.user_subscriptions SET status='expired', period_end=now() WHERE user_id=$1 AND billing_period='trial' AND status='active'", [p.userId]);
        } else {
            await client.query('UPDATE public.profiles SET plan_id=$1 WHERE user_id=$2', [planId, p.userId]);
        }
        await client.query("UPDATE public.billing_payments SET state='applied', applied_at=now() WHERE payment_id=$1", [p.paymentId]);
    });
}
