import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { verifySession } from './_auth_shared';
import { getPool } from './_db';
import { financialSnapshot, financialTransactions, listTransactions, resolveFinancialScope } from './_financial';

let schemaEnsurePromise: Promise<void> | null = null;

const BOOTSTRAP_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS public.auth_users (
    id uuid PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    is_admin boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.auth_users
    ADD COLUMN IF NOT EXISTS cpf_cnpj text,
    ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verified boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS verification_code text,
    ADD COLUMN IF NOT EXISTS reset_token text,
    ADD COLUMN IF NOT EXISTS reset_token_expires timestamptz;

  CREATE TABLE IF NOT EXISTS public.investment_operations (
    scope_type text NOT NULL CHECK (scope_type IN ('personal','org')),
    scope_id uuid NOT NULL,
    operation_id uuid NOT NULL,
    user_id uuid NOT NULL,
    request_payload jsonb NOT NULL,
    result_payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (scope_type, scope_id, operation_id)
  );
  CREATE TABLE IF NOT EXISTS public.accounts (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL, bank text, initial_balance numeric(14,2) DEFAULT 0, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.categories (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text NOT NULL, type text, icon text, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.transactions (id uuid PRIMARY KEY, user_id uuid NOT NULL, date date NOT NULL, account_id uuid NOT NULL, to_account_id uuid, transaction_type text NOT NULL, category text NOT NULL, description text, amount numeric(14,2) NOT NULL, payment_method text, cost_center_id uuid, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.investments (id uuid PRIMARY KEY, user_id uuid NOT NULL, type text, ticker text, quantity numeric(14,8), purchase_price numeric(14,2), purchase_date date, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.fixed_income_investments (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text, issuer text, amount_invested numeric(14,2), yield_rate text, purchase_date date, maturity_date date, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.goals (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text, target_amount numeric(14,2), current_amount numeric(14,2), color text, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.recurrences (id uuid PRIMARY KEY, user_id uuid NOT NULL, label text, amount numeric(14,2), category text, account_id uuid, payment_method text, day_of_month integer, business_day_rule text, cost_center_id uuid, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.cost_centers (id uuid PRIMARY KEY, user_id uuid NOT NULL, name text, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.cost_center_permissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, cost_center_id uuid NOT NULL, role text, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.org_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, email text NOT NULL, role text NOT NULL, code text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, created_at timestamptz DEFAULT now());

  CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    provider text,
    status text,
    asaas_payment_id text,
    asaas_subscription_id text,
    period_start timestamptz,
    period_end timestamptz,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS public.org_subscriptions (
    org_id uuid PRIMARY KEY,
    provider text,
    status text,
    asaas_payment_id text,
    asaas_subscription_id text,
    period_start timestamptz,
    period_end timestamptz,
    created_at timestamptz DEFAULT now()
  );
  ALTER TABLE public.user_subscriptions
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS asaas_payment_id text,
    ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
    ADD COLUMN IF NOT EXISTS billing_period text,
    ADD COLUMN IF NOT EXISTS requested_tier text;
  ALTER TABLE public.org_subscriptions
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS asaas_payment_id text,
    ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
    ADD COLUMN IF NOT EXISTS billing_period text,
    ADD COLUMN IF NOT EXISTS requested_tier text,
    ADD COLUMN IF NOT EXISTS pending_payment_id text,
    ADD COLUMN IF NOT EXISTS pending_billing_period text,
    ADD COLUMN IF NOT EXISTS pending_requested_tier text,
    ADD COLUMN IF NOT EXISTS pending_period_start timestamptz,
    ADD COLUMN IF NOT EXISTS pending_period_end timestamptz;

  ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS is_business_revenue boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_business_expense boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS mei_category text,
    ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.fixed_income_investments ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.recurrences ADD COLUMN IF NOT EXISTS org_id uuid;
  ALTER TABLE public.cost_centers ADD COLUMN IF NOT EXISTS org_id uuid;

  CREATE TABLE IF NOT EXISTS public.profiles (user_id uuid PRIMARY KEY, org_id uuid, plan_id uuid, is_admin boolean DEFAULT false, preferences jsonb DEFAULT '{}', created_at timestamptz DEFAULT now());
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false,
    ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS full_name text,
    ADD COLUMN IF NOT EXISTS document text,
    ADD COLUMN IF NOT EXISTS business_profile text,
    ADD COLUMN IF NOT EXISTS asaas_customer_id text,
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

  CREATE TABLE IF NOT EXISTS public.obligation_settlements (operation_id uuid PRIMARY KEY, obligation_id uuid NOT NULL, kind text NOT NULL CHECK (kind IN ('payable','receivable')), principal_amount numeric(14,2) NOT NULL, cash_amount numeric(14,2) NOT NULL, account_id uuid NOT NULL, transaction_id uuid NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.obligation_creation_operations (scope_type text NOT NULL CHECK (scope_type IN ('personal','org')), scope_id uuid NOT NULL, operation_id uuid NOT NULL, user_id uuid NOT NULL, request_payload jsonb NOT NULL, result_payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (scope_type, scope_id, operation_id));
  CREATE TABLE IF NOT EXISTS public.billing_payments (payment_id text PRIMARY KEY, sequence_id bigserial UNIQUE NOT NULL, scope_key text NOT NULL, user_id uuid NOT NULL, org_id uuid, tier text NOT NULL CHECK (tier IN ('starter', 'plus', 'pro')), billing_period text NOT NULL CHECK (billing_period IN ('monthly', 'yearly')), state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'overdue', 'failed', 'applied', 'superseded')), created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz);
  CREATE INDEX IF NOT EXISTS billing_payments_scope_sequence_idx ON public.billing_payments (scope_key, sequence_id);

  ALTER TABLE public.payables
    ADD COLUMN IF NOT EXISTS paid_amount numeric(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transaction_id uuid,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS is_business_revenue boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_business_expense boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS issue_date date,
    ADD COLUMN IF NOT EXISTS supplier text;
  ALTER TABLE public.receivables
    ADD COLUMN IF NOT EXISTS received_amount numeric(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS transaction_id uuid,
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
    ADD COLUMN IF NOT EXISTS is_business_revenue boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_business_expense boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS issue_date date,
    ADD COLUMN IF NOT EXISTS customer text;

  CREATE TABLE IF NOT EXISTS public.organizations (id uuid PRIMARY KEY, name text, seats int, plan_id uuid, created_at timestamptz DEFAULT now());
  CREATE TABLE IF NOT EXISTS public.plans (id uuid PRIMARY KEY, name text, tier text, created_at timestamptz DEFAULT now());

  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON public.transactions(user_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_tx_acc ON public.transactions(account_id);
  CREATE INDEX IF NOT EXISTS idx_tx_to_acc ON public.transactions(to_account_id);
  CREATE INDEX IF NOT EXISTS idx_tx_org_date ON public.transactions(org_id, date DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_jti ON public.auth_sessions(user_id, jti);
  CREATE INDEX IF NOT EXISTS idx_payables_user_status ON public.payables(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_receivables_user_status ON public.receivables(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_usage_ledger ON public.usage_tx_ledger(scope_type, scope_id, yyyymm);
`;

export async function ensureSchemaOnce(db: Pool) {
  if (schemaEnsurePromise) return schemaEnsurePromise;
  schemaEnsurePromise = (async () => {
    try {
      await db.query(BOOTSTRAP_SCHEMA_SQL);
    } catch (err: any) {
      console.warn('Bootstrap: ensureSchemaOnce non-fatal warning:', err?.message);
    }
  })();
  return schemaEnsurePromise;
}

const isNoDb = (): boolean => !process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL;

export default async function handler(req: any, res: any) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const includeEnv = (url.searchParams.get('env') === '1') || (String(process.env.ENABLE_ENV_CHECK || '') === '1');

    // Check for NoDB mode first
    if (isNoDb()) {
       res.statusCode = 200;
       res.setHeader('content-type','application/json');
       res.end(JSON.stringify({ accounts: [], categories: [], transactions: [], investments: [], fixed_income_investments: [], goals: [], recurrences: [], cost_centers: [], profile: null, organization: null, plan: null, subscription: null }));
       return;
    }

    // 2. Auth Check (Enforcing Single-Session Compliance)
    const db = getPool();
    const result = await verifySession(req, res, db);
    if (!result) return;
    const { userId } = result;

    // Ensure Core Schema once per process lifecycle (single batched round-trip)
    await ensureSchemaOnce(db);

    // 1. Fetch Profile & Financial Scope in parallel
    const [profileRes, financialScope] = await Promise.all([
      db.query('select org_id, plan_id, is_admin, preferences, business_profile from public.profiles where user_id=$1', [userId]),
      resolveFinancialScope(db, userId, req.headers['x-view-mode']),
    ]);
    const profile = profileRes.rows[0] || null;
    const orgId = financialScope.orgId;
    const userOrgId: string | null = profile?.org_id || null;
    let role = financialScope.role;
    let permissions: any[] = [];
    const allowedCCs: string[] = financialScope.allowedCCs || [];

    if (orgId && role === 'member') {
      permissions = (await db.query('select cost_center_id, role from public.cost_center_permissions where org_id=$1 and user_id=$2',[orgId,userId])).rows;
    }

    // 2. Define Scope Filters
    // We strictly separate Personal vs Organization data.
    let accountsFilter = '';
    let commonFilter = ''; // Categories, Recurrences, Cost Centers
    let transactionFilter = '';
    let investmentFilter = ''; // Investments, Goals

    if (orgId) {
        // ORG VIEW: Strict separation
        // Use literal value to avoid parameter mapping issues in complex queries,
        // but ensure it's safe (orgId comes from trusted payload/db).
        const orgFilter = `org_id = '${orgId}'`;
        accountsFilter = orgFilter;
        commonFilter = orgFilter;
        transactionFilter = orgFilter;
        investmentFilter = orgFilter;
    } else {
        // PERSONAL VIEW: Private/Single (includes historical data)
        const personalFilter = 'user_id=$1 and org_id is null';
        accountsFilter = personalFilter;
        commonFilter = personalFilter;
        transactionFilter = personalFilter;
        // Investments/Goals isolated to personal scope
        investmentFilter = personalFilter;
    }

    // 3. Permission Filters (for Members)
    let transactionCCFilter = '';
    let costCenterFilter = ''; // For the list of Cost Centers

    if (orgId && role === 'member') {
        // Filter Transactions
        if (allowedCCs.length > 0) {
            const ccList = allowedCCs.map(id => `'${id}'`).join(',');
            // Show transactions with Allowed CC OR No CC (assuming No CC is general/visible)
            transactionCCFilter = ` AND cost_center_id IN (${ccList})`;

            // Filter Cost Centers List
            costCenterFilter = ` AND id IN (${ccList})`;
        } else {
            // No allowed CCs? Only show No-CC transactions?
            transactionCCFilter = ` AND 1=0`;
            // No Cost Centers visible
            costCenterFilter = ` AND 1=0`;
        }
    }

    const mainParams = orgId ? [] : [userId];
    const invParams = orgId ? [] : [userId];
    // For subscription: org users ALWAYS read from org_subscriptions (source of truth),
    // regardless of view mode (personal or org). This prevents user_subscriptions trial
    // from overriding a confirmed org payment.
    const subsQuery = userOrgId
        ? { sql: 'select provider,status,period_start,period_end,billing_period from public.org_subscriptions where org_id=$1 limit 1', params: [userOrgId] }
        : {
            sql: `
              select provider,status,period_start,period_end,billing_period
              from public.user_subscriptions
              where user_id=$1
              order by
                case when lower(status)='active' and (period_end is null or period_end >= now()) then 0 else 1 end,
                coalesce(period_end, 'infinity'::timestamptz) desc nulls last,
                coalesce(period_start, period_end) desc nulls last,
                created_at desc
              limit 1
            `,
            params: [userId]
        };

    const results = await Promise.all([
      // 0: Accounts
      db.query(`
        SELECT
            a.id, a.name, a.bank, a.initial_balance,
            (
                SELECT COALESCE(SUM(CAST(amount AS numeric)), 0)
                FROM public.transactions
                WHERE account_id = a.id AND LOWER(transaction_type) IN ('entrada', 'income', 'receita')
                ${transactionCCFilter}
            ) as total_in,
            (
                SELECT COALESCE(SUM(CAST(amount AS numeric)), 0)
                FROM public.transactions
                WHERE to_account_id = a.id AND LOWER(transaction_type) IN ('transferência', 'transferencia', 'transfer')
                ${transactionCCFilter}
            ) as total_transfer_in,
            (
                SELECT COALESCE(SUM(CAST(amount AS numeric)), 0)
                FROM public.transactions
                WHERE account_id = a.id AND LOWER(transaction_type) IN ('saída', 'saida', 'expense', 'despesa')
                ${transactionCCFilter}
            ) as total_out,
            (
                SELECT COALESCE(SUM(CAST(amount AS numeric)), 0)
                FROM public.transactions
                WHERE account_id = a.id AND LOWER(transaction_type) IN ('transferência', 'transferencia', 'transfer')
                ${transactionCCFilter}
            ) as total_transfer_out
        FROM public.accounts a
        WHERE ${accountsFilter}
        ORDER BY a.name ASC
      `, mainParams),
      // 1: Categories
      db.query(`select id,name,type,icon,mei_category from public.categories where ${commonFilter} order by name asc`, mainParams),
      // 2: Cursor page; aggregates below are never computed from this page.
      listTransactions(db,financialScope,{limit:100}),
      // 3: Investments
      db.query(`select id,type,ticker,quantity,purchase_price,purchase_date from public.investments where ${investmentFilter} order by created_at desc`, invParams),
      // 4: Fixed Income
      db.query(`select id,name,issuer,amount_invested,yield_rate,purchase_date,maturity_date from public.fixed_income_investments where ${investmentFilter} order by created_at desc`, invParams),
      // 5: Goals
      db.query(`select id,name,target_amount,current_amount,color from public.goals where ${investmentFilter} order by created_at desc`, invParams),
      // 6: Recurrences
      db.query(`select id,label,amount,category,account_id,payment_method,day_of_month,business_day_rule,cost_center_id,active from public.recurrences where ${commonFilter}`, mainParams),
      // 7: Cost Centers
      db.query(`select id,name,org_id from public.cost_centers where ${commonFilter} ${costCenterFilter}`, mainParams),
      // 8: Subscription
      db.query(subsQuery.sql, subsQuery.params),
      // 9: Snapshot (period & account balances)
      financialSnapshot(db, financialScope),
      // 10: Complete authorized ledger for reports/MEI/analytics, separate from the UI page.
      financialTransactions(db, financialScope)
    ]);

    const snapshot = results[9] as any;
    const monthly_summary = { income: snapshot.period.income, expense: snapshot.period.expense };

    let organization: any = null;
    let plan: any = null;
    try {
      if (profile?.org_id) {
        const ro = await db.query('select id,name,seats,plan_id from public.organizations where id=$1', [profile.org_id]);
        organization = ro.rows[0] || null;
        if (organization?.plan_id) {
          const rp = await db.query('select id,name,tier from public.plans where id=$1', [organization.plan_id]);
          plan = rp.rows[0] || null;
        }
      } else if (profile?.plan_id) {
        const rp = await db.query('select id,name,tier from public.plans where id=$1', [profile.plan_id]);
        plan = rp.rows[0] || null;
      }

      if (plan) {
          const rawName = String(plan.name || '').toLowerCase();
          const rawTier = String(plan.tier || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (rawTier === 'pro' || rawTier === 'pró' || rawName === 'pro' || rawName === 'pró') {
              plan.tier = 'pro';
          } else if (rawTier === 'plus' || rawName === 'plus') {
              plan.tier = 'plus';
          } else {
              plan.tier = 'starter';
          }
      }

      // Auto-correct seats to match plan tier (prevents UI showing wrong seat count)
      if (organization && plan?.tier) {
          const seatsByTier: Record<string, number> = { starter: 1, plus: 1, pro: 2 };
          const correctSeats = seatsByTier[plan.tier] ?? 1;
          if (Number(organization.seats || 0) !== correctSeats) {
              organization.seats = correctSeats;
              try {
                  await db.query('UPDATE public.organizations SET seats=$1 WHERE id=$2', [correctSeats, organization.id]);
              } catch {}
          }
      }

      // Count active members occupying seats
      if (organization?.id) {
          const membersCountRes = await db.query('SELECT count(*)::int as count FROM public.org_members WHERE org_id=$1', [organization.id]);
          organization.usedSeats = Number(membersCountRes.rows[0]?.count || 0);
      }
    } catch {}

    const scopeType = orgId ? 'org' : 'user';
    const scopeId = String(orgId || userId);

    let subRows = results[8].rows;
    let subscription = subRows[0] || null;

    // Fallback: if org user has no org subscription, check user_subscriptions
    if (!subscription && userOrgId) {
        try {
            const userSub = await db.query(
                `select provider,status,period_start,period_end,billing_period
                 from public.user_subscriptions
                 where user_id=$1
                 order by
                   case when lower(status)='active' and (period_end is null or period_end >= now()) then 0 else 1 end,
                   coalesce(period_end, 'infinity'::timestamptz) desc nulls last,
                   coalesce(period_start, period_end) desc nulls last,
                   created_at desc
                 limit 1`,
                [userId]
            );
            if (userSub.rows[0]) {
                subscription = userSub.rows[0];
            }
        } catch {}
    }

    // Auto-create 14-day trial if no subscription exists at all
    if (!subscription) {
        const trialDays = 14;
        const endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
        try {
            if (userOrgId) {
                await db.query(
                    "insert into public.org_subscriptions(org_id, provider, status, period_start, period_end, billing_period) values($1,'internal','active', now(), $2, 'trial') on conflict (org_id) do nothing",
                    [userOrgId, endDate]
                );
                subscription = {
                    provider: 'internal',
                    status: 'active',
                    period_start: new Date(),
                    period_end: endDate,
                    billing_period: 'trial'
                };
            } else {
                await db.query(
                    "insert into public.user_subscriptions(user_id, provider, status, period_start, period_end, billing_period) values($1,'internal','active', now(), $2, 'trial')",
                    [userId, endDate]
                );
                subscription = {
                    provider: 'internal',
                    status: 'active',
                    period_start: new Date(),
                    period_end: endDate,
                    billing_period: 'trial'
                };
            }
        } catch (e: any) {
            console.warn('Bootstrap auto trial creation warning:', e.message);
        }
    }

    // 4. Enhanced Subscription & Status Logic
    const now = new Date();
    const periodEnd = subscription?.period_end ? new Date(subscription.period_end) : null;
    const isTrial = subscription?.billing_period === 'trial';
    const isExpired = !!(periodEnd && periodEnd < now);
    const graceEnd = periodEnd ? new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    const isInsideGrace = !!(isExpired && graceEnd && graceEnd > now);
    const isTotalBlocked = !!(isExpired && !isInsideGrace);

    const gracePeriodDays = isInsideGrace ? Math.ceil((graceEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 0;
    const trialDaysRemaining = (isTrial && periodEnd && !isExpired)
        ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

    // 5. Plan & Profile Consistency Mapping
    let effectiveTier = String(plan?.tier || 'starter').toLowerCase();
    let effectiveProfile = String(profile?.business_profile || (profile?.preferences?.businessProfile) || 'pf').toLowerCase();

    // PROFILE RULES BY TIER
    // Starter: always PF (no MEI, no org)
    // Plus: user chooses PF or MEI via Settings toggle — don't force
    // Pro: multi-profile (pessoal + corporativo), never MEI
    if (effectiveTier === 'starter') {
        effectiveProfile = 'pf';
    } else if (effectiveTier === 'pro') {
        if (effectiveProfile === 'mei') effectiveProfile = 'empresa';
    }

    // 6. Force PRO capabilities during Trial, but keep profile as PF for safety
    let forcedTier = effectiveTier;
    if (isTrial && !isExpired) {
        forcedTier = 'pro';
        effectiveProfile = 'pf'; // Force starting in PF for all Trial users
    }

    const planLimits = (() => {
        const t = forcedTier;
        const map: Record<string, any> = {
            starter: { accounts: 2, costCenters: 1, transactionsPerMonth: 100, users: 1, storageLimit: 100 * 1024 * 1024 },
            plus: { accounts: 10, costCenters: 5, transactionsPerMonth: 500, users: 1, storageLimit: 1024 * 1024 * 1024 },
            pro: { accounts: 100, costCenters: 50, transactionsPerMonth: 3000, users: 2, storageLimit: 10 * 1024 * 1024 * 1024 }
        };
        const limits = { ...(map[t] || map.starter) };
        if (isTrial) {
            limits.storageLimit = 10 * 1024 * 1024 * 1024; // Full 10GB for Trial Pro
        }
        return limits;
    })();

    // 7. Usage & Quota Calculation
    const nowUtc = new Date();
    const yyyymm = `${nowUtc.getFullYear()}-${String(nowUtc.getMonth() + 1).padStart(2, '0')}`;

    const usageQueries = await Promise.all([
        db.query(`
            select count(*)::int as tx_used
            from public.usage_tx_ledger
            where (
                (scope_type='user' and scope_id=$1)
                OR (scope_type='org' and scope_id=$2)
            ) and yyyymm=$3
        `, [userId, userOrgId || '00000000-0000-0000-0000-000000000000', yyyymm]),
        db.query(`select coalesce(sum(size), 0)::bigint as storage_used from public.fiscal_documents where ${orgId ? 'org_id=$1' : 'user_id=$1'}`, [scopeId])
    ]);

    const usage = {
        yyyymm,
        transactionsUsed: Number(usageQueries[0].rows[0]?.tx_used || 0),
        transactionsLimit: planLimits.transactionsPerMonth,
        storageUsed: Number(usageQueries[1].rows[0]?.storage_used || 0),
        storageLimit: planLimits.storageLimit
    };

    const isOverQuota = usage.storageUsed > planLimits.storageLimit;

    // 8. Status Definition (Now safe to use isOverQuota)
    const status = {
        tier: forcedTier,
        isTrial,
        isExpired,
        isInsideGrace,
        isTotalBlocked,
        isOverQuota,
        gracePeriodDays,
        trialDaysRemaining,
        viewMode: 'personal' // Always start Pessoal (Personal) by default, user can switch manually thereafter
    };

    // 9. Module Entitlements
    const modules = (() => {
        const isPro = forcedTier === 'pro';
        const isMeiProfile = effectiveProfile === 'mei';
        const isPlus = forcedTier === 'plus' || isPro;

        return {
            investments: isPlus || isTrial,
            financeAccounting: isPlus || isMeiProfile || isTrial,
            docsVault: true,
            reports: true,
            meiMonitoring: isMeiProfile || isTrial,
            chatAi: isPlus || isTrial,
            corporateManagement: (isPro || isTrial) && (role === 'admin' || role === 'owner' || !userOrgId)
        };
    })();

    const entitlements = {
        segment: effectiveProfile,
        scope: { type: scopeType, id: scopeId },
        limits: planLimits,
        modules
    };

    const capabilities = {
        canAccessInvestments: !!modules.investments,
        canAccessFinance: !!modules.financeAccounting,
        canAccessDocs: !!modules.docsVault,
        canAccessReports: !!modules.reports
    };

    // Enriched Subscription Data
    const enrichedSubscription = subscription ? {
        ...subscription,
        isTrial,
        isExpired,
        isInsideGrace,
        isTotalBlocked,
        isOverQuota,
        gracePeriodDays,
        trialDaysRemaining
    } : null;

    const finalPlan = {
        ...(plan || {}),
        tier: forcedTier,
        name: isTrial ? 'Trial Pro' : (plan?.name || (forcedTier === 'pro' ? 'Pro' : forcedTier === 'plus' ? 'Plus' : 'Starter'))
    };

    const finalProfile = profile ? { ...profile, business_profile: effectiveProfile } : null;

    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    try { res.setHeader('cache-control','private, no-store'); } catch {}
    res.end(JSON.stringify({
      accounts: results[0].rows,
      categories: results[1].rows,
      transactions: results[2].rows,
      financial_transactions: results[10].rows,
      transactions_meta: {hasMore:(results[2] as any).hasMore,nextCursor:(results[2] as any).nextCursor},
      financial_snapshot: snapshot,
      investments: results[3].rows,
      fixed_income_investments: results[4].rows,
      goals: results[5].rows,
      recurrences: results[6].rows,
      cost_centers: results[7].rows,
      profile: finalProfile,
      organization,
      plan: finalPlan,
      subscription: enrichedSubscription,
      monthly_summary,
      org_role: role,
      permissions,
      capabilities,
      entitlements,
      usage,
      status,
      business_profile: effectiveProfile
    }));

  } catch (e: any) {
    console.error('Bootstrap Critical Error:', e);
    res.statusCode = e?.message === 'organization_access_denied' ? 403 : 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
