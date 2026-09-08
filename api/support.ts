import { Pool } from 'pg'
import { jwtVerify } from 'jose'
import { verifySession } from './_auth_shared'

let pool: Pool | null = null;

const getPool = () => {
  const g: any = globalThis as any;
  if (g.__gf_pg_pool) return g.__gf_pg_pool as Pool;
  if (pool) return pool;
  const rawConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const connectionString = rawConnectionString ? rawConnectionString.replace('?sslmode=require', '') : rawConnectionString;
  const max = (() => {
    const v = Number(process.env.PG_POOL_MAX || 2);
    return Number.isFinite(v) ? Math.max(1, Math.min(10, v)) : 2;
  })();
  const idleTimeoutMillis = (() => {
    const v = Number(process.env.PG_IDLE_TIMEOUT_MS || 15000);
    return Number.isFinite(v) ? Math.max(1000, v) : 15000;
  })();
  const connectionTimeoutMillis = (() => {
    const v = Number(process.env.PG_CONN_TIMEOUT_MS || 3000);
    return Number.isFinite(v) ? Math.max(500, v) : 3000;
  })();
  pool = new Pool({
    connectionString,
    max,
    idleTimeoutMillis,
    connectionTimeoutMillis,
    ssl: { rejectUnauthorized: false }
  });
  pool.on('connect', (client) => {
    client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
  });
  g.__gf_pg_pool = pool;
  return pool;
};


const readJsonBody = async (req: any): Promise<any> => {
  if (req.body) return req.body;
  let body = ''
  await new Promise<void>((resolve) => { req.on('data', (c: any) => { body += c }); req.on('end', resolve) })
  return body ? JSON.parse(body) : {}
}

const requireAuth = async (req: any, res: any): Promise<string | null> => {
  // Auth Check (Enforcing Single-Session Compliance)
  const result = await verifySession(req, res, getPool());
  if (!result) return null;
  return result.userId;
}

export default async function handler(req: any, res: any) {
  try {
    const method = String(req.method || 'GET').toUpperCase()
    const input = method === 'GET' ? { action: new URL(req.url, 'http://localhost').searchParams.get('action') } : await readJsonBody(req)
    const action = String(input.action || '').toLowerCase()
    
    const userId = await requireAuth(req, res)
    if (!userId) return

    let out: any = {}
    const db = getPool();

    if (action === 'list_user_tickets') {
      const r = await db.query(
        `select 
           t.id, t.subject, t.status, t.category, t.created_at,
           m.created_at as last_message_at,
           coalesce(m.is_admin_reply, false) as last_message_is_admin_reply
         from public.support_tickets t
         left join lateral (
           select created_at, is_admin_reply
           from public.ticket_messages
           where ticket_id = t.id
           order by created_at desc
           limit 1
         ) m on true
         where t.user_id=$1
         order by coalesce(m.created_at, t.created_at) desc`,
        [userId]
      )
      out = { tickets: r.rows }
    } 
    else if (action === 'create_ticket') {
      const { subject, category, message } = input
      if (!subject || !message) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_input' })); return }
      
      const t = await db.query('insert into public.support_tickets(user_id, subject, category) values($1, $2, $3) returning id', [userId, subject, category || 'other'])
      const ticketId = t.rows[0].id
      await db.query('insert into public.ticket_messages(ticket_id, user_id, message) values($1, $2, $3)', [ticketId, userId, message])
      
      out = { ticketId, ok: true }
    }
    else if (action === 'get_ticket_details') {
      const { ticketId } = input
      if (!ticketId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return }
      
      const t = await db.query('select id, subject, status, category, created_at from public.support_tickets where id=$1 and user_id=$2', [ticketId, userId])
      if (!t.rows[0]) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return }
      
      const m = await db.query('select id, user_id, message, is_admin_reply, created_at from public.ticket_messages where ticket_id=$1 order by created_at asc', [ticketId])
      out = { ticket: t.rows[0], messages: m.rows }
    }
    else if (action === 'add_message') {
      const { ticketId, message } = input
      if (!ticketId || !message) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_input' })); return }
      
      // Ensure ticket belongs to user and is not closed
      const t = await db.query('select status from public.support_tickets where id=$1 and user_id=$2', [ticketId, userId])
      if (!t.rows[0]) { res.statusCode = 404; res.end(JSON.stringify({ error: 'not_found' })); return }
      if (t.rows[0].status === 'closed') { res.statusCode = 400; res.end(JSON.stringify({ error: 'ticket_closed' })); return }
      
      await db.query('insert into public.ticket_messages(ticket_id, user_id, message) values($1, $2, $3)', [ticketId, userId, message])
      await db.query("update public.support_tickets set status='open' where id=$1", [ticketId]) // Re-open if it was pending
      out = { ok: true }
    }
    else if (action === 'list_features') {
      const r = await db.query(`
        select 
          f.id, f.title, f.description, f.status, f.created_at,
          (select count(*)::int from public.feature_upvotes where request_id = f.id) as upvotes,
          exists(select 1 from public.feature_upvotes where request_id = f.id and user_id = $1) as my_vote
        from public.feature_requests f
        order by upvotes desc, f.created_at desc
      `, [userId])
      out = { features: r.rows }
    }
    else if (action === 'create_feature') {
      const { title, description } = input
      if (!title) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_title' })); return }
      await db.query('insert into public.feature_requests(user_id, title, description) values($1, $2, $3)', [userId, title, description])
      out = { ok: true }
    }
    else if (action === 'toggle_upvote') {
      const { requestId } = input
      if (!requestId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'missing_id' })); return }
      
      const ex = await db.query('select 1 from public.feature_upvotes where request_id=$1 and user_id=$2', [requestId, userId])
      if (ex.rows[0]) {
        await db.query('delete from public.feature_upvotes where request_id=$1 and user_id=$2', [requestId, userId])
        out = { voted: false }
      } else {
        await db.query('insert into public.feature_upvotes(request_id, user_id) values($1, $2)', [requestId, userId])
        out = { voted: true }
      }
    }
    else {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'unknown_action' })); return
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
