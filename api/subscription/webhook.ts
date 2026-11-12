import { getPool } from '../_db';
import { applyBillingEvent } from '../_billing';

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

        await applyBillingEvent(db, {
            paymentId: String(paymentId), userId, orgId, tier: normalizedTier,
            billingPeriod: billingFromRef === 'annually' ? 'yearly' : billingFromRef
        }, event);

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok', processed: true }));
    } catch (e: any) {
        console.error('[Asaas Webhook Error]:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'error', message: e?.message }));
    }
}
