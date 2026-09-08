import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { verifySession } from './_auth_shared';

let pool: Pool | null = null;

const getPool = () => {
  const g: any = globalThis as any;
  if (g.__gf_pg_pool) return g.__gf_pg_pool as Pool;
  if (pool) return pool;
  const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
  pool = new Pool({
    connectionString,
    max: 5,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connect', (client) => {
    client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
  });
  g.__gf_pg_pool = pool;
  return pool;
};

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
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;
    
    const db = getPool();
    try { await db.query('select 1'); } catch (e: any) { res.statusCode = 500; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: e?.message || 'db_unavailable' })); return; }
    
      // Ensure Core Auth Tables
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS public.auth_users (
            id uuid PRIMARY KEY,
            email text UNIQUE NOT NULL,
            password_hash text NOT NULL,
            is_admin boolean DEFAULT false,
            created_at timestamptz DEFAULT now()
          )
        `);
        const columnsAuth = [
          { name: 'cpf_cnpj', type: 'text' },
          { name: 'is_admin', type: 'boolean', default: 'false' },
          { name: 'email_verified', type: 'boolean', default: 'false' },
          { name: 'verification_code', type: 'text' },
          { name: 'reset_token', type: 'text' },
          { name: 'reset_token_expires', type: 'timestamptz' }
        ];
        for (const col of columnsAuth) {
          try {
            await db.query(`ALTER TABLE public.auth_users ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${col.default ? ` DEFAULT ${col.default}` : ''}`);
          } catch (err: any) {
            console.warn(`Bootstrap: Failed to add column ${col.name} to auth_users:`, err.message);
          }
        }
      } catch (e: any) {
        console.error('Bootstrap: auth_users creation/update failed:', e.message);
      }

      // Ensure Core Entity Tables
      try {
        await db.query('create table if not exists public.accounts (id uuid primary key, user_id uuid not null, name text not null, bank text, initial_balance numeric(14,2) default 0, created_at timestamptz default now())');
        await db.query('create table if not exists public.categories (id uuid primary key, user_id uuid not null, name text not null, type text, icon text, created_at timestamptz default now())');
        await db.query('create table if not exists public.transactions (id uuid primary key, user_id uuid not null, date date not null, account_id uuid not null, to_account_id uuid, transaction_type text not null, category text not null, description text, amount numeric(14,2) not null, payment_method text, cost_center_id uuid, created_at timestamptz default now())');
        await db.query('create table if not exists public.investments (id uuid primary key, user_id uuid not null, type text, ticker text, quantity numeric(14,8), purchase_price numeric(14,2), purchase_date date, created_at timestamptz default now())');
        await db.query('create table if not exists public.fixed_income_investments (id uuid primary key, user_id uuid not null, name text, issuer text, amount_invested numeric(14,2), yield_rate text, purchase_date date, maturity_date date, created_at timestamptz default now())');
        await db.query('create table if not exists public.goals (id uuid primary key, user_id uuid not null, name text, target_amount numeric(14,2), current_amount numeric(14,2), color text, created_at timestamptz default now())');
        await db.query('create table if not exists public.recurrences (id uuid primary key, user_id uuid not null, label text, amount numeric(14,2), category text, account_id uuid, payment_method text, day_of_month integer, business_day_rule text, cost_center_id uuid, active boolean default true, created_at timestamptz default now())');
        await db.query('create table if not exists public.cost_centers (id uuid primary key, user_id uuid not null, name text, created_at timestamptz default now())');
        await db.query('create table if not exists public.cost_center_permissions (id uuid primary key default gen_random_uuid(), user_id uuid not null, cost_center_id uuid not null, role text, created_at timestamptz default now())');
        await db.query('create table if not exists public.org_invites (id uuid primary key default gen_random_uuid(), org_id uuid not null, email text not null, role text not null, code text unique not null, expires_at timestamptz not null, created_at timestamptz default now())');
      } catch (e: any) {
        console.error('Bootstrap: entity tables creation failed:', e.message);
      }

      // Ensure Subscriptions
      try {
        await db.query(`create table if not exists public.user_subscriptions (
          id uuid primary key default gen_random_uuid(), 
          user_id uuid not null, 
          provider text, 
          status text, 
          asaas_payment_id text,
          asaas_subscription_id text,
          period_start timestamptz, 
          period_end timestamptz, 
          created_at timestamptz default now()
        )`);
        await db.query(`create table if not exists public.org_subscriptions (
          org_id uuid primary key, 
          provider text, 
          status text, 
          asaas_payment_id text,
          asaas_subscription_id text,
          period_start timestamptz, 
          period_end timestamptz, 
          created_at timestamptz default now()
        )`);

        const subCols = [
          'created_at timestamptz default now()',
          'asaas_payment_id text',
          'asaas_subscription_id text',
          'billing_period text',
          'requested_tier text'
        ];
        for (const colDef of subCols) {
          const colName = colDef.split(' ')[0];
          try { await db.query(`alter table public.user_subscriptions add column if not exists ${colDef}`); } catch {}
          try { await db.query(`alter table public.org_subscriptions add column if not exists ${colDef}`); } catch {}
        }
        try { await db.query('alter table public.org_subscriptions add column if not exists pending_payment_id text'); } catch {}
        try { await db.query('alter table public.org_subscriptions add column if not exists pending_billing_period text'); } catch {}
        try { await db.query('alter table public.org_subscriptions add column if not exists pending_requested_tier text'); } catch {}
        try { await db.query('alter table public.org_subscriptions add column if not exists pending_period_start timestamptz'); } catch {}
        try { await db.query('alter table public.org_subscriptions add column if not exists pending_period_end timestamptz'); } catch {}
      } catch (e: any) {
        console.error('Bootstrap: subscriptions tables sync failed:', e.message);
      }

      // Ensure Table Updates (Entity Extensions)
      try {
        try { await db.query('alter table public.transactions add column if not exists is_business_revenue boolean default false'); } catch {}
        try { await db.query('alter table public.transactions add column if not exists is_business_expense boolean default false'); } catch {}
        try { await db.query('alter table public.transactions add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.accounts add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.categories add column if not exists mei_category text'); } catch {}
        try { await db.query('alter table public.categories add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.investments add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.fixed_income_investments add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.goals add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.recurrences add column if not exists org_id uuid'); } catch {}
        try { await db.query('alter table public.cost_centers add column if not exists org_id uuid'); } catch {}
      } catch (e: any) {
         console.warn('Bootstrap: general entity column update warning:', e.message);
      }
      
      // Ensure Profiles & Organizations
      try {
        await db.query(`create table if not exists public.profiles (user_id uuid primary key, org_id uuid, plan_id uuid, is_admin boolean default false, preferences jsonb default '{}', created_at timestamptz default now())`);
        const profileCols = [
          'is_admin boolean default false',
          'preferences jsonb default \'{}\'',
          'full_name text',
          'document text',
          'business_profile text',
          'asaas_customer_id text',
          'created_at timestamptz default now()'
        ];
        for (const colDef of profileCols) {
          try { await db.query(`alter table public.profiles add column if not exists ${colDef}`); } catch {}
        }
        
        await db.query(`create table if not exists public.organizations (id uuid primary key, name text, seats int, plan_id uuid, created_at timestamptz default now())`);
        await db.query(`create table if not exists public.plans (id uuid primary key, name text, tier text, created_at timestamptz default now())`);
        try { await db.query("update public.plans set tier='pro' where lower(tier)='corporate'"); } catch {}
        try {
          await db.query('alter table public.plans drop constraint if exists plans_tier_check');
          await db.query("alter table public.plans add constraint plans_tier_check check (tier in ('starter','plus','pro'))");
        } catch {}
      } catch (e: any) {
        console.error('Bootstrap: profiles/orgs sync failed:', e.message);
      }


    // 1. Fetch Profile & Org Context First
    const profileRes = await db.query('select org_id, plan_id, is_admin, preferences, business_profile from public.profiles where user_id=$1', [userId]);
    const profile = profileRes.rows[0] || null;
    let orgId = profile?.org_id;
    let userOrgId: string | null = profile?.org_id || null;
    const viewMode = req.headers['x-view-mode'];
    if (userOrgId && viewMode === 'organization') {
        orgId = userOrgId;
    } else {
        orgId = null;
    }

    let role = null;
    let permissions: any[] = [];
    let allowedCCs: string[] = [];

    if (userOrgId) {
       role = 'owner'; // Default for org context if not found? Or should check members?
       const memberRes = await db.query('select role from public.org_members where org_id=$1 and user_id=$2', [userOrgId, userId]);
       if (memberRes.rows[0]) role = memberRes.rows[0].role;
       
       // Auto-Admin Logic: Single user orgs
       let autoAdmin = false;
       if (role === 'member') {
           const countRes = await db.query('select count(*) as count from public.org_members where org_id=$1', [userOrgId]);
           const memberCount = parseInt(countRes.rows[0]?.count || '0');
           if (memberCount === 1) autoAdmin = true;
       }

       if (autoAdmin) {
           role = 'admin';
       }

       if (role === 'member') {
          const permsRes = await db.query('select cost_center_id, role from public.cost_center_permissions where user_id=$1', [userId]);
          permissions = permsRes.rows;
          allowedCCs = permissions.map(p => p.cost_center_id);
       }
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
        // Investments/Goals currently don't have org_id, so assume personal
        investmentFilter = 'user_id=$1'; 
    }

    // 3. Permission Filters (for Members)
    let transactionCCFilter = '';
    let costCenterFilter = ''; // For the list of Cost Centers
    
    if (orgId && role === 'member') {
        // Filter Transactions
        if (allowedCCs.length > 0) {
            const ccList = allowedCCs.map(id => `'${id}'`).join(',');
            // Show transactions with Allowed CC OR No CC (assuming No CC is general/visible)
            transactionCCFilter = ` AND (cost_center_id IN (${ccList}) OR cost_center_id IS NULL)`;
            
            // Filter Cost Centers List
            costCenterFilter = ` AND id IN (${ccList})`;
        } else {
            // No allowed CCs? Only show No-CC transactions?
            transactionCCFilter = ` AND cost_center_id IS NULL`;
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
      // 2: Transactions
      db.query(`select id,date,account_id,to_account_id,
        CASE 
            WHEN transaction_type IN ('income', 'Receita') THEN 'Entrada'
            WHEN transaction_type IN ('expense', 'Despesa') THEN 'Saída'
            ELSE transaction_type 
        END as transaction_type,
        category,description,amount,payment_method,cost_center_id,is_business_revenue,is_business_expense from public.transactions where ${transactionFilter} ${transactionCCFilter} order by date desc, created_at desc limit 100`, mainParams),
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
      // 9: Profile preferences (for isMei etc)
      db.query('select preferences from public.profiles where user_id=$1', [userId]),
      // 10: Monthly Summary
      db.query(`
        select transaction_type, sum(CAST(amount as numeric)) as total 
        from public.transactions 
        where date >= to_date(to_char(current_date, 'YYYY-MM') || '-01', 'YYYY-MM-DD')
        and ${transactionFilter}
        ${transactionCCFilter}
        group by transaction_type`, mainParams)
    ]);

    // 3.5 Calculate Monthly Summary & Context
    let monthIncome = 0;
    let monthExpense = 0;
    results[10].rows.forEach((row: any) => {
        const type = String(row.transaction_type || '').toLowerCase();
        const val = Number(row.total) || 0;
        if (['entrada', 'income', 'receita'].includes(type)) monthIncome += val;
        if (['saída', 'saida', 'expense', 'despesa'].includes(type)) monthExpense += val;
    });
    const monthly_summary = { income: monthIncome, expense: monthExpense };

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

    // 4. Enhanced Subscription & Status Logic
    const now = new Date();
    const subRows = results[8].rows;
    const subscription = subRows[0] || null;
    const periodEnd = subscription?.period_end ? new Date(subscription.period_end) : null;
    const isTrial = subscription?.billing_period === 'trial';
    const isExpired = !!(periodEnd && periodEnd < now);
    const graceEnd = periodEnd ? new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    const isInsideGrace = !!(isExpired && graceEnd && graceEnd > now);
    const isTotalBlocked = !!(isExpired && !isInsideGrace);
    
    const gracePeriodDays = isInsideGrace ? Math.ceil((graceEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : 0;

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
            limits.storageLimit = 5 * 1024 * 1024 * 1024; // 5GB for Trial
        }
        return limits;
    })();

    // 7. Usage & Quota Calculation
    const monthKeyRes = await db.query(`select to_char(current_date, 'YYYY-MM') as yyyymm`);
    const yyyymm = String(monthKeyRes.rows[0]?.yyyymm || '');
    
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
            meiMonitoring: isMeiProfile, // Only when user explicitly activated MEI
            chatAi: isPlus || isTrial,
            corporateManagement: (isPro || isTrial) && (role === 'admin' || role === 'owner')
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
        gracePeriodDays
    } : null;

    const finalProfile = profile ? { ...profile, business_profile: effectiveProfile } : null;

    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    try { res.setHeader('cache-control','public, max-age=15, stale-while-revalidate=60'); } catch {}
    res.end(JSON.stringify({ 
      accounts: results[0].rows, 
      categories: results[1].rows, 
      transactions: results[2].rows, 
      investments: results[3].rows, 
      fixed_income_investments: results[4].rows, 
      goals: results[5].rows, 
      recurrences: results[6].rows, 
      cost_centers: results[7].rows, 
      profile: finalProfile, 
      organization, 
      plan, 
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
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e?.message || 'error' }));
  }
}
