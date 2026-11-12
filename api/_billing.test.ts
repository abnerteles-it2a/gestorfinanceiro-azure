import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { SignJWT } from 'jose';
import { applyBillingEvent, registerBillingPayment, type BillingPayment } from './_billing';
import webhook from './subscription/webhook';
import checkout from './subscription/checkout';

type Row = Record<string, any>;
class BillingAdapter {
    state = { subscriptions: {} as Record<string, Row>, payments: {} as Record<string, Row>, profiles: {} as Record<string, Row>, organizations: {} as Record<string, Row> };
    sequence = 0;
    ended = false;
    releases = 0;
    rollbacks = 0;
    commits = 0;
    waits = 0;
    grants = 0;
    fail = '';
    missingSchema = false;
    private locks = new Map<string, Promise<void>>();
    asPool() { return this as unknown as Pool; }
    async end() { this.ended = true; }
    async query(sql: string) {
        assert.equal(this.ended, false, 'global pool must remain usable');
        if (sql.includes('billing_payments') && this.missingSchema) throw new Error('relation billing_payments does not exist');
        if (sql.includes('auth_sessions')) return { rows: [{ user_id: 'user', last_seen: new Date() }] };
        if (sql.includes('SELECT full_name')) return { rows: [{ full_name: 'Test', asaas_customer_id: 'customer', document: '00000000000' }] };
        return { rows: [] };
    }
    async connect() {
        const pool = this;
        let local: typeof pool.state | undefined;
        const unlocks = new Map<string, () => void>();
        const finish = () => { for (const release of unlocks.values()) release(); unlocks.clear(); };
        return {
            release() { pool.releases++; assert.equal(unlocks.size, 0); },
            async query(raw: string, values: any[] = []): Promise<{ rows: Row[] }> {
                const sql = raw.replace(/\s+/g, ' ').trim();
                if (pool.fail && sql.includes(pool.fail)) throw new Error('injected failure');
                if (sql === 'BEGIN') return { rows: [] };
                if (sql === 'COMMIT') { if (local) pool.state = local; pool.commits++; finish(); return { rows: [] }; }
                if (sql === 'ROLLBACK') { pool.rollbacks++; finish(); return { rows: [] }; }
                if (sql.includes('pg_advisory_xact_lock')) {
                    const key = values[0];
                    if (unlocks.has(key)) return { rows: [] };
                    const prior = pool.locks.get(key);
                    let release!: () => void;
                    const held = new Promise<void>(resolve => { release = resolve; });
                    pool.locks.set(key, held);
                    if (prior) { pool.waits++; await prior; }
                    unlocks.set(key, () => { if (pool.locks.get(key) === held) pool.locks.delete(key); release(); });
                    return { rows: [] };
                }
                assert.ok(unlocks.size, 'all billing SQL must run under transaction locks');
                local ??= structuredClone(pool.state);
                if (sql.includes('billing_payments') && pool.missingSchema) throw new Error('relation billing_payments does not exist');
                const state = local;
                if (sql.startsWith('SELECT * FROM public.') && sql.includes('subscriptions')) {
                    const row = state.subscriptions[values[0]];
                    return { rows: row ? [structuredClone(row)] : [] };
                }
                if (sql.startsWith('SELECT * FROM public.billing_payments')) return { rows: state.payments[values[0]] ? [structuredClone(state.payments[values[0]])] : [] };
                if (sql.startsWith('SELECT payment_id FROM public.billing_payments')) return { rows: Object.values(state.payments).filter(row => row.scope_key === values[0] && row.sequence_id > values[1] && row.state === 'applied').slice(0, 1) };
                if (sql.startsWith('INSERT INTO public.billing_payments')) {
                    assert.equal(state.payments[values[0]], undefined, 'payment_id is unique');
                    const row = { payment_id: values[0], scope_key: values[1], user_id: values[2], org_id: values[3], tier: values[4], billing_period: values[5], state: values[6], sequence_id: ++pool.sequence };
                    state.payments[values[0]] = row;
                    return { rows: [structuredClone(row)] };
                }
                if (sql.startsWith('UPDATE public.billing_payments')) {
                    if (sql.includes("state='applied'")) Object.assign(state.payments[values[0]], { state: 'applied', applied_at: new Date() });
                    else state.payments[values[1]].state = values[0];
                    return { rows: [] };
                }
                if (sql.startsWith('SELECT id FROM public.plans')) return { rows: [{ id: values[0] }] };
                if (sql.startsWith('UPDATE public.profiles')) {
                    state.profiles[values[1]] = { [sql.includes('org_id') ? 'org_id' : 'plan_id']: values[0] };
                    return { rows: [] };
                }
                if (sql.startsWith('UPDATE public.organizations')) { state.organizations[values[2]] = { plan_id: values[0], seats: values[1] }; return { rows: [] }; }
                if (sql.includes('subscriptions')) {
                    if (sql.includes("status='expired'")) return { rows: [] };
                    if (sql.includes('pending_payment_id=null')) {
                        const row = state.subscriptions[values[0]];
                        if (row.pending_payment_id === values[1]) for (const key of Object.keys(row)) if (key.startsWith('pending_')) row[key] = null;
                    } else if (sql.includes('SET pending_payment_id=$1')) {
                        Object.assign(state.subscriptions[values[4]], { pending_payment_id: values[0], pending_billing_period: values[1], pending_requested_tier: values[2], pending_period_end: values[3] });
                    } else if (sql.includes("status='active'")) {
                        pool.grants++;
                        Object.assign(state.subscriptions[values[5]], { status: 'active', period_start: values[0], period_end: values[1], billing_period: values[2], requested_tier: values[3], asaas_payment_id: values[4] });
                    } else if (sql.includes('SET status=$1')) {
                        if (state.subscriptions[values[1]].asaas_payment_id === values[2]) state.subscriptions[values[1]].status = values[0];
                    } else if (sql.startsWith('INSERT')) {
                        state.subscriptions[values[0]] = { status: 'pending', asaas_payment_id: values[1], billing_period: values[2], requested_tier: values[3], period_end: values[4] };
                    } else if (sql.includes("status='pending'")) {
                        Object.assign(state.subscriptions[values[4]], { status: 'pending', asaas_payment_id: values[0], billing_period: values[1], requested_tier: values[2], period_end: values[3] });
                    } else throw new Error(`Unexpected SQL: ${sql}`);
                    return { rows: [] };
                }
                throw new Error(`Unexpected SQL: ${sql}`);
            }
        };
    }
}

const payment = (org: boolean, id = 'p1', tier = 'starter'): BillingPayment => ({ paymentId: id, userId: 'user', orgId: org ? 'org' : null, tier, billingPeriod: 'monthly' });
const future = () => new Date(Date.now() + 90 * 86400000);
function seed(pool: BillingAdapter, org: boolean) {
    pool.state.subscriptions[org ? 'org' : 'user'] = { status: 'active', asaas_payment_id: 'previous', period_end: future(), requested_tier: 'starter', billing_period: 'monthly' };
}
function response() { return { statusCode: 0, body: '', setHeader() {}, end(value: string) { this.body = value; } }; }
async function dispatch(pool: BillingAdapter, p: BillingPayment, event: string) {
    const g = globalThis as any;
    const previous = g.__gf_pg_pool;
    const secret = process.env.ASAAS_WEBHOOK_SECRET;
    g.__gf_pg_pool = pool;
    process.env.ASAAS_WEBHOOK_SECRET = 'billing-test';
    try {
        const res = response();
        await webhook({ method: 'POST', headers: { 'asaas-access-token': 'billing-test' }, body: { event, payment: { id: p.paymentId, externalReference: `${p.tier}|${p.userId}|${p.orgId || ''}|${p.billingPeriod || ''}` } } }, res);
        return res;
    } finally { g.__gf_pg_pool = previous; if (secret === undefined) delete process.env.ASAAS_WEBHOOK_SECRET; else process.env.ASAAS_WEBHOOK_SECRET = secret; }
}

for (const org of [false, true]) {
    const scope = org ? 'organization' : 'personal';
    test(`${scope}: real webhook replays CONFIRMED/RECEIVED once and preserves pool`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const p = payment(org);
        const initialEnd = pool.state.subscriptions[org ? 'org' : 'user'].period_end.getTime();
        await registerBillingPayment(pool.asPool(), p, future());
        assert.equal(pool.state.subscriptions[org ? 'org' : 'user'].status, 'active');
        assert.equal((await dispatch(pool, p, 'PAYMENT_CONFIRMED')).statusCode, 200);
        const after = structuredClone(pool.state);
        assert.ok(after.subscriptions[org ? 'org' : 'user'].period_end.getTime() > initialEnd);
        assert.equal((await dispatch(pool, p, 'PAYMENT_RECEIVED')).statusCode, 200);
        assert.equal((await dispatch(pool, p, 'PAYMENT_CONFIRMED')).statusCode, 200);
        assert.deepEqual(pool.state, after);
        assert.equal(pool.grants, 1);
        assert.equal(pool.releases, 4);
        await pool.query('SELECT 1');
    });
    test(`${scope}: simultaneous callbacks serialize and grant once`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const p = payment(org); await registerBillingPayment(pool.asPool(), p, future());
        await Promise.all(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].map(event => applyBillingEvent(pool.asPool(), p, event)));
        assert.equal(pool.grants, 1); assert.ok(pool.waits > 0); assert.equal(pool.releases, 4);
    });
    test(`${scope}: different concurrent payments each renew once, preserving a newer checkout`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const first = payment(org), second = payment(org, 'p2');
        await registerBillingPayment(pool.asPool(), first, future());
        await registerBillingPayment(pool.asPool(), second, future());
        const initialEnd = pool.state.subscriptions[org ? 'org' : 'user'].period_end.getTime();
        await Promise.all([
            applyBillingEvent(pool.asPool(), first, 'PAYMENT_CONFIRMED'),
            applyBillingEvent(pool.asPool(), second, 'PAYMENT_RECEIVED')
        ]);
        assert.equal(pool.grants, 2);
        assert.ok(pool.state.subscriptions[org ? 'org' : 'user'].period_end.getTime() - initialEnd > 55 * 86400000);
        const after = structuredClone(pool.state.subscriptions);
        await applyBillingEvent(pool.asPool(), first, 'PAYMENT_REFUNDED');
        await applyBillingEvent(pool.asPool(), first, 'PAYMENT_RECEIVED');
        assert.deepEqual(pool.state.subscriptions, after);
    });
    test(`${scope}: checkout and webhook share locks without overwriting paid access`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const first = payment(org), second = payment(org, 'p2', 'pro');
        await registerBillingPayment(pool.asPool(), first, future());
        await Promise.all([
            applyBillingEvent(pool.asPool(), first, 'PAYMENT_CONFIRMED'),
            registerBillingPayment(pool.asPool(), second, future())
        ]);
        assert.equal(pool.state.subscriptions[org ? 'org' : 'user'].asaas_payment_id, first.paymentId);
        assert.equal(pool.state.subscriptions[org ? 'org' : 'user'].status, 'active');
        if (org) assert.equal(pool.state.subscriptions.org.pending_payment_id, second.paymentId);
        await applyBillingEvent(pool.asPool(), second, 'PAYMENT_CONFIRMED');
        assert.equal(pool.state.subscriptions[org ? 'org' : 'user'].requested_tier, 'pro');
        assert.ok(pool.waits > 0);
    });
    test(`${scope}: older success/failure cannot change newer renewal or its plan`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const old = payment(org), newer = payment(org, 'p2', 'pro');
        await registerBillingPayment(pool.asPool(), old, future());
        await registerBillingPayment(pool.asPool(), newer, future());
        await applyBillingEvent(pool.asPool(), newer, 'PAYMENT_CONFIRMED');
        const current = structuredClone(pool.state.subscriptions);
        for (const event of ['PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_REFUNDED']) await applyBillingEvent(pool.asPool(), old, event);
        assert.deepEqual(pool.state.subscriptions, current);
        assert.equal(pool.state.payments.p1.state, 'superseded');
        assert.equal(pool.grants, 1);
        assert.ok(pool.state.subscriptions[org ? 'org' : 'user'].period_end.getTime() < future().getTime(), 'upgrade starts today, not old period end');
    });
    test(`${scope}: failed transaction rolls back entitlement and journal then retry succeeds`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const p = payment(org); await registerBillingPayment(pool.asPool(), p, future());
        const before = structuredClone(pool.state);
        pool.fail = "SET state='applied'";
        assert.equal((await dispatch(pool, p, 'PAYMENT_CONFIRMED')).statusCode, 500);
        assert.deepEqual(pool.state, before); assert.equal(pool.rollbacks, 1); assert.equal(pool.releases, 2);
        pool.fail = '';
        assert.equal((await dispatch(pool, p, 'PAYMENT_RECEIVED')).statusCode, 200);
        assert.equal(pool.state.payments.p1.state, 'applied');
    });
    test(`${scope}: delayed failures after applied payment are terminal no-ops`, async () => {
        const pool = new BillingAdapter(); seed(pool, org);
        const p = payment(org); await registerBillingPayment(pool.asPool(), p, future());
        await applyBillingEvent(pool.asPool(), p, 'PAYMENT_CONFIRMED');
        const after = structuredClone(pool.state);
        for (const event of ['PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_CANCELED', 'PAYMENT_REFUNDED']) await applyBillingEvent(pool.asPool(), p, event);
        assert.deepEqual(pool.state, after);
    });
}

test('legacy already active payment is imported without a second grant', async () => {
    const pool = new BillingAdapter(); seed(pool, true);
    const before = structuredClone(pool.state.subscriptions);
    await applyBillingEvent(pool.asPool(), payment(true, 'previous'), 'PAYMENT_CONFIRMED');
    assert.deepEqual(pool.state.subscriptions, before); assert.equal(pool.grants, 0);
    assert.equal(pool.state.payments.previous.state, 'applied');
});

test('overdue may recover; unknown and cross-scope references fail without mutations', async () => {
    const pool = new BillingAdapter(); const p = payment(false);
    await registerBillingPayment(pool.asPool(), p, future());
    await applyBillingEvent(pool.asPool(), p, 'PAYMENT_OVERDUE');
    assert.equal(pool.state.subscriptions.user.status, 'overdue');
    await applyBillingEvent(pool.asPool(), p, 'PAYMENT_RECEIVED');
    assert.equal(pool.state.subscriptions.user.status, 'active');
    const before = structuredClone(pool.state);
    await assert.rejects(applyBillingEvent(pool.asPool(), payment(false, 'unknown'), 'PAYMENT_RECEIVED'), /not registered/);
    await assert.rejects(applyBillingEvent(pool.asPool(), { ...p, orgId: 'other' }, 'PAYMENT_RECEIVED'), /does not match/);
    assert.deepEqual(pool.state, before);
});

test('webhook fails closed without journal schema and keeps pool alive', async () => {
    const pool = new BillingAdapter(); seed(pool, false); pool.missingSchema = true;
    const before = structuredClone(pool.state);
    assert.equal((await dispatch(pool, payment(false), 'PAYMENT_CONFIRMED')).statusCode, 500);
    assert.deepEqual(pool.state, before); assert.equal(pool.rollbacks, 1); assert.equal(pool.releases, 1);
    await pool.query('SELECT 1');
});

test('failed org checkout clears only its own pending fields, without revoking paid access', async () => {
    const pool = new BillingAdapter(); seed(pool, true);
    const first = payment(true), second = payment(true, 'p2');
    await registerBillingPayment(pool.asPool(), first, future());
    await registerBillingPayment(pool.asPool(), second, future());
    await applyBillingEvent(pool.asPool(), first, 'PAYMENT_DELETED');
    assert.equal(pool.state.subscriptions.org.pending_payment_id, 'p2');
    await applyBillingEvent(pool.asPool(), second, 'PAYMENT_CANCELED');
    assert.equal(pool.state.subscriptions.org.pending_payment_id, null);
    assert.equal(pool.state.subscriptions.org.status, 'active');
    const before = structuredClone(pool.state);
    await applyBillingEvent(pool.asPool(), second, 'PAYMENT_RECEIVED');
    assert.deepEqual(pool.state, before, 'canceled/refunded payments require reconciliation, not automatic reactivation');
});

test('org confirmation uses its payment tier and preserves another pending checkout', async () => {
    const pool = new BillingAdapter(); seed(pool, true);
    const first = payment(true, 'first', 'plus'), second = payment(true, 'second', 'pro');
    await registerBillingPayment(pool.asPool(), first, future());
    await registerBillingPayment(pool.asPool(), second, future());
    await applyBillingEvent(pool.asPool(), first, 'PAYMENT_CONFIRMED');
    assert.equal(pool.state.subscriptions.org.requested_tier, 'plus');
    assert.equal(pool.state.subscriptions.org.pending_payment_id, 'second');
    assert.equal(pool.state.organizations.org.plan_id, 'plus');
    assert.equal(pool.state.organizations.org.seats, 1);
});

test('checkout runs with fake provider, preserves active personal access and never closes pool', async () => {
    const pool = new BillingAdapter(); seed(pool, false);
    const g = globalThis as any;
    const previousPool = g.__gf_pg_pool, previousFetch = globalThis.fetch;
    const previousEnv = { JWT_SECRET: process.env.JWT_SECRET, ASAAS_API_KEY: process.env.ASAAS_API_KEY };
    process.env.JWT_SECRET = 'billing-test-secret-at-least-32-characters'; process.env.ASAAS_API_KEY = 'fake-key';
    g.__gf_pg_pool = pool;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return { json: async () => ({ id: 'checkout-payment', status: 'PENDING' }) }; }) as any;
    try {
        const token = await new SignJWT({ jti: 'test', email: 'test@example.invalid' }).setProtectedHeader({ alg: 'HS256' }).setSubject('user').setExpirationTime('1h').sign(new TextEncoder().encode(process.env.JWT_SECRET));
        const req = { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: { tier: 'starter', billingPeriod: 'monthly', method: 'creditCard', cpfCnpj: '00000000000' } };
        const before = structuredClone(pool.state.subscriptions);
        const res = response(); await checkout(req, res);
        assert.equal(res.statusCode, 200, res.body); assert.equal(calls, 2);
        assert.deepEqual(pool.state.subscriptions, before);
        assert.equal(pool.state.payments['checkout-payment'].state, 'pending');
        await pool.query('SELECT 1'); assert.equal(pool.ended, false);
        pool.missingSchema = true;
        const fail = response(); await checkout(req, fail);
        assert.equal(fail.statusCode, 500); assert.equal(calls, 2, 'missing schema must fail before provider calls');
        const unauthorized = response(); await checkout({ method: 'POST', headers: {} }, unauthorized);
        assert.equal(unauthorized.statusCode, 401); await pool.query('SELECT 1');
    } finally {
        g.__gf_pg_pool = previousPool; globalThis.fetch = previousFetch;
        for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
});
