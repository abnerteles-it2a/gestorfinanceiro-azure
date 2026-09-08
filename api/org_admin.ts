
import { IncomingMessage, ServerResponse } from 'http';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { verifySession } from './_auth_shared';

// Use environment variables for connection — lazy init to ensure env vars are loaded
let _pool: Pool | null = null;
const getPool = (): Pool => {
  if (!_pool) {
    const connectionString = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '').replace('?sslmode=require', '');
    _pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    _pool.on('connect', (client) => {
      client.query('SET client_encoding = "UTF8"').catch(e => console.error('Failed to set client_encoding:', e));
    });
    console.log('[OrgAdmin] Pool initialized. DB URL prefix:', connectionString.slice(0, 30) + '...');
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
    console.log(`[OrgAdmin] Request: ${req.method} ${req.url}`);

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') {
        res.statusCode = 200;
        res.end();
        return;
    }

    // Auth Check (Enforcing Single-Session Compliance)
    const result = await verifySession(req, res, getPool());
    if (!result) return;
    const { userId } = result;

    // Check if user is Org Admin
    const profileRes = await getPool().query('SELECT org_id, is_admin FROM public.profiles WHERE user_id=$1', [userId]);
    const profile = profileRes.rows[0];
    
    if (!profile || !profile.org_id) {
         console.log('[OrgAdmin] No org');
         res.statusCode = 403;
         res.end(JSON.stringify({ error: 'No organization found' }));
         return;
    }

    const orgId = profile.org_id;
    
    // Check if user is owner of the org or explicit admin
    const memberRes = await getPool().query('SELECT role FROM public.org_members WHERE org_id=$1 AND user_id=$2', [orgId, userId]);
    const memberRole = memberRes.rows[0]?.role;

    if (memberRole !== 'owner' && memberRole !== 'admin') {
        console.log('[OrgAdmin] Insufficient permissions');
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'Insufficient permissions' }));
        return;
    }

    if (req.method === 'POST') {
        const body = await getBody(req);
        const action = body.action;
        console.log(`[OrgAdmin] Action: ${action}`);

        if (action === 'invite_member') {
            try {
                const email = String(body.email || '').trim().toLowerCase();
                if (!email || !email.includes('@')) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Invalid email' }));
                    return;
                }

                // Check seat limit
                const orgRes = await getPool().query('SELECT seats FROM public.organizations WHERE id=$1', [orgId]);
                let seats = orgRes.rows[0]?.seats || 1;
                
                // Strict Block: Trial Pro only allows 1 user
                const subRes = await getPool().query('SELECT billing_period FROM public.org_subscriptions WHERE org_id=$1', [orgId]);
                if (subRes.rows[0]?.billing_period === 'trial') {
                    seats = 1;
                }

                const membersCountRes = await getPool().query('SELECT count(*) as count FROM public.org_members WHERE org_id=$1', [orgId]);
                const currentMembers = parseInt(membersCountRes.rows[0]?.count || '0');

                if (currentMembers >= seats) {
                    res.statusCode = 403;
                    res.end(JSON.stringify({ error: 'Seat limit reached' }));
                    return;
                }

                // Create invite
                const token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).substring(2)) + Date.now().toString(36);
                
                await getPool().query(
                    `INSERT INTO public.org_invites (org_id, email, role, token, invited_by, status)
                     VALUES ($1, $2, $3, $4, $5, 'pending')
                     ON CONFLICT (email, org_id) WHERE status = 'pending'
                     DO UPDATE SET token = $4, created_at = NOW(), expires_at = (NOW() + interval '7 days')`,
                    [orgId, email, 'member', token, userId]
                );

                // In a real app, we would send an email here.
                // For now, we return the token so it can be displayed or logged.
                console.log(`[OrgAdmin] Invite created for ${email}, token: ${token}`);

                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', message: 'Invite sent', token }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error inviting member:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'create_member_direct') {
            try {
                const email = String(body.email || '').trim().toLowerCase();
                const name = String(body.name || '').trim();
                const password = String(body.password || '');
                const role = String(body.role || 'member'); // member or admin

                if (!email || !name || !password) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing fields' }));
                    return;
                }

                if (!email.includes('@')) {
                     res.statusCode = 400;
                     res.end(JSON.stringify({ error: 'Invalid email' }));
                     return;
                }

                // Check seat limit
                const orgRes = await getPool().query('SELECT seats, plan_id FROM public.organizations WHERE id=$1', [orgId]);
                let seats = orgRes.rows[0]?.seats || 1;
                const orgPlanId = orgRes.rows[0]?.plan_id;
                
                // Strict Block: Trial Pro only allows 1 user
                const subRes = await getPool().query('SELECT billing_period FROM public.org_subscriptions WHERE org_id=$1', [orgId]);
                if (subRes.rows[0]?.billing_period === 'trial') {
                    seats = 1;
                }

                const membersCountRes = await getPool().query('SELECT count(*) as count FROM public.org_members WHERE org_id=$1', [orgId]);
                const currentMembers = parseInt(membersCountRes.rows[0]?.count || '0');

                if (currentMembers >= seats) {
                    res.statusCode = 403;
                    res.end(JSON.stringify({ error: subRes.rows[0]?.billing_period === 'trial' ? 'A criação de novos usuários corporativos só é liberada após a assinatura efetiva do plano Pro.' : 'Seat limit reached' }));
                    return;
                }

                // Check if user exists
                const userCheck = await getPool().query('SELECT id FROM public.auth_users WHERE email=$1', [email]);
                if (userCheck.rows.length > 0) {
                    res.statusCode = 409;
                    res.end(JSON.stringify({ error: 'User already exists. Please use Invite Member instead.' }));
                    return;
                }

                // Create User
                const userId = crypto.randomUUID();
                const hash = await bcrypt.hash(password, 10);
                
                await getPool().query('INSERT INTO public.auth_users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, email, hash]);
                
                // Create Profile (linked to Org)
                await getPool().query(
                    'INSERT INTO public.profiles (user_id, org_id, plan_id, is_admin, full_name) VALUES ($1, $2, $3, $4, $5)', 
                    [userId, orgId, orgPlanId, false, name]
                );

                // Add to Org Members
                await getPool().query(
                    'INSERT INTO public.org_members (id, org_id, user_id, role) VALUES ($1, $2, $3, $4)',
                    [crypto.randomUUID(), orgId, userId, role]
                );

                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', message: 'User created and added to organization' }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error creating member:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'remove_member') {
            try {
                const { user_id } = body;
                if (!user_id) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing user_id' }));
                    return;
                }

                if (user_id === userId) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Cannot remove yourself' }));
                    return;
                }

                await getPool().query('DELETE FROM public.org_members WHERE org_id=$1 AND user_id=$2', [orgId, user_id]);
                // Also remove from profiles
                await getPool().query('UPDATE public.profiles SET org_id=NULL WHERE user_id=$1 AND org_id=$2', [user_id, orgId]);

                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error removing member:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }
        
        if (action === 'change_member_password') {
            try {
                const { user_id, password } = body;
                if (!user_id || !password) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing fields' }));
                    return;
                }

                // Verify the user belongs to the same org
                const check = await getPool().query('SELECT user_id FROM public.org_members WHERE org_id=$1 AND user_id=$2', [orgId, user_id]);
                if (check.rows.length === 0) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'User not found in this organization' }));
                    return;
                }

                // Hash and Update
                const hash = await bcrypt.hash(password, 10);
                await getPool().query('UPDATE public.auth_users SET password_hash=$1 WHERE id=$2', [hash, user_id]);
                
                // Invalidate sessions
                await getPool().query('DELETE FROM public.auth_sessions WHERE user_id=$1', [user_id]);

                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', message: 'Password updated' }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error changing member password:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
            return;
        }

        if (action === 'update_role') {
            try {
                const { user_id, role } = body;
                if (!user_id || !role) {
                     res.statusCode = 400;
                     res.end(JSON.stringify({ error: 'Missing fields' }));
                     return;
                }
                
                if (user_id === userId) {
                     res.statusCode = 400;
                     res.end(JSON.stringify({ error: 'Cannot change your own role' }));
                     return;
                }

                await getPool().query('UPDATE public.org_members SET role=$1 WHERE org_id=$2 AND user_id=$3', [role, orgId, user_id]);
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (error: any) {
                 console.error('[OrgAdmin] Error updating role:', error);
                 res.statusCode = 500;
                 res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'list_members') {
            try {
                const result = await getPool().query(`
                    SELECT m.id, m.user_id, m.role, u.email, m.role, u.created_at as joined_at, p.full_name
                    FROM public.org_members m
                    JOIN public.auth_users u ON m.user_id = u.id
                    LEFT JOIN public.profiles p ON m.user_id = p.user_id
                    WHERE m.org_id = $1
                    ORDER BY u.email
                `, [orgId]);
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', members: result.rows }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error listing members:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'create_org_cost_center') {
            try {
                const { name } = body;
                if (!name) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing name' }));
                    return;
                }

                const id = crypto.randomUUID();
                // Create CC attached to Org and User (Admin)
                // We use the admin's user_id as creator, but org_id is key.
                const result = await getPool().query(
                    'INSERT INTO public.cost_centers (id, user_id, name, org_id) VALUES ($1, $2, $3, $4) RETURNING *',
                    [id, userId, name, orgId]
                );
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', cost_center: result.rows[0], data: result.rows[0] }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error creating cost center:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'delete_org_cost_center') {
            try {
                const { id } = body;
                if (!id) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing id' }));
                    return;
                }

                // Verify it belongs to org
                const result = await getPool().query(
                    'DELETE FROM public.cost_centers WHERE id = $1 AND org_id = $2 RETURNING id',
                    [id, orgId]
                );

                if (result.rowCount === 0) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'Cost center not found or not in organization' }));
                    return;
                }
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error deleting cost center:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'list_org_cost_centers') {
            try {
                // List all cost centers for the org
                const result = await getPool().query(
                    'SELECT * FROM public.cost_centers WHERE org_id = $1 ORDER BY name',
                    [orgId]
                );
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', cost_centers: result.rows, data: result.rows }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error listing cost centers:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'get_user_permissions') {
            try {
                const targetUserId = String(body.target_user_id || body.user_id || '').trim();
                if (!targetUserId) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing target_user_id' }));
                    return;
                }

                const result = await getPool().query(
                    `SELECT ccp.*, cc.name as cost_center_name 
                     FROM public.cost_center_permissions ccp
                     JOIN public.cost_centers cc ON ccp.cost_center_id = cc.id
                     WHERE ccp.user_id = $1 AND ccp.org_id = $2`,
                    [targetUserId, orgId]
                );
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok', permissions: result.rows, data: result.rows }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error getting permissions:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'update_permission') {
            try {
                const targetUserId = String(body.target_user_id || body.user_id || '').trim();
                const costCenterId = String(body.cost_center_id || '').trim();
                const permissionLevel = String(body.permission_level || body.role || '').trim();
                // permission_level: 'viewer', 'editor', 'manager', or 'none' (to remove)

                if (!targetUserId || !costCenterId || !permissionLevel) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing fields' }));
                    return;
                }

                // Verify cost center belongs to org
                const ccCheck = await getPool().query('SELECT id FROM public.cost_centers WHERE id=$1 AND org_id=$2', [costCenterId, orgId]);
                if (ccCheck.rowCount === 0) {
                    res.statusCode = 404;
                    res.end(JSON.stringify({ error: 'Cost center not found in organization' }));
                    return;
                }

                if (permissionLevel === 'none') {
                    await getPool().query(
                        'DELETE FROM public.cost_center_permissions WHERE user_id=$1 AND cost_center_id=$2 AND org_id=$3',
                        [targetUserId, costCenterId, orgId]
                    );
                } else {
                    // Upsert permission
                    await getPool().query(
                        `INSERT INTO public.cost_center_permissions (user_id, cost_center_id, role, org_id)
                         VALUES ($1, $2, $3, $4)
                         ON CONFLICT (user_id, cost_center_id) 
                         DO UPDATE SET role = $3`,
                        [targetUserId, costCenterId, permissionLevel, orgId]
                    );
                }
                
                res.statusCode = 200;
                res.end(JSON.stringify({ status: 'ok' }));
            } catch (error: any) {
                console.error('[OrgAdmin] Error updating permission:', error);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Internal server error', details: error.message }));
            }
            return;
        }

        if (action === 'test') {
             res.statusCode = 200;
             res.end(JSON.stringify({ status: 'ok', message: 'Hello from Org Admin' }));
             return;
        }

        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Unknown action' }));
        return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Method not allowed' }));
}
