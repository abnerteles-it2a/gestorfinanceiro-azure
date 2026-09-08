import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { requireJwtSecret, ServiceConfigurationError } from './_config';

/**
 * Shared Authentication and Session Validation Utility
 * Enforces Single-Session Compliance by verifying the JWT jti against the public.auth_sessions table.
 */

export async function verifySession(req: any, res: any, pool: Pool) {
    try {
        const auth = req.headers?.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        
        if (!token) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'unauthorized', reason: 'no_token' }));
            return null;
        }

        const secret = requireJwtSecret();
        const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
        
        const userId = String(payload?.sub || '');
        const jti = String(payload?.jti || '');

        if (!userId) {
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'unauthorized', reason: 'invalid_payload' }));
            return null;
        }

        // DATABASE SESSION VERIFICATION (Multi-session: verify specific JTI exists for this user)
        const sessionRes = await pool.query('select user_id, last_seen from public.auth_sessions where user_id=$1 AND jti=$2', [userId, jti]);
        const activeSession = sessionRes.rows[0];

        if (!activeSession) {
            console.warn(`Auth: No active session for user ${userId} with JTI ${jti}`);
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'unauthorized', reason: 'session_invalid' }));
            return null;
        }

        // Inactivity timeout check (8 hours)
        const lastSeen = activeSession?.last_seen ? new Date(activeSession.last_seen).getTime() : Date.now();
        const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000; // 8 hours
        if (Date.now() - lastSeen > INACTIVITY_LIMIT_MS) {
            console.warn(`Auth: Session expired due to inactivity for user ${userId}.`);
            // Invalidate this specific session only
            await pool.query('DELETE FROM public.auth_sessions WHERE user_id=$1 AND jti=$2', [userId, jti]);
            res.statusCode = 401;
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify({ error: 'unauthorized', reason: 'session_expired' }));
            return null;
        }

        // Update last seen (Heartbeat) — update specific session row
        await pool.query('UPDATE public.auth_sessions SET last_seen=now() WHERE user_id=$1 AND jti=$2', [userId, jti]);

        return { userId, payload };
    } catch (err: any) {
        console.error('Auth Shared Verification Error:', err.message);
        res.setHeader('content-type', 'application/json');
        if (err instanceof ServiceConfigurationError) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'service_misconfigured' }));
            return null;
        }
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'unauthorized', reason: err.code === 'ERR_JWT_EXPIRED' ? 'session_expired' : 'invalid_token' }));
        return null;
    }
}
