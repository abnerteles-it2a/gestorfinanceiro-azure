import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import crypto from 'crypto';
import { formatCurrency } from '../utils/formatters';
import { verifySession } from './_auth_shared';
import { getApplicableCompetences } from '../utils/meiObligationRules';
import { calculateMeiMonthlyClosing } from '../utils/meiMonthlyClosing';

import { getPool } from './_db';

const isNoDb = (): boolean => !process.env.NEON_DATABASE_URL && !process.env.DATABASE_URL;

export default async function handler(req: any, res: any) {
  try {
    // 1. Parse Body
    const input = req.body || {};
    const type = String(input.type || '');
    const data: any = input.data || {};

    // 2. Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return; // verifySession handles response on error
    const { userId, payload } = result;
    const jti = String(payload?.jti || '');

    // 3. Database Operations
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    if (isNoDb()) {
       if (type.endsWith('_list')) {
           res.statusCode = 200;
           res.setHeader('content-type','application/json');
           res.end(JSON.stringify({ rows: [] }));
           return;
       }
       if (type === 'balance_monthly') {
           res.statusCode = 200;
           res.setHeader('content-type','application/json');
           res.end(JSON.stringify({ month: data?.month || '', income: 0, expense: 0, net: 0, openPayables: 0, openReceivables: 0, projectionNetAfterOpen: 0 }));
           return;
       }
       // For inserts/updates, we can't do much without DB
       res.statusCode = 503;
       res.setHeader('content-type','application/json');
       res.end(JSON.stringify({ error: 'database_not_configured' }));
       return;
    }

    const db = getPool();

    // --- Access Control & Permissions ---
    let role = 'owner';
    let orgId: string | null = null;
    let allowedEditCCs: Set<string> = new Set();
    let allowedViewCCs: Set<string> = new Set();
    let isMember = false;
    let planLimits: any = null;
    let assertSubscriptionActive: () => Promise<void> = async () => {};
    let ensureAccountsLimit: () => Promise<void> = async () => {};
    let ensureCostCentersLimit: (targetScope: 'personal' | 'org') => Promise<void> = async () => {};
    let enforceTxQuota: (txId: string, dateStr: string) => Promise<void> = async () => {};
    let tier = 'starter';
    let orgName = '';

    try {
        const profileRes = await db.query('select org_id, plan_id, is_admin, preferences, business_profile from public.profiles where user_id=$1', [userId]);
        const profile = profileRes.rows[0] || null;
        orgId = profile?.org_id;
        const preferences = (profile?.preferences || {}) as any;
        const businessProfile = String(profile?.business_profile || preferences.businessProfile || (preferences.isMei ? 'mei' : (profile?.org_id ? 'empresa' : 'pf'))).toLowerCase();

        const viewMode = req.headers['x-view-mode'];
        if (orgId && viewMode === 'organization') {
            // Keep orgId
        } else {
            orgId = null;
        }

        const getTier = async (): Promise<string> => {
            try {
                // 1. Active trial grants PRO tier capabilities during the 14 days
                if (orgId) {
                    const subRes = await db.query(
                        "select billing_period from public.org_subscriptions where org_id=$1 and lower(status)='active' and (period_end is null or period_end >= now()) limit 1",
                        [orgId]
                    );
                    if (subRes.rows[0]?.billing_period === 'trial') return 'pro';
                }
                const userSubRes = await db.query(
                    "select billing_period from public.user_subscriptions where user_id=$1 and lower(status)='active' and (period_end is null or period_end >= now()) limit 1",
                    [userId]
                );
                if (userSubRes.rows[0]?.billing_period === 'trial') return 'pro';

                if (profile?.org_id) {
                    const orgSubRes = await db.query(
                        "select billing_period from public.org_subscriptions where org_id=$1 and lower(status)='active' and (period_end is null or period_end >= now()) limit 1",
                        [profile.org_id]
                    );
                    if (orgSubRes.rows[0]?.billing_period === 'trial') return 'pro';
                }

                if (orgId) {
                    const orgRes = await db.query('select p.tier from public.organizations o left join public.plans p on o.plan_id = p.id where o.id=$1', [orgId]);
                    const raw = String(orgRes.rows[0]?.tier || '').toLowerCase();
                    const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (norm === 'pró' || norm === 'pro') return 'pro';
                    if (norm === 'corporate') return 'pro';
                    return norm || 'starter';
                }
                if (profile?.plan_id) {
                    const planRes = await db.query('select tier from public.plans where id=$1', [profile.plan_id]);
                    const raw = String(planRes.rows[0]?.tier || '').toLowerCase();
                    const norm = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (norm === 'pró' || norm === 'pro') return 'pro';
                    if (norm === 'corporate') return 'pro';
                    return norm || 'starter';
                }
            } catch {}
            return 'starter';
        };

        tier = await getTier();
        if (orgId) {
            const orgDataRes = await db.query('select name from public.organizations where id=$1', [orgId]);
            orgName = orgDataRes.rows[0]?.name || '';
        }
        const scopeType = orgId ? 'org' : 'user';
        const scopeId = String(orgId || userId);
        
        // Fix: prioritize businessProfile for segment selection. 
        // If businessProfile is mei, segment is mei, regardless of orgId presence.
        const segment = businessProfile === 'mei' ? 'mei' : (orgId ? 'empresa' : 'pf');
        
        const unlimited = 1_000_000;
        const limitsBySegment: Record<string, any> = {
            pf: {
                starter: { accounts: 2, costCenters: 1, transactionsPerMonth: 100 },
                plus: { accounts: 10, costCenters: 5, transactionsPerMonth: 500 },
                pro: { accounts: unlimited, costCenters: unlimited, transactionsPerMonth: 3000 }
            },
            mei: {
                starter: { accounts: 2, costCenters: 1, transactionsPerMonth: 100 },
                plus: { accounts: 10, costCenters: 5, transactionsPerMonth: 500 },
                pro: { accounts: unlimited, costCenters: unlimited, transactionsPerMonth: 3000 }
            },
            empresa: {
                starter: { accounts: 2, costCenters: 1, transactionsPerMonth: 100 },
                plus: { accounts: 10, costCenters: 5, transactionsPerMonth: 500 },
                pro: { accounts: unlimited, costCenters: unlimited, transactionsPerMonth: 3000 }
            }
        };
        planLimits = (limitsBySegment[segment] && limitsBySegment[segment][tier]) ? limitsBySegment[segment][tier] : limitsBySegment[segment]?.starter;

        assertSubscriptionActive = async () => {
            const trialDays = Math.max(1, Number(process.env.TRIAL_DAYS || 14));
            if (scopeType === 'org') {
                const up = await db.query("select status, period_end from public.org_subscriptions where org_id=$1", [scopeId]);
                if (!up.rows[0]) {
                    const endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
                    await db.query(
                      "insert into public.org_subscriptions(org_id, provider, status, period_start, period_end, billing_period) values($1,'internal','active', now(), $2, 'trial') on conflict (org_id) do nothing",
                      [scopeId, endDate]
                    );
                    return;
                }
                const st = String(up.rows[0]?.status || '').toLowerCase();
                const end = up.rows[0]?.period_end ? new Date(up.rows[0].period_end).getTime() : null;
                if (st !== 'active') throw new Error('subscription_inactive');
                if (end && end < Date.now()) throw new Error('subscription_expired');
                return;
            }

            // For personal scope: check user_subscriptions first
            const active = await db.query(
              `select status, period_end
               from public.user_subscriptions
               where user_id=$1 and lower(status)='active' and (period_end is null or period_end >= now())
               order by coalesce(period_end, 'infinity'::timestamptz) desc nulls last, period_start desc nulls last, created_at desc
               limit 1`,
              [userId]
            );
            if (active.rows[0]) return;

            // Inherit org active subscription if user belongs to an org
            if (profile?.org_id) {
                const orgSub = await db.query(
                    "select status, period_end from public.org_subscriptions where org_id=$1 and lower(status)='active' and (period_end is null or period_end >= now())",
                    [profile.org_id]
                );
                if (orgSub.rows[0]) return;
            }

            const latest = await db.query(
              "select status, period_end from public.user_subscriptions where user_id=$1 order by coalesce(period_start, period_end) desc nulls last, created_at desc limit 1",
              [userId]
            );
            if (!latest.rows[0]) {
                const endDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
                await db.query(
                  "insert into public.user_subscriptions(user_id, provider, status, period_start, period_end, billing_period) values($1,'internal','active', now(), $2, 'trial')",
                  [userId, endDate]
                );
                return;
            }
            const st = String(latest.rows[0]?.status || '').toLowerCase();
            const end = latest.rows[0]?.period_end ? new Date(latest.rows[0].period_end).getTime() : null;
            if (end && end < Date.now()) throw new Error('subscription_expired');
            if (st !== 'active') throw new Error('subscription_inactive');
            throw new Error('subscription_inactive');
        };

        ensureAccountsLimit = async () => {
            await assertSubscriptionActive();
            if (!planLimits?.accounts) return;
            if (orgId) {
                const c = await db.query('select count(*)::int as c from public.accounts where org_id=$1', [orgId]);
                if (Number(c.rows[0]?.c || 0) >= Number(planLimits.accounts)) throw new Error('limit_reached_accounts');
            } else {
                const c = await db.query('select count(*)::int as c from public.accounts where user_id=$1', [userId]);
                if (Number(c.rows[0]?.c || 0) >= Number(planLimits.accounts)) throw new Error('limit_reached_accounts');
            }
        };

        ensureCostCentersLimit = async (targetScope: 'personal' | 'org') => {
            await assertSubscriptionActive();
            if (planLimits?.costCenters === undefined || planLimits?.costCenters === null) return;
            
            if (targetScope === 'org') {
                if (!orgId) throw new Error('permission_denied');
                const c = await db.query('select count(*)::int as c from public.cost_centers where org_id=$1', [orgId]);
                if (Number(c.rows[0]?.c || 0) >= Number(planLimits.costCenters)) throw new Error('limit_reached_cost_centers');
            } else {
                const c = await db.query('select count(*)::int as c from public.cost_centers where user_id=$1', [userId]);
                if (Number(c.rows[0]?.c || 0) >= Number(planLimits.costCenters)) throw new Error('limit_reached_cost_centers');
            }
        };

        enforceTxQuota = async (txId: string, dateStr: string) => {
            await assertSubscriptionActive();
            const lim = Number(planLimits?.transactionsPerMonth || 0);
            if (!lim || lim >= unlimited) return;
            const yyyymm = String(dateStr || '').slice(0, 7);
            if (!/^\d{4}-\d{2}$/.test(yyyymm)) return;
            const ex = await db.query(
              'select yyyymm from public.usage_tx_ledger where scope_type=$1 and scope_id=$2 and tx_id=$3 limit 1',
              [scopeType, scopeId, txId]
            );
            const existing = ex.rows[0] || null;
            if (existing) {
                const prevMonth = String(existing.yyyymm || '');
                if (prevMonth === yyyymm) return;
                const cur = await db.query(
                  'select count(*)::int as c from public.usage_tx_ledger where scope_type=$1 and scope_id=$2 and yyyymm=$3 and tx_id <> $4',
                  [scopeType, scopeId, yyyymm, txId]
                );
                if (Number(cur.rows[0]?.c || 0) >= lim) throw new Error('limit_reached_transactions_month');
                await db.query(
                  'update public.usage_tx_ledger set yyyymm=$1 where scope_type=$2 and scope_id=$3 and tx_id=$4',
                  [yyyymm, scopeType, scopeId, txId]
                );
                return;
            }

            const q = await db.query(
              `with current as (
                 select count(*)::int as c from public.usage_tx_ledger where scope_type=$1 and scope_id=$2 and yyyymm=$4
               ),
               ins as (
                 insert into public.usage_tx_ledger(scope_type, scope_id, yyyymm, tx_id)
                 select $1, $2, $4, $3
                 where (select c from current) < $5
                 on conflict (scope_type, scope_id, tx_id) do nothing
                 returning 1
               )
               select (select count(*) from ins) as inserted`,
              [scopeType, scopeId, txId, yyyymm, lim]
            );
            const inserted = Number(q.rows[0]?.inserted || 0);
            if (inserted === 1) return;

            const ex2 = await db.query(
              'select 1 as ok from public.usage_tx_ledger where scope_type=$1 and scope_id=$2 and tx_id=$3 limit 1',
              [scopeType, scopeId, txId]
            );
            if (ex2.rows[0]) return;

            throw new Error('limit_reached_transactions_month');
        };

        if (orgId) {
            const memberRes = await db.query('select role from public.org_members where org_id=$1 and user_id=$2', [orgId, userId]);
            if (memberRes.rows[0]) role = memberRes.rows[0].role;

            // Admin override from profile
            if (profile?.is_admin) role = 'admin';
            
            // Auto-Admin Logic
            if (role === 'member') {
                const countRes = await db.query('select count(*) as count from public.org_members where org_id=$1', [orgId]);
                const memberCount = parseInt(countRes.rows[0]?.count || '0');
                if (memberCount === 1) role = 'admin';
                else {
                    const orgRes = await db.query('select p.tier from public.organizations o left join public.plans p on o.plan_id = p.id where o.id=$1', [orgId]);
                    let planTier = String(orgRes.rows[0]?.tier || '').toLowerCase();
                    
                    // Fallback to profile plan if org plan is missing or not definitive
                    if (!planTier && profile?.plan_id) {
                         const planRes = await db.query('select tier from public.plans where id=$1', [profile.plan_id]);
                         planTier = String(planRes.rows[0]?.tier || '').toLowerCase();
                    }

                    if (['starter', 'plus', 'pro', 'pró'].includes(planTier)) role = 'admin';
                }
            }

            if (role === 'member') {
                isMember = true;
                const permsRes = await db.query('select cost_center_id, role from public.cost_center_permissions where org_id=$1 and user_id=$2', [orgId, userId]);
                permsRes.rows.forEach((row: any) => {
                    if (row.role === 'viewer' || row.role === 'editor' || row.role === 'manager') {
                        allowedViewCCs.add(row.cost_center_id);
                    }
                    if (row.role === 'editor' || row.role === 'manager') {
                        allowedEditCCs.add(row.cost_center_id);
                    }
                });
            }
        }
    } catch (e) {
        console.error('Error fetching permissions:', e);
    }

    const checkWritePermission = async (targetCCId: string | null | undefined, recordId?: string, table?: string) => {
        if (!isMember) return true; // Owner/Admin can do anything

        // 1. Check target CC (only if targetCCId is explicitly provided, i.e. not undefined)
        if (targetCCId !== undefined) {
            if (targetCCId && !allowedEditCCs.has(targetCCId)) return false;
            // If target is null (General) but user is restricted to specific CCs, deny.
            if (!targetCCId && allowedEditCCs.size > 0) return false;
        }

        // 2. If updating/deleting, check EXISTING record's CC
        if (recordId && table) {
            const ALLOWED_TABLES = new Set(['transactions', 'recurrences', 'cost_centers']);
            if (!ALLOWED_TABLES.has(table)) return false;
            const res = await db.query(`select cost_center_id from public.${table} where id=$1`, [recordId]);
            const existingCC = res.rows[0]?.cost_center_id;
            if (existingCC && !allowedEditCCs.has(existingCC)) return false;
            if (!existingCC && allowedEditCCs.size > 0) return false;
        }

        return true;
    };

    const isWriteOperation = (op: string): boolean => {
        const t = String(op || '').toLowerCase();
        if (!t) return false;
        if (t.endsWith('_insert') || t.endsWith('_update') || t.endsWith('_delete') || t.endsWith('_upsert')) return true;
        if (t.includes('_mark_')) return true;
        if (t === 'profile_update_preferences') return true;
        if (t === 'profile_update_business_profile') return true;
        return false;
    };

    if (isWriteOperation(type)) {
        await assertSubscriptionActive();
    }


    let r: any;

    const ensureCategory = async (uid: string, name: string, ctype: string) => {
      try {
        let q;
        if (orgId) {
            q = await db.query('select 1 from public.categories where org_id=$1 and lower(name)=lower($2) limit 1', [orgId, name]);
        } else {
            q = await db.query('select 1 from public.categories where user_id=$1 and lower(name)=lower($2) limit 1', [uid, name]);
        }

        if (!q.rows.length) {
          const id = crypto.randomUUID();
          const targetOrgId = orgId || null;
          await db.query('insert into public.categories(id,user_id,name,type,icon,org_id) values($1,$2,$3,$4,$5,$6)', [id, uid, name, ctype, null, targetOrgId]);
        }
      } catch (e) {
        console.error('ensureCategory error:', e);
      }
    };

    if (type === 'raw') {
        if (process.env.ALLOW_RAW_SQL !== 'true' || isMember) {
            res.statusCode = 403;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'forbidden_operation', details: 'Execução de SQL direto desativada por política de segurança.' }));
            return;
        }
        const sql: string = String(input.sql || '');
        const params: any[] = Array.isArray(input.params) ? input.params : [];
        if (!sql) throw new Error('missing sql');
        r = await db.query(sql, params);
    } 
    // --- ACCOUNTS ---
    else if (type === 'accounts_list') {
        if (orgId) {
            r = await db.query('select * from public.accounts where org_id=$1 order by created_at asc', [orgId]);
        } else {
            r = await db.query('select * from public.accounts where user_id=$1 and org_id is null order by created_at asc', [userId]);
        }
    } else if (type === 'accounts_insert') {
        if (isMember) throw new Error('permission_denied_member');
        await ensureAccountsLimit();
        const { name, bank, initialBalance } = data;
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        r = await db.query('insert into public.accounts(id,user_id,name,bank,initial_balance,org_id) values($1,$2,$3,$4,$5,$6) returning *', [id, userId, name, bank, initialBalance || 0, targetOrgId]);
    } else if (type === 'accounts_update') {
        if (isMember) throw new Error('permission_denied_member');
        const { id, name, bank, initialBalance } = data;
        if (orgId) {
            r = await db.query('update public.accounts set name=$1, bank=$2, initial_balance=$3 where id=$4 and org_id=$5 returning *', [name, bank, initialBalance, id, orgId]);
        } else {
            r = await db.query('update public.accounts set name=$1, bank=$2, initial_balance=$3 where id=$4 and user_id=$5 and org_id is null returning *', [name, bank, initialBalance, id, userId]);
        }
    } else if (type === 'accounts_delete') {
        if (isMember) throw new Error('permission_denied_member');
        if (orgId) {
             r = await db.query('delete from public.accounts where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.accounts where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- TRANSACTIONS ---
    else if (type === 'transactions_list') {
        const { beforeDate, limit } = data || {};
        const lim = Math.max(1, Math.min(Number(limit || 100), 500));
        
        // Filter by permissions if member
        let query = '';
        const params: any[] = [];

        if (orgId) {
            query = 'select * from public.transactions where org_id=$1';
            params.push(orgId);
        } else {
            query = 'select * from public.transactions where user_id=$1 and org_id is null';
            params.push(userId);
        }
        
        if (isMember) {
             if (allowedViewCCs.size > 0) {
                 const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${params.length + i + 1}`).join(',');
                 query += ` and (cost_center_id in (${placeholders}))`;
                 allowedViewCCs.forEach(cc => params.push(cc));
             } else {
                 query += ' and 1=0'; 
             }
        }

        if (beforeDate) {
            params.push(beforeDate);
            query += ` and date < $${params.length}`;
        }
        params.push(lim);
        query += ` order by date desc, created_at desc limit $${params.length}`;
        
        r = await db.query(query, params);
    } else if (type === 'transactions_insert') {
        const { date, accountId, toAccountId, transactionType, category, description, amount, paymentMethod, costCenterId, isBusinessRevenue, isBusinessExpense } = data;
        const isIncome = transactionType === 'Entrada' || transactionType === 'income' || transactionType === 'receita';
        const isExpense = transactionType === 'Saída' || transactionType === 'expense' || transactionType === 'despesa';
        const businessRevenue = isIncome && !!isBusinessRevenue;
        const businessExpense = isExpense && !!isBusinessExpense;
        if (!(await checkWritePermission(costCenterId || null))) throw new Error('permission_denied_cc');
        const id = crypto.randomUUID();
        await enforceTxQuota(id, date);
        const targetOrgId = orgId || null;
        r = await db.query('insert into public.transactions(id,user_id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,is_business_revenue,is_business_expense,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *', [id, userId, date, accountId, toAccountId || null, transactionType, category, description, amount, paymentMethod, costCenterId || null, businessRevenue, businessExpense, targetOrgId]);

        // Pro-labore Integration logic for Pro Tier
        if (targetOrgId && String(tier || '').toLowerCase() === 'pro' && transactionType === 'expense') {
            const descLower = String(description || '').toLowerCase();
            const catLower = String(category || '').toLowerCase();
            if (descLower.includes('pró-labore') || catLower.includes('pró-labore') || descLower.includes('pro-labore') || catLower.includes('pro-labore')) {
                // Auto-create income in personal flow
                const mirrorId = crypto.randomUUID();
                const mirrorDesc = `[Pró-labore] ${orgName || 'Org'} -> Pessoal`;
                // We use first active personal account or null
                const persAcc = await db.query('select id from public.accounts where user_id=$1 limit 1', [userId]);
                const accId = persAcc.rows[0]?.id || null;
                if (accId) {
                    await db.query(`
                        insert into public.transactions(id,user_id,date,account_id,transaction_type,category,description,amount,payment_method,org_id)
                        values($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
                    `, [mirrorId, userId, date, accId, 'income', 'Pró-labore', mirrorDesc, amount, paymentMethod]);
                }
            }
        }
    } else if (type === 'transactions_update') {
        const { id, date, accountId, toAccountId, transactionType, category, description, amount, paymentMethod, costCenterId, isBusinessRevenue, isBusinessExpense } = data;
        const isIncome = transactionType === 'Entrada' || transactionType === 'income' || transactionType === 'receita';
        const isExpense = transactionType === 'Saída' || transactionType === 'expense' || transactionType === 'despesa';
        const businessRevenue = isIncome && !!isBusinessRevenue;
        const businessExpense = isExpense && !!isBusinessExpense;
        if (!(await checkWritePermission(costCenterId || null, id, 'transactions'))) throw new Error('permission_denied_cc');
        
        if (orgId) {
            r = await db.query('update public.transactions set date=$1, account_id=$2, to_account_id=$3, transaction_type=$4, category=$5, description=$6, amount=$7, payment_method=$8, cost_center_id=$9, is_business_revenue=$10, is_business_expense=$11 where id=$12 and org_id=$13 returning *', [date, accountId, toAccountId || null, transactionType, category, description, amount, paymentMethod, costCenterId || null, businessRevenue, businessExpense, id, orgId]);
        } else {
            r = await db.query('update public.transactions set date=$1, account_id=$2, to_account_id=$3, transaction_type=$4, category=$5, description=$6, amount=$7, payment_method=$8, cost_center_id=$9, is_business_revenue=$10, is_business_expense=$11 where id=$12 and user_id=$13 returning *', [date, accountId, toAccountId || null, transactionType, category, description, amount, paymentMethod, costCenterId || null, businessRevenue, businessExpense, id, userId]);
        }
    } else if (type === 'transactions_delete') {
        if (!(await checkWritePermission(undefined, data.id, 'transactions'))) throw new Error('permission_denied_cc');
        if (orgId) {
            r = await db.query('delete from public.transactions where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
            r = await db.query('delete from public.transactions where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- CATEGORIES ---
    else if (type === 'categories_list') {
        if (orgId) {
            r = await db.query('select * from public.categories where org_id=$1 order by name asc', [orgId]);
        } else {
            r = await db.query('select * from public.categories where user_id=$1 and org_id is null order by name asc', [userId]);
        }
    } else if (type === 'categories_insert') {
        if (isMember) throw new Error('permission_denied_member');
        const { name, type: ctype, icon, meiCategory } = data;
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        r = await db.query('insert into public.categories(id,user_id,name,type,icon,mei_category,org_id) values($1,$2,$3,$4,$5,$6,$7) returning *', [id, userId, name, ctype, icon, meiCategory, targetOrgId]);
    } else if (type === 'categories_update') {
        if (isMember) throw new Error('permission_denied_member');
        const { id, name, type: ctype, icon, meiCategory } = data;
        if (orgId) {
             r = await db.query('update public.categories set name=$1, type=$2, icon=$3, mei_category=$4 where id=$5 and org_id=$6 returning *', [name, ctype, icon, meiCategory, id, orgId]);
        } else {
             r = await db.query('update public.categories set name=$1, type=$2, icon=$3, mei_category=$4 where id=$5 and user_id=$6 and org_id is null returning *', [name, ctype, icon, meiCategory, id, userId]);
        }
    } else if (type === 'categories_delete') {
        if (isMember) throw new Error('permission_denied_member');
        if (orgId) {
             r = await db.query('delete from public.categories where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.categories where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- INVESTMENTS ---
    else if (type === 'investments_list') {
        if (orgId) {
            r = await db.query('select * from public.investments where org_id=$1 order by created_at asc', [orgId]);
        } else {
            r = await db.query('select * from public.investments where user_id=$1 and org_id is null order by created_at asc', [userId]);
        }
    } else if (type === 'investments_insert') {
        if (isMember) throw new Error('permission_denied_member');
        const { type: itype, ticker, quantity, purchasePrice, purchaseDate } = data;
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        await enforceTxQuota(id, purchaseDate || new Date().toISOString());
        r = await db.query('insert into public.investments(id,user_id,type,ticker,quantity,purchase_price,purchase_date,org_id) values($1,$2,$3,$4,$5,$6,$7,$8) returning *', [id, userId, itype, ticker, quantity, purchasePrice, purchaseDate, targetOrgId]);
    } else if (type === 'investments_update') {
        if (isMember) throw new Error('permission_denied_member');
        const { id, type: itype, ticker, quantity, purchasePrice, purchaseDate } = data;
        if (orgId) {
            r = await db.query('update public.investments set type=$1, ticker=$2, quantity=$3, purchase_price=$4, purchase_date=$5 where id=$6 and org_id=$7 returning *', [itype, ticker, quantity, purchasePrice, purchaseDate, id, orgId]);
        } else {
            r = await db.query('update public.investments set type=$1, ticker=$2, quantity=$3, purchase_price=$4, purchase_date=$5 where id=$6 and user_id=$7 and org_id is null returning *', [itype, ticker, quantity, purchasePrice, purchaseDate, id, userId]);
        }
    } else if (type === 'investments_delete') {
        if (isMember) throw new Error('permission_denied_member');
        if (orgId) {
            r = await db.query('delete from public.investments where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
            r = await db.query('delete from public.investments where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- FIXED INCOME ---
    else if (type === 'fixed_income_list') {
        if (orgId) {
            r = await db.query('select * from public.fixed_income_investments where org_id=$1 order by created_at asc', [orgId]);
        } else {
            r = await db.query('select * from public.fixed_income_investments where user_id=$1 and org_id is null order by created_at asc', [userId]);
        }
    } else if (type === 'fixed_income_insert') {
        if (isMember) throw new Error('permission_denied_member');
        const { name, issuer, amountInvested, yieldRate, purchaseDate, maturityDate } = data;
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        await enforceTxQuota(id, purchaseDate || new Date().toISOString());
        r = await db.query('insert into public.fixed_income_investments(id,user_id,name,issuer,amount_invested,yield_rate,purchase_date,maturity_date,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *', [id, userId, name, issuer, amountInvested, yieldRate, purchaseDate, maturityDate, targetOrgId]);
    } else if (type === 'fixed_income_update') {
        if (isMember) throw new Error('permission_denied_member');
        const { id, name, issuer, amountInvested, yieldRate, purchaseDate, maturityDate } = data;
        if (orgId) {
             r = await db.query('update public.fixed_income_investments set name=$1, issuer=$2, amount_invested=$3, yield_rate=$4, purchase_date=$5, maturity_date=$6 where id=$7 and org_id=$8 returning *', [name, issuer, amountInvested, yieldRate, purchaseDate, maturityDate, id, orgId]);
        } else {
             r = await db.query('update public.fixed_income_investments set name=$1, issuer=$2, amount_invested=$3, yield_rate=$4, purchase_date=$5, maturity_date=$6 where id=$7 and user_id=$8 and org_id is null returning *', [name, issuer, amountInvested, yieldRate, purchaseDate, maturityDate, id, userId]);
        }
    } else if (type === 'fixed_income_delete') {
        if (isMember) throw new Error('permission_denied_member');
        if (orgId) {
             r = await db.query('delete from public.fixed_income_investments where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.fixed_income_investments where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- GOALS ---
    else if (type === 'goals_list') {
        if (orgId) {
            r = await db.query('select * from public.goals where org_id=$1 order by created_at asc', [orgId]);
        } else {
            r = await db.query('select * from public.goals where user_id=$1 and org_id is null order by created_at asc', [userId]);
        }
    } else if (type === 'goals_insert') {
        if (isMember) throw new Error('permission_denied_member');
        const { name, targetAmount, currentAmount, color } = data;
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        await enforceTxQuota(id, new Date().toISOString());
        r = await db.query('insert into public.goals(id,user_id,name,target_amount,current_amount,color,org_id) values($1,$2,$3,$4,$5,$6,$7) returning *', [id, userId, name, targetAmount, currentAmount, color, targetOrgId]);
    } else if (type === 'goals_update') {
        if (isMember) throw new Error('permission_denied_member');
        const { id, name, targetAmount, currentAmount, color } = data;
        if (orgId) {
             r = await db.query('update public.goals set name=$1, target_amount=$2, current_amount=$3, color=$4 where id=$5 and org_id=$6 returning *', [name, targetAmount, currentAmount, color, id, orgId]);
        } else {
             r = await db.query('update public.goals set name=$1, target_amount=$2, current_amount=$3, color=$4 where id=$5 and user_id=$6 and org_id is null returning *', [name, targetAmount, currentAmount, color, id, userId]);
        }
    } else if (type === 'goals_delete') {
        if (isMember) throw new Error('permission_denied_member');
        if (orgId) {
             r = await db.query('delete from public.goals where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.goals where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- COST CENTERS ---
    else if (type === 'cost_centers_list') {
        if (isMember) {
             // Only return allowed CCs
             if (allowedViewCCs.size > 0) {
                 const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${i + 2}`).join(',');
                 // Check if user has orgId
                 if (orgId) {
                     r = await db.query(`select * from public.cost_centers where org_id=$1 and id in (${placeholders}) order by name asc`, [orgId, ...Array.from(allowedViewCCs)]);
                 } else {
                     r = await db.query(`select * from public.cost_centers where user_id=$1 and org_id is null and id in (${placeholders}) order by name asc`, [userId, ...Array.from(allowedViewCCs)]);
                 }
             } else {
                 r = { rows: [] };
             }
        } else {
            if (orgId) {
                 r = await db.query('select * from public.cost_centers where org_id=$1 order by name asc', [orgId]);
            } else {
                 r = await db.query('select * from public.cost_centers where user_id=$1 and org_id is null order by name asc', [userId]);
            }
        }
    } else if (type === 'cost_centers_insert') {
        if (isMember) throw new Error('permission_denied_member');
        const { name, scope } = data;
        const id = crypto.randomUUID();
        const targetScope: 'personal' | 'org' = scope === 'personal' ? 'personal' : scope === 'org' ? 'org' : (orgId ? 'org' : 'personal');
        await ensureCostCentersLimit(targetScope);
        const targetOrgId = targetScope === 'org' ? (orgId || null) : null;
        r = await db.query('insert into public.cost_centers(id,user_id,name,org_id) values($1,$2,$3,$4) returning *', [id, userId, name, targetOrgId]);
    } else if (type === 'cost_centers_update') {
        const { id, name } = data;
        if (isMember) {
             if (!allowedEditCCs.has(id)) throw new Error('permission_denied_cc');
        }
        if (orgId) {
             r = await db.query('update public.cost_centers set name=$1 where id=$2 and org_id=$3 returning *', [name, id, orgId]);
        } else {
             r = await db.query('update public.cost_centers set name=$1 where id=$2 and user_id=$3 and org_id is null returning *', [name, id, userId]);
        }
    } else if (type === 'cost_centers_delete') {
        if (isMember) throw new Error('permission_denied_member');
        // Admins can delete
        if (orgId) {
             r = await db.query('delete from public.cost_centers where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.cost_centers where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- RECURRENCES (Assinaturas) ---
    else if (type === 'recurrences_list') {
        if (isMember) {
            if (allowedViewCCs.size > 0) {
                const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${i + 2}`).join(',');
                if (orgId) {
                    r = await db.query(`select * from public.recurrences where org_id=$1 and cost_center_id in (${placeholders}) order by created_at desc`, [orgId, ...Array.from(allowedViewCCs)]);
                } else {
                    r = await db.query(`select * from public.recurrences where user_id=$1 and org_id is null and cost_center_id in (${placeholders}) order by created_at desc`, [userId, ...Array.from(allowedViewCCs)]);
                }
            } else {
                r = { rows: [] };
            }
        } else {
            if (orgId) {
                r = await db.query('select * from public.recurrences where org_id=$1 order by created_at desc', [orgId]);
            } else {
                r = await db.query('select * from public.recurrences where user_id=$1 and org_id is null order by created_at desc', [userId]);
            }
        }
    } else if (type === 'recurrences_insert') {
        const { label, amount, category, accountId, paymentMethod, dayOfMonth, businessDayRule, costCenterId, active } = data;
        if (!(await checkWritePermission(costCenterId || null))) throw new Error('permission_denied_cc');
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        await enforceTxQuota(id, new Date().toISOString());
        r = await db.query('insert into public.recurrences(id,user_id,label,amount,category,account_id,payment_method,day_of_month,business_day_rule,cost_center_id,active,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *', [id, userId, label, amount, category, accountId, paymentMethod, dayOfMonth, businessDayRule, costCenterId, active ?? true, targetOrgId]);
    } else if (type === 'recurrences_update') {
        const { id, label, amount, category, accountId, paymentMethod, dayOfMonth, businessDayRule, costCenterId, active } = data;
        if (!(await checkWritePermission(costCenterId || null, id, 'recurrences'))) throw new Error('permission_denied_cc');
        if (orgId) {
             r = await db.query('update public.recurrences set label=$1, amount=$2, category=$3, account_id=$4, payment_method=$5, day_of_month=$6, business_day_rule=$7, cost_center_id=$8, active=$9 where id=$10 and org_id=$11 returning *', [label, amount, category, accountId, paymentMethod, dayOfMonth, businessDayRule, costCenterId, active, id, orgId]);
        } else {
             r = await db.query('update public.recurrences set label=$1, amount=$2, category=$3, account_id=$4, payment_method=$5, day_of_month=$6, business_day_rule=$7, cost_center_id=$8, active=$9 where id=$10 and user_id=$11 and org_id is null returning *', [label, amount, category, accountId, paymentMethod, dayOfMonth, businessDayRule, costCenterId, active, id, userId]);
        }
    } else if (type === 'recurrences_delete') {
        if (!(await checkWritePermission(undefined, data.id, 'recurrences'))) throw new Error('permission_denied_cc');
        if (orgId) {
             r = await db.query('delete from public.recurrences where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.recurrences where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    }
    // --- MEI MONTHLY CLOSINGS ---
    else if (type === 'mei_monthly_closing_get') {
        const profile = (await db.query('select business_profile from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const year = Number(data.year);
        const month = Number(data.month);
        const scopeParams = orgId ? [orgId, year, month] : [userId, year, month];
        const scopeWhere = orgId ? 'org_id=$1' : 'user_id=$1 and org_id is null';
        const closing = (await db.query(`select * from public.mei_monthly_closings where ${scopeWhere} and reference_year=$2 and reference_month=$3`, scopeParams)).rows[0] || null;
        const periodKey = `${year}-${String(month).padStart(2, '0')}`;
        const transactions = (await db.query(`select id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,is_business_revenue,is_business_expense from public.transactions where ${scopeWhere} and to_char(date, 'YYYY-MM') = $2`, [orgId || userId, periodKey])).rows;
        const categories = (await db.query(`select id,name,type,icon,mei_category from public.categories where ${orgId ? 'org_id=$1' : 'user_id=$1 and org_id is null'}`, orgId ? [orgId] : [userId])).rows;
        const obligations = (await db.query(`select * from public.mei_tax_obligations where ${orgId ? 'org_id=$1' : 'user_id=$1 and org_id is null'} and reference_year=$2 and reference_month=$3`, scopeParams)).rows;
        const snapshot = calculateMeiMonthlyClosing({ transactions: transactions.map(row => ({ id: row.id, date: row.date, accountId: row.account_id, toAccountId: row.to_account_id || undefined, transactionType: row.transaction_type, category: row.category, description: row.description || '', amount: Number(row.amount || 0), paymentMethod: row.payment_method || '', costCenterId: row.cost_center_id || undefined, isBusinessRevenue: !!row.is_business_revenue, isBusinessExpense: !!row.is_business_expense })), categories: categories.map(row => ({ id: row.id, name: row.name, type: row.type, icon: row.icon || '', meiCategory: row.mei_category || undefined })), obligations, year, month, status: closing?.status || 'open' });
        r = { rows: [{ closing, snapshot }] };
    } else if (type === 'mei_monthly_closing_review' || type === 'mei_monthly_closing_close' || type === 'mei_monthly_closing_reopen') {
        const profile = (await db.query('select business_profile from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const year = Number(data.year), month = Number(data.month);
        const status = type === 'mei_monthly_closing_close' ? 'closed' : type === 'mei_monthly_closing_reopen' ? 'reopened' : 'reviewed';
        const targetOrgId = orgId || null;
        r = await db.query(`insert into public.mei_monthly_closings (user_id,org_id,reference_year,reference_month,status,snapshot,rules_version,reviewed_at,reviewed_by,closed_at,closed_by,reopened_at,reopened_by,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (user_id,reference_year,reference_month) where org_id is null do update set status=excluded.status,snapshot=excluded.snapshot,rules_version=excluded.rules_version,reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by,closed_at=excluded.closed_at,closed_by=excluded.closed_by,reopened_at=excluded.reopened_at,reopened_by=excluded.reopened_by,notes=excluded.notes,updated_at=now() returning *`, [userId, targetOrgId, year, month, status, data.snapshot || {}, 'phase3-closing-v1', status === 'reviewed' ? new Date() : null, status === 'reviewed' ? userId : null, status === 'closed' ? new Date() : null, status === 'closed' ? userId : null, status === 'reopened' ? new Date() : null, status === 'reopened' ? userId : null, data.notes || null]);
    }
    // --- MEI TAX OBLIGATIONS ---
    else if (type === 'mei_obligations_list') {
        const profile = (await db.query('select business_profile, preferences from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || profile?.preferences?.businessProfile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const targetOrgId = orgId || null;
        const scopeParams = targetOrgId ? [targetOrgId] : [userId];
        const scopeWhere = targetOrgId ? 'org_id=$1' : 'user_id=$1 and org_id is null';
        const openingDate = String(profile?.preferences?.meiOpeningDate || '');
        const applicableCompetences = getApplicableCompetences({ openingDate });
        const existing = await db.query(`select * from public.mei_tax_obligations where ${scopeWhere} order by reference_year desc, reference_month desc`, scopeParams);
        const existingKeys = new Set(existing.rows.map(row => `${row.reference_year}-${row.reference_month}`));
        await db.query('begin');
        try {
            for (const competence of applicableCompetences) {
                const key = `${competence.year}-${competence.month}`;
                if (existingKeys.has(key)) continue;
                await db.query(`insert into public.mei_tax_obligations (user_id,org_id,reference_year,reference_month,due_date,principal_amount,interest_amount,penalty_amount,total_amount,status,source,rules_version,notes) values ($1,$2,$3,$4,$5,0,0,0,0,'pending','system_generated','phase2-obligation-v1','Valor oficial da guia ainda não informado') on conflict do nothing`, [userId, targetOrgId, competence.year, competence.month, competence.dueDate]);
            }
            await db.query(`update public.mei_tax_obligations set status='overdue',updated_at=now() where ${scopeWhere} and status='pending' and due_date < current_date`, scopeParams);
            await db.query('commit');
        } catch (error) {
            await db.query('rollback');
            throw error;
        }
        r = await db.query(`select * from public.mei_tax_obligations where ${scopeWhere} order by reference_year desc, reference_month desc`, scopeParams);
    } else if (type === 'mei_obligation_upsert') {
        const profile = (await db.query('select business_profile from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const { referenceYear, referenceMonth, dueDate, principalAmount, interestAmount, penaltyAmount, totalAmount, status, source, rulesVersion, notes } = data;
        if (!Number.isInteger(Number(referenceYear)) || Number(referenceMonth) < 1 || Number(referenceMonth) > 12 || !dueDate) throw new Error('invalid_mei_obligation');
        const targetOrgId = orgId || null;
        const obligationId = data.id || crypto.randomUUID();
        r = await db.query(`
          insert into public.mei_tax_obligations
            (id,user_id,org_id,reference_year,reference_month,due_date,principal_amount,interest_amount,penalty_amount,total_amount,status,source,rules_version,notes)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          on conflict (id) do update set due_date=excluded.due_date, principal_amount=excluded.principal_amount, interest_amount=excluded.interest_amount, penalty_amount=excluded.penalty_amount, total_amount=excluded.total_amount, status=excluded.status, source=excluded.source, rules_version=excluded.rules_version, notes=excluded.notes, updated_at=now()
          returning *`, [obligationId, userId, targetOrgId, referenceYear, referenceMonth, dueDate, principalAmount || 0, interestAmount || 0, penaltyAmount || 0, totalAmount ?? Number(principalAmount || 0) + Number(interestAmount || 0) + Number(penaltyAmount || 0), status || 'pending', source || 'manual', rulesVersion || 'phase2-estimate-v1', notes || null]);
    } else if (type === 'mei_obligation_reconcile_transaction') {
        const profile = (await db.query('select business_profile from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const { id, transactionId } = data;
        const obligationQuery = orgId ? 'select * from public.mei_tax_obligations where id=$1 and org_id=$2 for update' : 'select * from public.mei_tax_obligations where id=$1 and user_id=$2 and org_id is null for update';
        const obligation = (await db.query(obligationQuery, orgId ? [id, orgId] : [id, userId])).rows[0];
        const transactionQuery = orgId ? 'select * from public.transactions where id=$1 and org_id=$2 for update' : 'select * from public.transactions where id=$1 and user_id=$2 and org_id is null for update';
        const transaction = (await db.query(transactionQuery, orgId ? [transactionId, orgId] : [transactionId, userId])).rows[0];
        if (!obligation || !transaction) throw new Error('mei_reconcile_not_found');
        if (obligation.status === 'paid' || obligation.transaction_id) throw new Error('mei_obligation_already_paid');
        const type = String(transaction.transaction_type || '').toLowerCase();
        if (!['saída', 'saida', 'expense', 'despesa'].includes(type)) throw new Error('mei_reconcile_requires_expense');
        r = await db.query(orgId ? 'update public.mei_tax_obligations set status=$1,payment_date=$2,transaction_id=$3,updated_at=now() where id=$4 and org_id=$5 returning *' : 'update public.mei_tax_obligations set status=$1,payment_date=$2,transaction_id=$3,updated_at=now() where id=$4 and user_id=$5 and org_id is null returning *', orgId ? ['paid', transaction.date, transaction.id, id, orgId] : ['paid', transaction.date, transaction.id, id, userId]);
    } else if (type === 'mei_obligation_mark_paid') {
        const profile = (await db.query('select business_profile from public.profiles where user_id=$1', [userId])).rows[0];
        if (String(profile?.business_profile || '').toLowerCase() !== 'mei') throw new Error('mei_profile_required');
        const { id, accountId, paymentDate, paymentMethod } = data;
        if (!(await checkWritePermission(undefined, id, 'mei_tax_obligations'))) throw new Error('permission_denied_cc');
        const obligation = (await db.query(orgId ? 'select * from public.mei_tax_obligations where id=$1 and org_id=$2 for update' : 'select * from public.mei_tax_obligations where id=$1 and user_id=$2 and org_id is null for update', orgId ? [id, orgId] : [id, userId])).rows[0];
        if (!obligation) throw new Error('mei_obligation_not_found');
        if (obligation.status === 'paid') throw new Error('mei_obligation_already_paid');
        const txId = crypto.randomUUID();
        const targetOrgId = orgId || null;
        await db.query('insert into public.transactions(id,user_id,date,account_id,transaction_type,category,description,amount,payment_method,cost_center_id,is_business_revenue,is_business_expense,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,true,$11)', [txId, userId, paymentDate || new Date().toISOString().slice(0, 10), accountId, 'Saída', 'DAS MEI', `DAS MEI - competência ${obligation.reference_year}-${String(obligation.reference_month).padStart(2, '0')}`, obligation.total_amount, paymentMethod || 'Boleto', null, targetOrgId]);
        r = await db.query(orgId ? 'update public.mei_tax_obligations set status=$1,payment_date=$2,transaction_id=$3,updated_at=now() where id=$4 and org_id=$5 returning *' : 'update public.mei_tax_obligations set status=$1,payment_date=$2,transaction_id=$3,updated_at=now() where id=$4 and user_id=$5 and org_id is null returning *', orgId ? ['paid', paymentDate || new Date().toISOString().slice(0, 10), txId, id, orgId] : ['paid', paymentDate || new Date().toISOString().slice(0, 10), txId, id, userId]);
    } else if (type === 'mei_obligation_cancel') {
        const { id } = data;
        if (!(await checkWritePermission(undefined, id, 'mei_tax_obligations'))) throw new Error('permission_denied_cc');
        r = await db.query(orgId ? 'update public.mei_tax_obligations set status=$1,updated_at=now() where id=$2 and org_id=$3 returning *' : 'update public.mei_tax_obligations set status=$1,updated_at=now() where id=$2 and user_id=$3 and org_id is null returning *', orgId ? ['cancelled', id, orgId] : ['cancelled', id, userId]);
    }
    // --- PAYABLES ---
    else if (type === 'payables_list') {
        const { status, month, start_date, end_date } = data || {};
        const isIsoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
        if ((start_date && !isIsoDate(start_date)) || (end_date && !isIsoDate(end_date)) || (start_date && end_date && start_date > end_date)) {
            const error: any = new Error('invalid_date_range');
            error.statusCode = 400;
            throw error;
        }
        const params: any[] = [];
        let where = '';

        if (orgId) {
             where = 'org_id=$1';
             params.push(orgId);
        } else {
             where = 'user_id=$1 and org_id is null';
             params.push(userId);
        }
        
        if (isMember) {
            if (allowedViewCCs.size > 0) {
                const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${params.length + i + 1}`).join(',');
                where += ` and cost_center_id in (${placeholders})`;
                allowedViewCCs.forEach(cc => params.push(cc));
            } else {
                where += ' and 1=0';
            }
        }

        if (status) { params.push(status); where += ` and status=$${params.length}`; }
        if (month) {
            params.push(month);
            where += ` and to_char(due_date, 'YYYY-MM') = $${params.length}`;
        }
        if (start_date) {
            params.push(start_date);
            where += ` and due_date >= $${params.length}`;
        }
        if (end_date) {
            params.push(end_date);
            where += ` and due_date <= $${params.length}`;
        }
        r = await db.query(`select * from public.payables where ${where} order by due_date asc, created_at desc`, params);
    } else if (type === 'payables_insert') {
        const { title, amount, issueDate, dueDate, category, costCenterId, supplier, notes } = data;
        if (!(await checkWritePermission(costCenterId || null))) throw new Error('permission_denied_cc');
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        if (category) await ensureCategory(userId, category, 'Saída');
        await enforceTxQuota(id, dueDate || new Date().toISOString());
        r = await db.query('insert into public.payables(id,user_id,org_id,title,status,amount,issue_date,due_date,category,cost_center_id,supplier,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *', [id, userId, targetOrgId, title, 'open', amount, issueDate || null, dueDate, category, costCenterId, supplier, notes]);
    } else if (type === 'payables_update') {
        const { id, title, amount, issueDate, dueDate, category, costCenterId, supplier, notes, status } = data;
        if (!(await checkWritePermission(costCenterId || null, id, 'payables'))) throw new Error('permission_denied_cc');
        
        if (orgId) {
            r = await db.query('update public.payables set title=$1, amount=$2, issue_date=$3, due_date=$4, category=$5, cost_center_id=$6, supplier=$7, notes=$8, status=coalesce($9,status), updated_at=now() where id=$10 and org_id=$11 returning *', [title, amount, issueDate, dueDate, category, costCenterId, supplier, notes, status, id, orgId]);
        } else {
            r = await db.query('update public.payables set title=$1, amount=$2, issue_date=$3, due_date=$4, category=$5, cost_center_id=$6, supplier=$7, notes=$8, status=coalesce($9,status), updated_at=now() where id=$10 and user_id=$11 and org_id is null returning *', [title, amount, issueDate, dueDate, category, costCenterId, supplier, notes, status, id, userId]);
        }
    } else if (type === 'payables_delete') {
        if (!(await checkWritePermission(undefined, data.id, 'payables'))) throw new Error('permission_denied_cc');
        if (orgId) {
             r = await db.query('delete from public.payables where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.payables where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    } else if (type === 'payables_mark_paid') {
        const { id, paidAmount, paidDate, accountId, paymentMethod, description, discountAmount, penaltyAmount } = data;
        if (!(await checkWritePermission(undefined, id, 'payables'))) throw new Error('permission_denied_cc');
        
        let row;
        if (orgId) {
            row = (await db.query('select * from public.payables where id=$1 and org_id=$2', [id, orgId])).rows[0];
        } else {
            row = (await db.query('select * from public.payables where id=$1 and user_id=$2 and org_id is null', [id, userId])).rows[0];
        }

        if (!row) throw new Error('not_found');
        
        const txId = id; // Reuse ID to prevent double counting if in the same month
        const disc = Number(discountAmount || 0);
        const pen = Number(penaltyAmount || 0);
        const baseAmt = (paidAmount ?? row.amount);
        const finalAmt = Number(baseAmt) - disc + pen;
        const descFull = [description || row.title, (paymentMethod || '').toLowerCase() === 'boleto' ? `(Boleto${disc ? `, Desconto ${formatCurrency(disc)}` : ''}${pen ? `, Multa/Juros ${formatCurrency(pen)}` : ''})` : ''].filter(Boolean).join(' ');
        
        await ensureCategory(userId, row.category || 'Contas a Pagar', 'Saída');
        
        const targetOrgId = orgId || null;
        await enforceTxQuota(txId, paidDate || row.due_date);
        await db.query('insert into public.transactions(id,user_id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [txId, userId, paidDate || row.due_date, accountId, null, 'Saída', row.category || 'Contas a Pagar', descFull, finalAmt, paymentMethod, row.cost_center_id, targetOrgId]);
        
        if (orgId) {
             r = await db.query('update public.payables set status=$1, paid_amount=$2, transaction_id=$3, updated_at=now() where id=$4 and org_id=$5 returning *', ['paid', baseAmt, txId, id, orgId]);
        } else {
             r = await db.query('update public.payables set status=$1, paid_amount=$2, transaction_id=$3, updated_at=now() where id=$4 and user_id=$5 and org_id is null returning *', ['paid', baseAmt, txId, id, userId]);
        }
        
        let tx;
        if (orgId) {
             tx = (await db.query('select * from public.transactions where id=$1 and org_id=$2', [txId, orgId])).rows[0];
        } else {
             tx = (await db.query('select * from public.transactions where id=$1 and user_id=$2 and org_id is null', [txId, userId])).rows[0];
        }
        
        res.statusCode = 200; res.setHeader('content-type','application/json'); 
        res.end(JSON.stringify({ rows: r.rows, tx })); 
        return;
    }
    // --- RECEIVABLES ---
    else if (type === 'receivables_list') {
        const { status, month, start_date, end_date } = data || {};
        const params: any[] = [];
        let where = '';

        if (orgId) {
             where = 'org_id=$1';
             params.push(orgId);
        } else {
             where = 'user_id=$1 and org_id is null';
             params.push(userId);
        }
        
        if (isMember) {
            if (allowedViewCCs.size > 0) {
                const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${params.length + i + 1}`).join(',');
                where += ` and cost_center_id in (${placeholders})`;
                allowedViewCCs.forEach(cc => params.push(cc));
            } else {
                where += ' and 1=0';
            }
        }

        if (status) { params.push(status); where += ` and status=$${params.length}`; }
        if (month) { 
            params.push(month); 
            where += ` and to_char(due_date, 'YYYY-MM') = $${params.length}`; 
        }
        if (start_date && end_date) {
            params.push(start_date);
            where += ` and due_date >= $${params.length}`;
            params.push(end_date);
            where += ` and due_date <= $${params.length}`;
        }
        r = await db.query(`select * from public.receivables where ${where} order by due_date asc, created_at desc`, params);
    } else if (type === 'receivables_insert') {
        const { title, amount, issueDate, dueDate, category, costCenterId, customer, notes } = data;
        if (!(await checkWritePermission(costCenterId || null))) throw new Error('permission_denied_cc');
        const id = crypto.randomUUID();
        const targetOrgId = orgId || null;
        if (category) await ensureCategory(userId, category, 'Entrada');
        await enforceTxQuota(id, dueDate || new Date().toISOString());
        r = await db.query('insert into public.receivables(id,user_id,org_id,title,status,amount,issue_date,due_date,category,cost_center_id,customer,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *', [id, userId, targetOrgId, title, 'open', amount, issueDate || null, dueDate, category, costCenterId, customer, notes]);
    } else if (type === 'receivables_update') {
        const { id, title, amount, issueDate, dueDate, category, costCenterId, customer, notes, status } = data;
        if (!(await checkWritePermission(costCenterId || null, id, 'receivables'))) throw new Error('permission_denied_cc');
        
        if (orgId) {
             r = await db.query('update public.receivables set title=$1, amount=$2, issue_date=$3, due_date=$4, category=$5, cost_center_id=$6, customer=$7, notes=$8, status=coalesce($9,status), updated_at=now() where id=$10 and org_id=$11 returning *', [title, amount, issueDate, dueDate, category, costCenterId, customer, notes, status, id, orgId]);
        } else {
             r = await db.query('update public.receivables set title=$1, amount=$2, issue_date=$3, due_date=$4, category=$5, cost_center_id=$6, customer=$7, notes=$8, status=coalesce($9,status), updated_at=now() where id=$10 and user_id=$11 and org_id is null returning *', [title, amount, issueDate, dueDate, category, costCenterId, customer, notes, status, id, userId]);
        }
    } else if (type === 'receivables_delete') {
        if (!(await checkWritePermission(undefined, data.id, 'receivables'))) throw new Error('permission_denied_cc');
        if (orgId) {
             r = await db.query('delete from public.receivables where id=$1 and org_id=$2', [data.id, orgId]);
        } else {
             r = await db.query('delete from public.receivables where id=$1 and user_id=$2 and org_id is null', [data.id, userId]);
        }
    } else if (type === 'receivables_mark_received') {
        const { id, receivedAmount, receivedDate, accountId, paymentMethod, description } = data;
        if (!(await checkWritePermission(undefined, id, 'receivables'))) throw new Error('permission_denied_cc');
        
        let row;
        if (orgId) {
            row = (await db.query('select * from public.receivables where id=$1 and org_id=$2', [id, orgId])).rows[0];
        } else {
            row = (await db.query('select * from public.receivables where id=$1 and user_id=$2 and org_id is null', [id, userId])).rows[0];
        }

        if (!row) throw new Error('not_found');
        
        const txId = id; // Reuse ID
        const targetOrgId = orgId || null;
        await ensureCategory(userId, row.category || 'Contas a Receber', 'Entrada');
        await enforceTxQuota(txId, receivedDate || row.due_date);
        await db.query('insert into public.transactions(id,user_id,date,account_id,to_account_id,transaction_type,category,description,amount,payment_method,cost_center_id,org_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', [txId, userId, receivedDate || row.due_date, accountId, null, 'Entrada', row.category || 'Contas a Receber', description || row.title, receivedAmount ?? row.amount, paymentMethod, row.cost_center_id, targetOrgId]);
        
        if (orgId) {
             r = await db.query('update public.receivables set status=$1, received_amount=$2, transaction_id=$3, updated_at=now() where id=$4 and org_id=$5 returning *', ['received', receivedAmount ?? row.amount, txId, id, orgId]);
        } else {
             r = await db.query('update public.receivables set status=$1, received_amount=$2, transaction_id=$3, updated_at=now() where id=$4 and user_id=$5 and org_id is null returning *', ['received', receivedAmount ?? row.amount, txId, id, userId]);
        }
        
        let tx;
        if (orgId) {
             tx = (await db.query('select * from public.transactions where id=$1 and org_id=$2', [txId, orgId])).rows[0];
        } else {
             tx = (await db.query('select * from public.transactions where id=$1 and user_id=$2 and org_id is null', [txId, userId])).rows[0];
        }
        
        res.statusCode = 200; res.setHeader('content-type','application/json'); 
        res.end(JSON.stringify({ rows: r.rows, tx })); 
        return;
    }
    // --- PROFILES ---
    else if (type === 'profile_get') {
        r = await db.query('select * from public.profiles where user_id=$1', [userId]);
    } else if (type === 'profile_update_preferences') {
        const { preferences } = data;
        // Upsert
        r = await db.query(`
            insert into public.profiles (user_id, preferences) values ($1, $2)
            on conflict (user_id) do update set preferences = coalesce(public.profiles.preferences, '{}'::jsonb) || $2
            returning *
        `, [userId, JSON.stringify(preferences || {})]);
    } else if (type === 'profile_update_business_profile') {
        const bp = String(data?.business_profile || 'pf').toLowerCase();
        const allowed = ['pf', 'mei'];
        if (!allowed.includes(bp)) throw new Error('invalid_business_profile');
        r = await db.query(`
            update public.profiles set business_profile=$2 where user_id=$1 returning *
        `, [userId, bp]);
    }
    // --- BALANCE MONTHLY ---
    else if (type === 'balance_monthly') {
        const month = String(data?.month || '').trim();
        if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid_month');
        
        let ccClause = '';
        const baseParams: any[] = [];
        let whereClause = '';

        if (orgId) {
            whereClause = 'org_id=$1';
            baseParams.push(orgId);
        } else {
            whereClause = 'user_id=$1 and org_id is null';
            baseParams.push(userId);
        }

        baseParams.push(month);
        
        const extraParams: any[] = [];

        if (isMember) {
             if (allowedViewCCs.size > 0) {
                 const placeholders = Array.from(allowedViewCCs).map((_, i) => `$${baseParams.length + i + 1}`).join(',');
                 ccClause = ` and cost_center_id in (${placeholders})`;
                 extraParams.push(...Array.from(allowedViewCCs));
             } else {
                 ccClause = ' and 1=0';
             }
        }
        
        const allParams = [...baseParams, ...extraParams];

        const incomeRow = await db.query(`select coalesce(sum(amount),0) as total from public.transactions where ${whereClause} and LOWER(transaction_type) IN ('entrada', 'income', 'receita') and to_char(date, 'YYYY-MM')=$2${ccClause}`, allParams);
        const expenseRow = await db.query(`select coalesce(sum(amount),0) as total from public.transactions where ${whereClause} and LOWER(transaction_type) IN ('saída', 'saida', 'expense', 'despesa') and to_char(date, 'YYYY-MM')=$2${ccClause}`, allParams);
        const openPayablesRow = await db.query(`select coalesce(sum(amount - coalesce(paid_amount,0)),0) as total from public.payables where ${whereClause} and status='open' and to_char(due_date, 'YYYY-MM')=$2${ccClause}`, allParams);
        const openReceivablesRow = await db.query(`select coalesce(sum(amount - coalesce(received_amount,0)),0) as total from public.receivables where ${whereClause} and status='open' and to_char(due_date, 'YYYY-MM')=$2${ccClause}`, allParams);
        
        const income = Number(incomeRow.rows[0]?.total || 0);
        const expense = Number(expenseRow.rows[0]?.total || 0);
        const net = Number((income - expense).toFixed(2));
        const openPayables = Number(openPayablesRow.rows[0]?.total || 0);
        const openReceivables = Number(openReceivablesRow.rows[0]?.total || 0);
        const projectionNetAfterOpen = Number((net - openPayables + openReceivables).toFixed(2));
        
        res.statusCode = 200; res.setHeader('content-type','application/json'); 
        res.end(JSON.stringify({ month, income, expense, net, openPayables, openReceivables, projectionNetAfterOpen })); 
        return;
    }
    else {
        res.statusCode = 400; res.setHeader('content-type','application/json'); 
        res.end(JSON.stringify({ error: 'unknown operation' })); 
        return;
    }

    res.statusCode = 200;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ rows: r.rows }));

  } catch (e: any) {
    console.error('API Query Fatal Error:', e);
    const code = String(e?.message || '');
    if (code.startsWith('limit_reached_') || code.startsWith('subscription_')) {
        res.statusCode = 402;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ error: code }));
        return;
    }
    if (code === 'invalid_date_range' || code.startsWith('mei_obligation_') || code === 'mei_profile_required' || code === 'invalid_mei_obligation') {
        res.statusCode = 400;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ error: code }));
        return;
    }
    if (code.startsWith('permission_denied')) {
        res.statusCode = 403;
        res.setHeader('content-type','application/json');
        res.end(JSON.stringify({ error: code }));
        return;
    }
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: 'internal_server_error', message: e.message }));
  }
}
