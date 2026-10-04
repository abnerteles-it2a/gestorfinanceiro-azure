import assert from 'node:assert/strict';
import { settleObligation } from './_financial';
const obligation:any={id:'obligation',amount:'100',paid_amount:'0',status:'pending',due_date:'2026-03-01',title:'Invoice',cost_center_id:null};
const transactions=new Map<string,any>();
let released=0; let rollback=0; let failUpdate=false;
const client={async query(sql:string,p:any[]=[]):Promise<{rows:any[]}> {
 if(sql==='BEGIN') return {rows:[]};
 if(sql==='COMMIT') return {rows:[]};
 if(sql==='ROLLBACK') {rollback++; return {rows:[]};}
 if(sql.includes('from public.payables') || sql.includes('from public.receivables')) return {rows:[{...obligation}]};
 if(sql.includes('from public.accounts')) return {rows:[{id:'account'}]};
 if(sql.includes('from public.obligation_settlements')) return {rows:transactions.has(p[0])?[transactions.get(p[0])]:[]};
 if(sql.startsWith('insert into public.transactions')) return {rows:[{id:p[0],amount:p[8]}]};
 if(sql.startsWith('update public.payables') || sql.startsWith('update public.receivables')) {if(failUpdate)throw new Error('controlled_failure'); obligation.status=p[0];obligation[sql.includes('receivables')?'received_amount':'paid_amount']=p[1];obligation.transaction_id=p[2];return {rows:[{...obligation}]};}
 if(sql.startsWith('insert into public.obligation_settlements')) {transactions.set(p[0],{operation_id:p[0],obligation_id:p[1],kind:p[2],principal_amount:p[3],cash_amount:p[4],account_id:p[5],transaction_id:p[6]});return {rows:[]};}
 if(sql.includes('from public.transactions')) return {rows:[{id:p[0]}]};
 throw new Error('Unexpected query '+sql);
}, release(){released++;}};
const pool={async connect(){return client;}};
const scope={userId:'user',orgId:null};
const first=await settleObligation(pool,scope,'payable',{id:'obligation',paidAmount:40,accountId:'account',operationId:'10000000-0000-4000-8000-000000000001'});
assert.equal(first.rows[0].paid_amount,40);assert.equal(first.rows[0].remaining_amount,60);assert.equal(first.rows[0].status,'open');assert.equal(first.tx.amount,40);
const repeat=await settleObligation(pool,scope,'payable',{id:'obligation',paidAmount:40,accountId:'account',operationId:'10000000-0000-4000-8000-000000000001'});
assert.equal(repeat.rows[0].paid_amount,40);assert.equal(transactions.size,1);
const second=await settleObligation(pool,scope,'payable',{id:'obligation',paidAmount:60,discountAmount:5,penaltyAmount:2,accountId:'account',operationId:'10000000-0000-4000-8000-000000000002'});
assert.equal(second.rows[0].paid_amount,100);assert.equal(second.rows[0].remaining_amount,0);assert.equal(second.rows[0].status,'paid');assert.equal(second.tx.amount,57);assert.notEqual(first.tx.id,second.tx.id);
await assert.rejects(()=>settleObligation(pool,scope,'payable',{id:'obligation',paidAmount:1,accountId:'account'}),/invalid_settlement_amount/);
obligation.paid_amount=0;obligation.status='pending';failUpdate=true;
await assert.rejects(()=>settleObligation(pool,scope,'payable',{id:'obligation',paidAmount:10,accountId:'account'}),/controlled_failure/);
assert.equal(rollback,2);assert.equal(released,5);
failUpdate=false;obligation.received_amount=0;obligation.status='open';
const received=await settleObligation(pool,scope,'receivable',{id:'obligation',receivedAmount:25,accountId:'account',operationId:'10000000-0000-4000-8000-000000000003'});
assert.equal(received.rows[0].received_amount,25);assert.equal(received.rows[0].remaining_amount,75);assert.equal(received.rows[0].status,'open');
await assert.rejects(()=>settleObligation(pool,scope,'receivable',{id:'obligation',receivedAmount:24,accountId:'account',operationId:'10000000-0000-4000-8000-000000000003'}),/settlement_operation_conflict/);
console.log('financial settlement tests passed');
