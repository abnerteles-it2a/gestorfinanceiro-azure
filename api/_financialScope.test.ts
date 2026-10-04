import assert from 'node:assert/strict';
import { resolveFinancialScope } from './_financial';
const db={async query(sql:string){return {rows:sql.includes('profiles')?[{org_id:'org'}]:sql.includes('org_members')?[]:[]};}};
await assert.rejects(()=>resolveFinancialScope(db,'user','organization'),/organization_access_denied/);
assert.deepEqual(await resolveFinancialScope(db,'user','personal'),{userId:'user',orgId:null,role:null,allowedCCs:undefined,editableCCs:undefined});
console.log('financial scope tests passed');
