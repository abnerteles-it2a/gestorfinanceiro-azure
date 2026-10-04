import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveAIReadScope } from './_scope';

const userId = 'user-1';
test('cost-center permissions are resolved for the authorized organization, not all user grants', async () => {
  let permissionSql = '';
  let permissionParams: any[] = [];
  const db = { query: async (sql: string, params?: any[]) => {
    if (sql.includes('profiles')) return { rows: [{ org_id: 'org-owned' }] };
    if (sql.includes('org_members')) return { rows: [{ role: 'member' }] };
    permissionSql = sql; permissionParams = params || []; return { rows: [] };
  }};
  await resolveAIReadScope(db, userId, 'organization');
  assert.match(permissionSql, /org_id=\$1 and user_id=\$2/);
  assert.deepEqual(permissionParams, ['org-owned', userId]);
});
test('organization profile alone does not authorize read access', async () => {
  const db = { query: async (sql: string) => ({ rows: sql.includes('profiles') ? [{ org_id: 'org-owned' }] : [] }) };
  await assert.rejects(resolveAIReadScope(db, userId, 'organization'), /organization_access_denied/);
});

test('members read only granted cost centers and general rows, with parameterized tenant scope', async () => {
  const db = { query: async (sql: string) => ({ rows: sql.includes('profiles') ? [{ org_id: 'org-owned' }] : sql.includes('org_members') ? [{ role: 'member' }] : [{ cost_center_id: 'cc-visible', role: 'viewer' }] }) };
  const scope = await resolveAIReadScope(db, userId, 'organization');
  assert.deepEqual(scope.allowedCCs, ['cc-visible']);
});
test('organization scope refuses a supplied tenant without membership, before financial reads', async () => {
  const calls: string[] = [];
  const db = { query: async (sql: string) => {
    calls.push(sql);
    if (sql.includes('profiles')) return { rows: [{ org_id: 'org-owned' }] };
    return { rows: [] };
  }};
  await assert.rejects(resolveAIReadScope(db, userId, 'organization', 'org-victim'), /organization_access_denied/);
  assert.equal(calls.some(sql => /transactions|accounts|payables/.test(sql)), false);
});
