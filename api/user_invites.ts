import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { verifySession } from './_auth_shared';

// Lazy pool initialization � ensures env vars are loaded before first use
let _pool: Pool | null = null;
const getPool = (): Pool => {
  if (!_pool) {
    const cs = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").replace("?sslmode=require", "");
    _pool = new Pool({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    _pool.on("connect", (client) => { client.query(`SET client_encoding = "UTF8"`).catch(() => {}); });
  }
  return _pool;
};


const getBody = async (req: any): Promise<any> => {
    if (req.body) return req.body;
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (chunk: any) => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { resolve({}); }
        });
    });
};

export default async function handler(req: any, res: any) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    // 2. Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    // Get user email
    const userRes = await getPool().query('SELECT email FROM public.auth_users WHERE id=$1', [userId]);
    if (!userRes.rows[0]) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'User not found' }));
        return;
    }
    const userEmail = userRes.rows[0].email;
    console.log(`[UserInvites] Request from UserID: ${userId}, Email: ${userEmail}`);

    if (req.method === 'GET') {
        try {
            console.log(`[UserInvites] Querying invites for lower(${userEmail})...`);
            // Find pending invites for this email
            const invites = await getPool().query(`
                SELECT i.id, i.org_id, o.name as org_name, i.role, i.created_at, i.invited_by
                FROM public.org_invites i
                JOIN public.organizations o ON i.org_id = o.id
                WHERE LOWER(i.email) = LOWER($1) AND i.status = 'pending' AND i.expires_at > NOW()
            `, [userEmail]);
            
            console.log(`[UserInvites] Found ${invites.rows.length} invites.`);
            if (invites.rows.length > 0) {
                console.log('[UserInvites] First invite:', invites.rows[0]);
            }

            res.statusCode = 200;
            res.end(JSON.stringify({ status: 'ok', invites: invites.rows }));
        } catch (error: any) {
            console.error('[UserInvites] Error listing invites:', error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
        return;
    }

    if (req.method === 'POST') {
        const body = await getBody(req);
        const { action, invite_id } = body;

        if (!invite_id) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing invite_id' }));
            return;
        }

        if (action === 'accept') {
            try {
                // Verify invite
                const inviteRes = await getPool().query(`
                    SELECT * FROM public.org_invites 
                    WHERE id=$1 AND LOWER(email)=LOWER($2) AND status='pending' AND expires_at > NOW()
                `, [invite_id, userEmail]);

                const invite = inviteRes.rows[0];
                if (!invite) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'Invite not found or expired' }));
                    return;
                }

                // Check seats again just in case
                const orgRes = await getPool().query('SELECT seats FROM public.organizations WHERE id=$1', [invite.org_id]);
                const seats = orgRes.rows[0]?.seats || 1;
                const membersCountRes = await getPool().query('SELECT count(*) as count FROM public.org_members WHERE org_id=$1', [invite.org_id]);
                const currentMembers = parseInt(membersCountRes.rows[0]?.count || '0');

                if (currentMembers >= seats) {
                    res.statusCode = 403;
                    res.end(JSON.stringify({ error: 'Organization seat limit reached' }));
                    return;
                }

                // Add to org_members
                await getPool().query(`
                    INSERT INTO public.org_members (id, org_id, user_id, role)
                    VALUES (gen_random_uuid(), $1, $2, $3)
                    ON CONFLICT (org_id, user_id) DO NOTHING
                `, [invite.org_id, userId, invite.role]);

                // Update invite status
                await getPool().query('UPDATE public.org_invites SET status=\'accepted\' WHERE id=$1', [invite_id]);

                // Update profile (switch to new org)
                await getPool().query(`
                    UPDATE public.profiles 
                    SET org_id = $1 
                    WHERE user_id = $2
                `, [invite.org_id, userId]);

                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', message: 'Invite accepted' }));
            } catch (error: any) {
                console.error('[UserInvites] Error accepting invite:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
            return;
        }

        if (action === 'decline') {
            try {
                await getPool().query('UPDATE public.org_invites SET status=\'declined\' WHERE id=$1 AND LOWER(email)=LOWER($2)', [invite_id, userEmail]);
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', message: 'Invite declined' }));
            } catch (error: any) {
                console.error('[UserInvites] Error declining invite:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
            return;
        }

        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Unknown action' }));
        return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
}
