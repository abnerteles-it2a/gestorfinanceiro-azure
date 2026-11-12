// Apply through the deployment migration, never from a request handler.
export const billingPaymentsMigration = `
ALTER TABLE public.user_subscriptions
    ADD COLUMN IF NOT EXISTS asaas_payment_id text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS billing_period text,
    ADD COLUMN IF NOT EXISTS requested_tier text;
ALTER TABLE public.org_subscriptions
    ADD COLUMN IF NOT EXISTS asaas_payment_id text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS billing_period text,
    ADD COLUMN IF NOT EXISTS requested_tier text,
    ADD COLUMN IF NOT EXISTS pending_payment_id text,
    ADD COLUMN IF NOT EXISTS pending_billing_period text,
    ADD COLUMN IF NOT EXISTS pending_requested_tier text,
    ADD COLUMN IF NOT EXISTS pending_period_start timestamptz,
    ADD COLUMN IF NOT EXISTS pending_period_end timestamptz;
CREATE TABLE IF NOT EXISTS public.billing_payments (
    payment_id text PRIMARY KEY,
    sequence_id bigserial UNIQUE NOT NULL,
    scope_key text NOT NULL,
    user_id uuid NOT NULL,
    org_id uuid,
    tier text NOT NULL CHECK (tier IN ('starter', 'plus', 'pro')),
    billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
    state text NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'overdue', 'failed', 'applied', 'superseded')),
    created_at timestamptz NOT NULL DEFAULT now(),
    applied_at timestamptz
);
CREATE INDEX IF NOT EXISTS billing_payments_scope_sequence_idx
    ON public.billing_payments (scope_key, sequence_id);
`;
