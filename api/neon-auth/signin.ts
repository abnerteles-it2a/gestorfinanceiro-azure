import { Pool } from 'pg';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { requireJwtSecret, ServiceConfigurationError } from '../_config';

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
    const input = req.body || {};
    const email = String(input.email || '').trim().toLowerCase();
    const password = String(input.password || '');
    const force = !!input.force;
    if (!email || !password) { res.statusCode = 400; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'missing email/password' })); return; }
    if (isNoDb()) {
      // ...
    }
    
    const start = Date.now();
    const r = await getPool().query('select id,email,password_hash,is_admin,email_verified from public.auth_users where email=$1', [email]);
    console.log(`[Signin] DB Query for user took ${Date.now() - start}ms`);
    
    const row = r.rows[0];
    if (!row) { 
      console.log('Signin: User not found:', email);
      res.statusCode = 401; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_credentials', debug: 'User not found' })); return; 
    }

    if (row.email_verified === false) {
      console.log('Signin: Email not verified:', email);
      res.statusCode = 403;
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ error: 'email_not_verified', details: 'Por favor, verifique seu e-mail antes de fazer login.' }));
      return;
    }
    
    const bcryptStart = Date.now();
    const ok = await bcrypt.compare(password, row.password_hash);
    console.log(`[Signin] Bcrypt compare took ${Date.now() - bcryptStart}ms`);
    
    if (!ok) { 
      console.log('Signin: Password mismatch for:', email);
      res.statusCode = 401; res.setHeader('content-type','application/json'); res.end(JSON.stringify({ error: 'invalid_credentials', debug: 'Password mismatch' })); return; 
    }
    
    const sessionStart = Date.now();

    // Check for existing active session
    const existingSession = await getPool().query(
      'SELECT jti, last_seen FROM public.auth_sessions WHERE user_id = $1',
      [row.id]
    );

    if (existingSession.rows.length > 0 && !force) {
      // Active session exists and user did not request force-takeover
      const lastSeen = existingSession.rows[0]?.last_seen;
      const minutesAgo = lastSeen
        ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 60000)
        : null;
      res.statusCode = 409;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        error: 'already_logged',
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
        minutesAgo
      }));
      return;
    }

    // SINGLE-SESSION ENFORCEMENT: delete ALL previous sessions for this user before creating new one.
    await getPool().query('DELETE FROM public.auth_sessions WHERE user_id = $1', [row.id]);

    const jti = (globalThis.crypto?.randomUUID?.() || require('crypto').randomUUID());
    // Insert the single active session for this user
    await getPool().query(`
        INSERT INTO public.auth_sessions (user_id, jti, created_at, updated_at, last_seen)
        VALUES ($1, $2, now(), now(), now())
    `, [row.id, jti]);
    console.log(`[Signin] Session creation took ${Date.now() - sessionStart}ms`);

    const jwtStart = Date.now();
    const jwt = await new SignJWT({ sub: row.id, email: row.email, admin: !!row.is_admin })
        .setJti(jti)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(new TextEncoder().encode(requireJwtSecret()));
    console.log(`[Signin] JWT Signing took ${Date.now() - jwtStart}ms`);

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ token: jwt, user: { id: row.id, email: row.email, isAdmin: !!row.is_admin } }));
    console.log(`[Signin] Total signin process took ${Date.now() - start}ms`);
    return;
  } catch (e: any) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify({ error: e instanceof ServiceConfigurationError ? 'service_misconfigured' : 'error' }));
  }
}

