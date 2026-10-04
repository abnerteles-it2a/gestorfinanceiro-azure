import assert from 'node:assert/strict';
import { financialSnapshot } from './_financial';
let call:any;
const db={async query(sql:string,params:any[]=[]){call={sql,params};return {rows:[{snapshot:{accounts:[{id:'account',balance:130}],totals:{income:150,expense:20,transfers:10},period:{startDate:'2026-03-01',endDate:'2026-04-01',income:150,expense:20},transactionCount:201}}]};}};
const result=await financialSnapshot(db,{userId:'user',orgId:'org',allowedCCs:[]},{startDate:'2026-03-01',endDate:'2026-04-01'});
assert.equal(result.transactionCount,201);assert.deepEqual(result.accounts,[{id:'account',balance:130}]);
assert.match(call.sql,/to_account_id/);assert.match(call.sql,/initial_balance/);assert.match(call.sql,/date < /);assert.match(call.sql,/1=0/);assert.doesNotMatch(call.sql,/limit 100/i);assert.ok(call.params.includes('org'));
await assert.rejects(()=>financialSnapshot(db,{userId:'user',orgId:null},{startDate:'bad',endDate:'2026-01-01'}),/invalid_date_range/);
console.log('financial snapshot tests passed');
