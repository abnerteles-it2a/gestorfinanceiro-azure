import { getPool } from '../_db';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    const db = getPool();

    try {
        const webhookSecret = process.env.ASAAS_WEBHOOK_SECRET;
        const receivedToken = req.headers['asaas-access-token'];

        if (webhookSecret && receivedToken !== webhookSecret) {
            console.warn('[Asaas Webhook] Unauthorized attempt. Invalid token.');
            res.statusCode = 401;
            res.end('Unauthorized');
            return;
        }

        let body: any = {};
        if (req.body) {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } else {
            let rawBody = '';
            await new Promise<void>((resolve) => { req.on('data', (c: any) => { rawBody += c; }); req.on('end', resolve); });
            body = rawBody ? JSON.parse(rawBody) : {};
        }

        const { event, payment } = body;
        console.log(`[Asaas Webhook] Event: ${event}, PaymentId: ${payment?.id}`);

        const externalRef = payment?.externalReference;
        const paymentId = payment?.id;
        if (!externalRef || !paymentId) {
            res.statusCode = 200; res.end('ok'); return;
        }

        const parts = String(externalRef).split('|');
        if (parts.length < 2) {
            res.statusCode = 200; res.end('ok'); return;
        }

        const tier = parts[0];
        const userId = parts[1];
        const orgId = parts[2] || null;
        // billingPeriod is now encoded in externalReference as the 4th segment (added in checkout fix)
        // Falls back to querying the DB for legacy payments that predate this change
        const billingFromRef = parts[3] ? String(parts[3]).toLowerCase() : null;
        const normalizedTier = String(tier || 'starter').toLowerCase();

        const addMonths = (d: Date, months: number) => {
            const x = new Date(d.getTime());
            const day = x.getDate();
            x.setMonth(x.getMonth() + months);
            if (x.getDate() < day) x.setDate(0);
            return x;
        };

        const isSuccess = event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED';
        const isFailed = event === 'PAYMENT_CANCELED' || event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED';
        const isOverdue = event === 'PAYMENT_OVERDUE';

        try { await db.query(`alter table public.user_subscriptions add column if not exists asaas_payment_id text`); } catch {}
        try { await db.query(`alter table public.user_subscriptions add column if not exists created_at timestamptz default now()`); } catch {}
        try { await db.query(`alter table public.user_subscriptions add column if not exists billing_period text`); } catch {}
        try { await db.query(`alter table public.user_subscriptions add column if not exists requested_tier text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists asaas_payment_id text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists created_at timestamptz default now()`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists billing_period text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists requested_tier text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists pending_payment_id text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists pending_billing_period text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists pending_requested_tier text`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists pending_period_start timestamptz`); } catch {}
        try { await db.query(`alter table public.org_subscriptions add column if not exists pending_period_end timestamptz`); } catch {}

        if (isSuccess) {
            if (orgId) {
                const cur = await db.query('select status, period_end, billing_period, pending_billing_period, pending_requested_tier, requested_tier from public.org_subscriptions where org_id=$1', [orgId]);
                const row = cur.rows[0] || {};
                const st = String(row.status || '').toLowerCase();
                const currentEnd = row.period_end ? new Date(row.period_end).getTime() : null;
                const now = Date.now();

                // Security: only extend period for SAME-TIER renewals.
                // Upgrades/downgrades always start from today to prevent period arbitrage
                // (e.g. pay Starter → Plus → Pro to accumulate 3 months of Pro at Starter price).
                const existingTier = String(row.requested_tier || row.pending_requested_tier || '').toLowerCase();
                const isSameTier = existingTier === normalizedTier;
                const isTrial = String(row.billing_period || '').toLowerCase() === 'trial';
                const base = isSameTier && !isTrial && currentEnd && currentEnd > now && st === 'active'
                    ? new Date(currentEnd)  // renewal: extend from end of current period
                    : new Date();           // upgrade/downgrade/trial conversion: start from today

                // Prefer billingPeriod from externalReference; fall back to DB pending/current
                const bill = (() => {
                    const ref = billingFromRef;
                    if (ref === 'yearly' || ref === 'annually') return 'yearly';
                    if (ref === 'monthly') return 'monthly';
                    const db_val = String(row.pending_billing_period || row.billing_period || 'monthly').toLowerCase();
                    return (db_val === 'yearly' || db_val === 'annually') ? 'yearly' : 'monthly';
                })();
                const end = bill === 'yearly' ? addMonths(base, 12) : addMonths(base, 1);
                await db.query(
                    `update public.org_subscriptions
                     set provider='asaas',
                         status='active',
                         period_start=$1,
                         period_end=$2,
                         billing_period=$3,
                         requested_tier=$4,
                         asaas_payment_id=$5,
                         pending_payment_id=null,
                         pending_billing_period=null,
                         pending_requested_tier=null,
                         pending_period_start=null,
                         pending_period_end=null
                     where org_id=$6`,
                    [base, end, bill, String(row.pending_requested_tier || row.requested_tier || normalizedTier), paymentId, orgId]
                );
            } else {
                // For user subscriptions: read billingPeriod from externalReference first
                const cur = await db.query(
                    `select period_end, billing_period
                     from public.user_subscriptions
                     where user_id=$1 and lower(status)='active' and (period_end is null or period_end >= now())
                     order by coalesce(period_end, 'infinity'::timestamptz) desc nulls last, period_start desc nulls last, created_at desc
                     limit 1`,
                    [userId]
                );
                const currentEnd = cur.rows[0]?.period_end ? new Date(cur.rows[0].period_end).getTime() : null;
                const now = Date.now();
                const base = currentEnd && currentEnd > now ? new Date(currentEnd) : new Date();
                // Prefer externalReference billing; fall back to DB lookup (legacy payments)
                const bill = (() => {
                    if (billingFromRef === 'yearly' || billingFromRef === 'annually') return 'yearly';
                    if (billingFromRef === 'monthly') return 'monthly';
                    // Legacy fallback: query the pending record
                    return null; // resolved below
                })();
                let resolvedBill = bill;
                if (!resolvedBill) {
                    const pending = await db.query(
                        `select billing_period from public.user_subscriptions where user_id=$1 and asaas_payment_id=$2 order by created_at desc limit 1`,
                        [userId, paymentId]
                    );
                    const raw = String(pending.rows[0]?.billing_period || 'monthly').toLowerCase();
                    resolvedBill = (raw === 'yearly' || raw === 'annually') ? 'yearly' : 'monthly';
                }
                const end = resolvedBill === 'yearly' ? addMonths(base, 12) : addMonths(base, 1);
                await db.query(
                    `update public.user_subscriptions
                     set status='active', period_start=$1, period_end=$2, billing_period=$3
                     where user_id=$4 and asaas_payment_id=$5`,
                    [base, end, resolvedBill, userId, paymentId]
                );
            }

            const planRes = await db.query('SELECT id FROM public.plans WHERE lower(tier) = $1 LIMIT 1', [normalizedTier]);
            let planId = planRes.rows[0]?.id;
            if (!planId) {
                const insertRes = await db.query('INSERT INTO public.plans (id, name, tier) VALUES (gen_random_uuid(), $1, $2) RETURNING id', [normalizedTier.toUpperCase(), normalizedTier]);
                planId = insertRes.rows[0]?.id;
            }
            if (orgId) {
                await db.query('UPDATE public.organizations SET plan_id = $1 WHERE id = $2', [planId, orgId]);
                await db.query('UPDATE public.profiles SET org_id = $1 WHERE user_id = $2', [orgId, userId]);
                // Always enforce correct seat count per plan tier
                const seatsByTier: Record<string, number> = { starter: 1, plus: 1, pro: 2 };
                const correctSeats = seatsByTier[normalizedTier] ?? 1;
                await db.query(
                    'UPDATE public.organizations SET seats = $1 WHERE id = $2',
                    [correctSeats, orgId]
                );
                console.log(`[Webhook] Set seats=${correctSeats} for org=${orgId} on tier=${normalizedTier}`);
                // Expire any lingering trial records in user_subscriptions so they
                // don't shadow the confirmed org payment in personal view mode
                await db.query(
                    `UPDATE public.user_subscriptions
                     SET status='expired', period_end=now()
                     WHERE user_id=$1 AND billing_period='trial' AND status='active'`,
                    [userId]
                );
            } else {
                await db.query('UPDATE public.profiles SET plan_id = $1 WHERE user_id = $2', [planId, userId]);
            }
        } else if (isOverdue || isFailed) {
            if (orgId) {
                const cur = await db.query('select status, period_end from public.org_subscriptions where org_id=$1', [orgId]);
                const row = cur.rows[0] || {};
                const st = String(row.status || '').toLowerCase();
                const end = row.period_end ? new Date(row.period_end).getTime() : null;
                const stillActive = st === 'active' && (!end || end >= Date.now());
                if (stillActive) {
                    await db.query(
                        `update public.org_subscriptions
                         set pending_payment_id=null,
                             pending_billing_period=null,
                             pending_requested_tier=null,
                             pending_period_start=null,
                             pending_period_end=null
                         where org_id=$1 and pending_payment_id=$2`,
                        [orgId, paymentId]
                    );
                } else {
                    await db.query(
                        `update public.org_subscriptions
                         set status=$1,
                             pending_payment_id=null,
                             pending_billing_period=null,
                             pending_requested_tier=null,
                             pending_period_start=null,
                             pending_period_end=null
                         where org_id=$2 and (asaas_payment_id=$3 or pending_payment_id=$3)`,
                        [isOverdue ? 'overdue' : 'canceled', orgId, paymentId]
                    );
                }
            } else {
                await db.query(
                    `update public.user_subscriptions set status=$1 where user_id=$2 and asaas_payment_id=$3`,
                    [isOverdue ? 'overdue' : 'canceled', userId, paymentId]
                );
            }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', processed: true }));
    } catch (e: any) {
        console.error('[Asaas Webhook Error]:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'error', message: e?.message }));
    } finally {
        await db.end();
    }
}
