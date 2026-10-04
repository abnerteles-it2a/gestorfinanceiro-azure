export interface ScopeDatabase {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

export async function resolveAIReadScope(db: ScopeDatabase, userId: string, viewMode: unknown, requestedOrgId?: unknown) {
  const organization = viewMode === 'organization' || viewMode === 'corporate';
  if (!organization) return { userId, orgId: null, role: null, allowedCCs: [] as string[] };
  const profile = await db.query('select org_id from public.profiles where user_id=$1', [userId]);
  const orgId = profile.rows[0]?.org_id;
  if (!orgId || (requestedOrgId != null && requestedOrgId !== orgId)) throw new Error('organization_access_denied');
  const member = await db.query('select role from public.org_members where org_id=$1 and user_id=$2', [orgId, userId]);
  const role = member.rows[0]?.role;
  if (!['owner', 'admin', 'member'].includes(role)) throw new Error('organization_access_denied');
  const permissions = role === 'member'
    ? await db.query('select cost_center_id, role from public.cost_center_permissions where org_id=$1 and user_id=$2', [orgId, userId])
    : { rows: [] };
  const allowedCCs = permissions.rows.filter(p => ['viewer', 'editor', 'manager'].includes(p.role)).map(p => String(p.cost_center_id));
  const writableCCs = permissions.rows.filter(p => ['editor', 'manager'].includes(p.role)).map(p => String(p.cost_center_id));
  return { userId, orgId: String(orgId), role, allowedCCs, writableCCs };
}
