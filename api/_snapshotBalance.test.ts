import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { financialSnapshot } from './_financial';
// Run the production balance CTE in SQLite's SQL engine, without a network/database service.
const sqlDb=new DatabaseSync(':memory:');
sqlDb.exec("CREATE TABLE accounts(id TEXT,user_id TEXT,org_id TEXT,initial_balance NUMERIC); CREATE TABLE transactions(id TEXT,user_id TEXT,org_id TEXT,account_id TEXT,to_account_id TEXT,transaction_type TEXT,amount NUMERIC);");
sqlDb.exec("INSERT INTO accounts VALUES ('a','user',NULL,100),('b','user',NULL,20),('foreign','other',NULL,999); INSERT INTO transactions VALUES ('self','user',NULL,'a','a','Transferência',30),('transfer','user',NULL,'a','b','Transferência',10),('income','user',NULL,'a',NULL,'Entrada',5),('expense','user',NULL,'b',NULL,'Saída',2),('hidden','other',NULL,'a',NULL,'Entrada',999);");
let lastSql='';
const adapter={async query(sql:string,params:any[]=[]){
 lastSql=sql;
 const cte=sql.slice(0,sql.indexOf(') select jsonb_build_object('))+') select * from account_balances';
 const executable=cte.replaceAll('public.','').replace(/cost_center_id = any\((\$\d+)::uuid\[\]\)/g,'cost_center_id IN (SELECT value FROM json_each($1))');
 const bindings:Record<string,string>={};for(const match of executable.matchAll(/\$(\d+)/g)){const value=params[Number(match[1])-1];bindings[match[0]]=Array.isArray(value)?JSON.stringify(value):value;}
 const accounts=sqlDb.prepare(executable).all(bindings);
 return {rows:[{snapshot:{accounts}}]};
}};
const result=await financialSnapshot(adapter,{userId:'user',orgId:null});
assert.deepEqual(result.accounts.map((a:any)=>({id:a.id,balance:a.balance})),[{id:'a',balance:95},{id:'b',balance:28}]);
// Credit and debit must be independent, not an exclusive first-match transfer CASE.
assert.match(lastSql,/then t\.amount else 0 end\s*-\s*case/);
sqlDb.exec("ALTER TABLE transactions ADD COLUMN cost_center_id TEXT; INSERT INTO accounts VALUES ('org-account','other','org',50); INSERT INTO transactions VALUES ('org-visible','other','org','org-account',NULL,'Entrada',10,'cc'),('org-hidden','user','org','org-account',NULL,'Entrada',500,NULL);");
const restricted=await financialSnapshot(adapter,{userId:'user',orgId:'org',allowedCCs:['cc']});
assert.deepEqual(restricted.accounts.map((a:any)=>({id:a.id,balance:a.balance})),[{id:'org-account',balance:60}]);
const denied=await financialSnapshot(adapter,{userId:'user',orgId:'org',allowedCCs:[]});
assert.deepEqual(denied.accounts.map((a:any)=>({id:a.id,balance:a.balance})),[{id:'org-account',balance:50}]);
sqlDb.close();
console.log('financial snapshot transfer and scope SQL tests passed');
