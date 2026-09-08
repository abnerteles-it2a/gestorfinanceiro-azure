import { Pool } from 'pg'
import { jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { verifySession } from './_auth_shared'

let pool: Pool | null = null;

const getPool = () => {
  if (!pool) {
    const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
    pool = new Pool({ 
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
    // Ensure UTF-8 encoding for all connections
    pool.on('connect', (client) => {
      client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
    });
  }
  return pool;
};


const readJsonBody = async (req: any): Promise<any> => {
  if (req.body) return req.body;
  let body = ''
  await new Promise<void>((resolve) => { req.on('data', (c: any) => { body += c }); req.on('end', resolve) })
  return body ? JSON.parse(body) : {}
}

const requireAdmin = async (req: any, res: any): Promise<{ admin: boolean, userId?: string } | null> => {
  // 2. Auth Check (Enforcing Single-Session Compliance)
  const result = await verifySession(req, res, getPool());
  if (!result) return null;
  const { userId, payload } = result;

  let admin = !!payload?.admin;
  
  if (userId) {
     try {
       const pool = getPool();
       if (pool) {
          const r = await pool.query('select is_admin from public.auth_users where id=$1', [userId]);
          if (r.rows[0]) {
             admin = !!r.rows[0].is_admin;
          }
       }
     } catch (e) {
       console.error('Admin DB check failed, using token claim:', e);
     }
  }

  if (!admin) { res.statusCode = 403; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'forbidden' })); return null }
  return { admin, userId }
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase()
    const url = new URL(req.url, `http://${req.headers.host}`)
    const isGet = method === 'GET'
    const input = isGet ? { action: String(url.searchParams.get('action') || '') } : await readJsonBody(req)
    const action = String(input.action || '').toLowerCase()
    const auth = await requireAdmin(req, res)
    if (!auth) return

    let out: any = {}

    if (action === 'load_all') {
      const users = await getPool().query('select id,email,is_admin,created_at from public.auth_users order by lower(email) asc')
      const subs = await getPool().query(`
        select s.id, s.user_id, u.email, u.is_admin, s.provider, s.status, s.period_start, s.period_end, s.billing_period, s.requested_tier, p.plan_id, pl.name as plan_name
        from public.user_subscriptions s
        left join public.auth_users u on u.id = s.user_id
        left join public.profiles p on p.user_id = s.user_id
        left join public.plans pl on pl.id = p.plan_id
        order by coalesce(s.period_start, s.period_end) desc nulls last
      `)
      const orgSubs = await getPool().query(`
        select s.org_id, o.name as org_name, s.provider, s.status, s.period_start, s.period_end, s.billing_period, s.requested_tier, o.plan_id, pl.name as plan_name
        from public.org_subscriptions s
        left join public.organizations o on o.id = s.org_id
        left join public.plans pl on pl.id = o.plan_id
        order by coalesce(s.period_start, s.period_end) desc nulls last, lower(o.name) asc
      `)
      const plans = await getPool().query('select id,name,tier from public.plans order by name asc')
      const profiles = await getPool().query(`
        select u.id as user_id, u.email, p.plan_id, pl.name as plan_name, p.org_id, p.is_admin, p.business_profile
        from public.auth_users u
        left join public.profiles p on p.user_id = u.id
        left join public.plans pl on pl.id = p.plan_id
        order by lower(u.email) asc
      `)
      const orgs = await getPool().query(`
        select 
          o.id, 
          o.name, 
          o.seats, 
          o.plan_id, 
          pl.name as plan_name,
          (select count(*)::int from public.org_members m where m.org_id = o.id) as members_count
        from public.organizations o
        left join public.plans pl on pl.id = o.plan_id
        order by lower(o.name) asc
      `)
      const firstOrg = orgs.rows[0]?.id || ''
      let members: any[] = []
      if (firstOrg) {
        const mr = await getPool().query(`
          select m.id, m.org_id, m.user_id, m.role, u.email
          from public.org_members m
          left join public.auth_users u on u.id = m.user_id
          where m.org_id=$1
          order by lower(u.email) asc
        `, [firstOrg])
        members = mr.rows
      }
      out = { users: users.rows, subscriptions: subs.rows, org_subscriptions: orgSubs.rows, plans: plans.rows, profiles: profiles.rows, organizations: orgs.rows, members }
    } 
    else if (action === 'reset_password') {
      const userId = String(input.userId || '').trim()
      const email = String(input.email || '').trim().toLowerCase()
      const password = String(input.password || '')
      if (!password) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_password' })); return }
      
      let id = userId
      if (!id && email) {
        const u = await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email])
        id = u.rows[0]?.id || ''
      }
      
      if (!id) { res.statusCode = 404; res.end(JSON.stringify({ error: 'user_not_found' })); return }
      
      const hash = await bcrypt.hash(password, 10)
      await getPool().query("update public.auth_users set password_hash=$1 where id=$2", [hash, id])
      // Invalidate existing sessions for this user
      await getPool().query('delete from public.auth_sessions where user_id=$1', [id])
      
      out = { ok: true, message: 'password_reset_success' }
    }
    else if (action === 'promote' || action === 'demote') {
      const targetEmail = String(input.email || '').trim().toLowerCase()
      const targetId = String(input.userId || '').trim()
      const setVal = action === 'promote'
      let r
      if (targetId) {
        r = await getPool().query('update public.auth_users set is_admin=$1 where id=$2 returning id,email,is_admin,created_at', [setVal, targetId])
      } else {
        r = await getPool().query('update public.auth_users set is_admin=$1 where lower(email)=lower($2) returning id,email,is_admin,created_at', [setVal, targetEmail])
      }
      out = { user: r.rows[0] || null }
    } 
    else if (action === 'users_upsert') {
      const email = String(input.email || '').trim().toLowerCase()
      const isAdmin = !!input.isAdmin
      const password = String(input.password || '')
      if (!email) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_email' })); return }
      const row = (await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email])).rows[0]
      if (row?.id) {
        if (password) {
          const hash = await bcrypt.hash(password, 10)
          await getPool().query("update public.auth_users set is_admin=$1, password_hash=$2 where id=$3", [isAdmin, hash, row.id])
        } else {
          await getPool().query('update public.auth_users set is_admin=$1 where id=$2', [isAdmin, row.id])
        }
        const user = (await getPool().query('select id,email,is_admin from public.auth_users where id=$1', [row.id])).rows[0] || null
        out = { user }
      } else {
        const id = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID())
        const pw = password || 'ChangeMe123!'
        const hash = await bcrypt.hash(pw, 10)
        await getPool().query("insert into public.auth_users(id,email,password_hash,is_admin) values($1,$2,$3,$4)", [id, email, hash, isAdmin])
        const user = (await getPool().query('select id,email,is_admin from public.auth_users where id=$1', [id])).rows[0] || null
        out = { user }
      }
    } 
    else if (action === 'users_delete') {
      const email = String(input.email || '').trim().toLowerCase()
      const userId = String(input.userId || '')
      const r = userId ? (await getPool().query('select id from public.auth_users where id=$1', [userId])) : (await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email]))
      const id = r.rows[0]?.id
      if (!id) { res.statusCode = 404; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'user_not_found' })); return }
      await getPool().query('delete from public.profiles where user_id=$1', [id])
      await getPool().query('delete from public.org_members where user_id=$1', [id])
      await getPool().query('delete from public.user_subscriptions where user_id=$1', [id])
      const del = await getPool().query('delete from public.auth_users where id=$1 returning id,email', [id])
      out = { user: del.rows[0] || null }
    } 
    else if (action === 'subscriptions_update') {
      const id = String(input.id || '')
      const status = String(input.status || '').toLowerCase()
      const period_start = input.period_start ? new Date(String(input.period_start)) : null
      const period_end = input.period_end ? new Date(String(input.period_end)) : null
      const billing_period = String(input.billing_period || 'monthly').toLowerCase()
      const allow = new Set(['active','paused','canceled','pending','overdue'])
      if (!id || !allow.has(status)) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_input' })); return }
      const r = await getPool().query('update public.user_subscriptions set status=$1, period_start=$2, period_end=$3, billing_period=$4 where id=$5 returning id,user_id,provider,status,period_start,period_end,billing_period', [status, period_start, period_end, billing_period, id])
      out = { subscription: r.rows[0] || null }
    } 
    else if (action === 'subscriptions_upsert') {
      const id = String(input.id || '')
      const email = String(input.email || '').toLowerCase()
      const userId = String(input.userId || '')
      const provider = String(input.provider || 'internal')
      const status = String(input.status || 'active')
      const period_start = input.period_start ? new Date(String(input.period_start)) : null
      const period_end = input.period_end ? new Date(String(input.period_end)) : null
      const billing_period = String(input.billing_period || 'monthly').toLowerCase()
      let uid = userId
      if (!uid && email) {
        const u = await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email])
        uid = u.rows[0]?.id || ''
      }
      if (!uid) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_user' })); return }
      let r
      if (id) {
        r = await getPool().query('update public.user_subscriptions set provider=$1, status=$2, period_start=$3, period_end=$4, billing_period=$5 where id=$6 returning id,user_id,provider,status,period_start,period_end,billing_period', [provider, status, period_start, period_end, billing_period, id])
      } else {
        const newId = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID())
        r = await getPool().query('insert into public.user_subscriptions(id,user_id,provider,status,period_start,period_end,billing_period) values($1,$2,$3,$4,$5,$6,$7) returning id,user_id,provider,status,period_start,period_end,billing_period', [newId, uid, provider, status, period_start, period_end, billing_period])
      }
      out = { subscription: r.rows[0] || null }
    } 
    else if (action === 'subscriptions_delete') {
      const id = String(input.id || '')
      if (!id) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_id' })); return }
      const r = await getPool().query('delete from public.user_subscriptions where id=$1 returning id', [id])
      out = { deleted: !!r.rows[0] }
    } 
    else if (action === 'org_subscriptions_update') {
      const orgId = String(input.orgId || '')
      const status = String(input.status || '').toLowerCase()
      const period_start = input.period_start ? new Date(String(input.period_start)) : null
      const period_end = input.period_end ? new Date(String(input.period_end)) : null
      const billing_period = String(input.billing_period || 'monthly').toLowerCase()
      const allow = new Set(['active','paused','canceled','pending','overdue'])
      if (!orgId || !allow.has(status)) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_input' })); return }
      const r = await getPool().query('update public.org_subscriptions set status=$1, period_start=$2, period_end=$3, billing_period=$4 where org_id=$5 returning org_id,provider,status,period_start,period_end,billing_period', [status, period_start, period_end, billing_period, orgId])
      out = { org_subscription: r.rows[0] || null }
    } 
    else if (action === 'org_subscriptions_upsert') {
      const orgId = String(input.orgId || '')
      const provider = String(input.provider || 'internal')
      const status = String(input.status || 'active')
      const period_start = input.period_start ? new Date(String(input.period_start)) : null
      const period_end = input.period_end ? new Date(String(input.period_end)) : null
      const billing_period = String(input.billing_period || 'monthly').toLowerCase()
      if (!orgId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_org' })); return }
      const r = await getPool().query(
        `insert into public.org_subscriptions(org_id,provider,status,period_start,period_end,billing_period)
         values($1,$2,$3,$4,$5,$6)
         on conflict (org_id) do update set provider=excluded.provider, status=excluded.status, period_start=excluded.period_start, period_end=excluded.period_end, billing_period=excluded.billing_period
         returning org_id,provider,status,period_start,period_end,billing_period`,
        [orgId, provider, status, period_start, period_end, billing_period]
      )
      out = { org_subscription: r.rows[0] || null }
    } 
    else if (action === 'org_subscriptions_delete') {
      const orgId = String(input.orgId || '')
      if (!orgId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_org' })); return }
      const r = await getPool().query('delete from public.org_subscriptions where org_id=$1 returning org_id', [orgId])
      out = { deleted: !!r.rows[0] }
    } 
    else if (action === 'profiles_update') {
      const userId = String(input.userId || '')
      const planId = input.planId !== undefined ? String(input.planId || '') : undefined
      const businessProfile = input.businessProfile !== undefined ? String(input.businessProfile || 'pessoal') : undefined

      if (!userId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_input' })); return }

      if (planId !== undefined) {
        if (!planId) {
          await getPool().query('insert into public.profiles(user_id, plan_id) values($1, null) on conflict (user_id) do update set plan_id=null', [userId])
        } else {
          await getPool().query('insert into public.profiles(user_id, plan_id) values($1,$2) on conflict (user_id) do update set plan_id=excluded.plan_id', [userId, planId])
          // Fetch admin status first (needed for both org_subscriptions and user_subscriptions)
          const adminRow = await getPool().query('select is_admin from public.auth_users where id=$1', [userId])
          const isAdmin = !!adminRow.rows[0]?.is_admin
          const pOrg = await getPool().query('select org_id from public.profiles where user_id=$1', [userId])
          const orgId = pOrg.rows[0]?.org_id
          if (orgId) {
            await getPool().query('update public.organizations set plan_id=$1 where id=$2', [planId, orgId])
            // Determine tier for org_subscriptions
            const planTierRow = await getPool().query('select tier from public.plans where id=$1', [planId])
            const planTier = String(planTierRow.rows[0]?.tier || 'starter').toLowerCase()
            // Sync org_subscriptions so bootstrap reads correct tier (not trial)
            await getPool().query(`
              insert into public.org_subscriptions(org_id, provider, status, billing_period, requested_tier, period_start, period_end)
              values($1, 'internal', 'active', 'internal', $2, now(), ${isAdmin ? 'null' : "now() + interval '30 days'"})
              on conflict (org_id) do update set
                status = 'active',
                billing_period = 'internal',
                requested_tier = excluded.requested_tier,
                period_start = now(),
                period_end = ${isAdmin ? 'null' : "now() + interval '30 days'"}
            `, [orgId, planTier])
          }
          const ex = await getPool().query("select id, period_start from public.user_subscriptions where user_id=$1 and provider='internal' order by coalesce(period_start, period_end) desc nulls last limit 1", [userId])
          if (ex.rows[0]?.id) {
            if (isAdmin) {
              await getPool().query("update public.user_subscriptions set status='active', period_start=coalesce(period_start, now()), period_end=null where id=$1", [ex.rows[0].id])
            } else {
              await getPool().query("update public.user_subscriptions set status='active', period_start=coalesce(period_start, now()), period_end=(coalesce(period_start, now()) + interval '30 days') where id=$1", [ex.rows[0].id])
            }
          } else {
            if (isAdmin) {
              await getPool().query("insert into public.user_subscriptions(user_id, provider, status, period_start, period_end) values($1,'internal','active', now(), null)", [userId])
            } else {
              await getPool().query("insert into public.user_subscriptions(user_id, provider, status, period_start, period_end) values($1,'internal','active', now(), now() + interval '30 days')", [userId])
            }
          }
        }
      }

      if (businessProfile !== undefined) {
        await getPool().query('insert into public.profiles(user_id, business_profile) values($1,$2) on conflict (user_id) do update set business_profile=excluded.business_profile', [userId, businessProfile])
      }

      const r = await getPool().query('select user_id, plan_id, business_profile from public.profiles where user_id=$1', [userId])
      out = { profile: r.rows[0] || null, ok: true }
    } 
    else if (action === 'profiles_delete') {
      const userId = String(input.userId || '')
      const email = String(input.email || '').toLowerCase()
      let uid = userId
      if (!uid && email) {
        const u = await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email])
        uid = u.rows[0]?.id || ''
      }
      if (!uid) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_user' })); return }
      await getPool().query('delete from public.profiles where user_id=$1', [uid])
      out = { deleted: true }
    } 
    else if (action === 'orgs_upsert') {
      const id = String(input.id || '')
      const name = String(input.name || '').trim()
      const seats = Number(input.seats ?? 1)
      const planId = String(input.planId || '')
      if (!name) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_input' })); return }
      let r
      if (id) {
        r = await getPool().query('update public.organizations set name=$1, seats=$2, plan_id=$3 where id=$4 returning id,name,seats,plan_id', [name, seats, planId || null, id])
      } else {
        const genId = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID())
        r = await getPool().query('insert into public.organizations(id,name,seats,plan_id) values($1,$2,$3,$4) returning id,name,seats,plan_id', [genId, name, seats, planId || null])
      }
      try {
        const org = (r.rows[0] || null)
        const txid = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID())
        const userId = auth.userId || ''
        if (org && org.id && userId) {
          await getPool().query('insert into public.usage_ledger(user_id, org_id, ts, type, amount, tx_id) values($1,$2,now(),$3,$4,$5) on conflict (tx_id) do nothing', [userId, org.id, 'admin_org_upsert', 0, txid])
        }
      } catch {}
      out = { organization: r.rows[0] || null }
    } 
    else if (action === 'orgs_delete') {
      const id = String(input.id || '')
      if (!id) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_id' })); return }
      await getPool().query('update public.profiles set org_id=null where org_id=$1', [id])
      const r = await getPool().query('delete from public.organizations where id=$1 returning id,name', [id])
      out = { organization: r.rows[0] || null }
    } 
    else if (action === 'org_members') {
      const orgId = String(input.orgId || url.searchParams.get('orgId') || '')
      if (!orgId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_org' })); return }
      const mr = await getPool().query(`
        select m.id, m.org_id, m.user_id, m.role, u.email
        from public.org_members m
        left join public.auth_users u on u.id = m.user_id
        where m.org_id=$1
        order by lower(u.email) asc
      `, [orgId])
      out = { members: mr.rows }
    } 
    else if (action === 'org_members_update') {
      const orgId = String(input.orgId || '')
      const email = String(input.email || '').toLowerCase()
      const userId = String(input.userId || '')
      const role = String(input.role || 'member')
      const op = String(input.op || '').toLowerCase()
      if (!orgId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_org' })); return }
      const uidRow = userId ? { id: userId } : (await getPool().query('select id from public.auth_users where lower(email)=lower($1)', [email])).rows[0]
      const uid = uidRow?.id
      if (!uid) { res.statusCode = 404; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'user_not_found' })); return }
      let r
      if (op === 'add') {
        r = await getPool().query('insert into public.org_members(id,org_id,user_id,role) values($1,$2,$3,$4) on conflict (org_id,user_id) do update set role=excluded.role returning id,org_id,user_id,role', [(globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID()), orgId, uid, role])
      } else if (op === 'remove') {
        r = await getPool().query('delete from public.org_members where org_id=$1 and user_id=$2 returning id,org_id,user_id,role', [orgId, uid])
      } else if (op === 'change_role') {
        r = await getPool().query('update public.org_members set role=$1 where org_id=$2 and user_id=$3 returning id,org_id,user_id,role', [role, orgId, uid])
      } else {
        res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_action' })); return
      }
      out = { member: r.rows[0] || null }
    } 
    else if (action === 'org_cost_centers') {
      const orgId = String(input.orgId || url.searchParams.get('orgId') || '')
      if (!orgId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_org' })); return }
      const r = await getPool().query('select id, name, code from public.cost_centers where org_id=$1 order by name asc', [orgId])
      out = { cost_centers: r.rows }
    } 
    else if (action === 'org_member_permissions') {
      const orgId = String(input.orgId || url.searchParams.get('orgId') || '')
      const userId = String(input.userId || url.searchParams.get('userId') || '')
      if (!orgId || !userId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_params' })); return }
      const r = await getPool().query('select id, cost_center_id, role from public.cost_center_permissions where org_id=$1 and user_id=$2', [orgId, userId])
      out = { permissions: r.rows }
    } 
    else if (action === 'org_member_permissions_update') {
      const orgId = String(input.orgId || '')
      const userId = String(input.userId || '')
      const costCenterId = String(input.costCenterId || '')
      const role = String(input.role || '')
      if (!orgId || !userId || !costCenterId) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing_params' })); return }
      if (role === 'none') {
        await getPool().query('delete from public.cost_center_permissions where org_id=$1 and user_id=$2 and cost_center_id=$3', [orgId, userId, costCenterId])
        out = { status: 'deleted' }
      } else {
        const r = await getPool().query(`
          insert into public.cost_center_permissions (org_id, user_id, cost_center_id, role)
          values ($1, $2, $3, $4)
          on conflict (user_id, cost_center_id) 
          do update set role = excluded.role
          returning id, role
        `, [orgId, userId, costCenterId, role])
        out = { permission: r.rows[0] }
      }
    } 
    else if (action === 'admin_list_tickets') {
      const r = await getPool().query(`
        select t.id, t.subject, t.status, t.category, t.created_at, u.email
        from public.support_tickets t
        left join public.auth_users u on u.id = t.user_id
        order by t.created_at desc
      `)
      out = { tickets: r.rows }
    }
    else if (action === 'admin_get_ticket') {
      const { ticketId } = input
      if (!ticketId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return }
      const t = await getPool().query(`
        select t.id, t.subject, t.status, t.category, t.created_at, u.email
        from public.support_tickets t
        left join public.auth_users u on u.id = t.user_id
        where t.id=$1
      `, [ticketId])
      if (!t.rows[0]) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return }
      const m = await getPool().query('select id, user_id, message, is_admin_reply, created_at from public.ticket_messages where ticket_id=$1 order by created_at asc', [ticketId])
      out = { ticket: t.rows[0], messages: m.rows }
    }
    else if (action === 'admin_reply_ticket') {
      const { ticketId, message, status } = input
      if (!ticketId || !message) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_input' })); return }
      await getPool().query('insert into public.ticket_messages(ticket_id, user_id, message, is_admin_reply) values($1, $2, $3, true)', [ticketId, auth.userId, message])
      await getPool().query('update public.support_tickets set status=$1 where id=$2', [status || 'pending', ticketId])
      out = { ok: true }
    }
    else if (action === 'admin_list_features') {
      const r = await getPool().query(`
        select f.id, f.title, f.description, f.status, f.created_at, u.email,
        (select count(*)::int from public.feature_upvotes where request_id = f.id) as upvotes
        from public.feature_requests f
        left join public.auth_users u on u.id = f.user_id
        order by upvotes desc, f.created_at desc
      `)
      out = { features: r.rows }
    }
    else if (action === 'admin_update_feature') {
      const { requestId, status } = input
      if (!requestId || !status) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_input' })); return }
      await getPool().query('update public.feature_requests set status=$1 where id=$2', [status, requestId])
      out = { ok: true }
    }
    else {
      res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'unknown_action' })); return
    }

    res.statusCode = 200
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify(out))
  } catch (e: any) {
    res.statusCode = 500
    res.setHeader('content-type','application/json')
    res.end(JSON.stringify({ error: e?.message || 'error' }))
  }
}
