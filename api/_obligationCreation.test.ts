import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObligation } from './_obligationCreation';
import { settleObligation } from './_financial';
import { calculateMeiFiscal } from '../utils/meiFiscalCalculator';

function database() {
  const state = { journals: new Map<string, any>(), rows: [] as any[], quota: 0, released: 0, fail: false };
  let tail = Promise.resolve();
  return { state, async connect() {
    let unlock: () => void = () => {};
    let backup: any;
    return {
      async query(sql: string, p: any[] = []): Promise<{ rows: any[] }> {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql.includes('pg_advisory_xact_lock')) {
          const prior = tail;
          tail = new Promise<void>(resolve => { unlock = resolve; });
          await prior;
          backup = { journals: new Map(state.journals), rows: [...state.rows], quota: state.quota };
          return { rows: [] };
        }
        if (sql === 'COMMIT') { unlock(); return { rows: [] }; }
        if (sql === 'ROLLBACK') { if (backup) Object.assign(state, backup); unlock(); return { rows: [] }; }
        if (sql.startsWith('select user_id,request_payload')) return { rows: state.journals.has(p.slice(0,3).join(':')) ? [state.journals.get(p.slice(0,3).join(':'))] : [] };
        if (sql.startsWith('insert into public.payables') || sql.startsWith('insert into public.receivables')) {
          const row = { id:p[0],user_id:p[1],org_id:p[2],title:p[3],status:p[4],amount:p[5],issue_date:p[6],due_date:p[7],category:p[8],cost_center_id:p[9],is_business_revenue:p[12],is_business_expense:p[13] };
          state.rows.push(row); return { rows:[row] };
        }
        if (sql.startsWith('insert into public.obligation_creation_operations')) {
          if (state.fail) throw new Error('journal_failure');
          state.journals.set(p.slice(0,3).join(':'), {user_id:p[3],request_payload:JSON.parse(p[4]),result_payload:JSON.parse(p[5])});
          return {rows:[]};
        }
        throw new Error('Unexpected SQL: '+sql);
      },
      release() { state.released++; }
    };
  } };
}
const scope = {userId:'user',orgId:null};
const request = { operationId:'10000000-0000-4000-8000-000000000001',title:'Venda',amount:100,dueDate:'2026-11-20',issueDate:'2026-11-01',category:'Vendas',isBusinessRevenue:true };

test('obligation creation serializes retry and records quota once', async () => {
  const db = database();
  const quota = async () => {db.state.quota++;};
  const results = await Promise.all([createObligation(db,scope,'receivable',request,quota),createObligation(db,scope,'receivable',request,quota)]);
  assert.equal(db.state.rows.length,1);
  assert.equal(db.state.quota,1);
  assert.equal(results.filter(result=>result.replayed).length,1);
  assert.equal(results[0].rows[0].is_business_revenue,true);
  assert.equal(results[0].rows[0].is_business_expense,false);
  await assert.rejects(createObligation(db,scope,'receivable',{...request,amount:101},quota),/obligation_operation_conflict/);
  await assert.rejects(createObligation(db,{...scope,userId:'other',orgId:'org'},'receivable',{...request,amount:-1},quota),/invalid_obligation_amount/);
  assert.equal(db.state.rows.length,1);
});

test('journal failure rolls back obligation and quota', async () => {
  const db = database(); db.state.fail=true;
  await assert.rejects(createObligation(db,scope,'receivable',request,async()=>{db.state.quota++;}),/journal_failure/);
  assert.equal(db.state.rows.length,0); assert.equal(db.state.quota,0); assert.equal(db.state.released,1);
});

test('missing migration fails safely before quota or mutations', async () => {
  let released = false;
  let rollback = false;
  let quota = false;
  const pool = { async connect() { return {
    async query(sql: string) {
      if (sql.includes('from public.obligation_creation_operations')) throw Object.assign(new Error('missing relation'), { code: '42P01' });
      if (sql === 'ROLLBACK') rollback = true;
      return { rows: [] };
    }, release() { released = true; }
  }; } };
  await assert.rejects(createObligation(pool,scope,'receivable',request,async()=>{quota=true;}),/obligation_schema_required/);
  assert.equal(quota,false); assert.equal(rollback,true); assert.equal(released,true);
});

test('same operation in another scope is independent and actor cannot replay organizational journal', async()=>{
  const db=database();
  await createObligation(db,{userId:'user',orgId:'org'},'receivable',request);
  await assert.rejects(createObligation(db,{userId:'other',orgId:'org'},'receivable',request),/obligation_operation_conflict/);
  await createObligation(db,scope,'receivable',request);
  assert.equal(db.state.rows.length,2);
});

test('creation and partial receipt preserve business revenue for MEI; unclassified receipt remains excluded', async()=>{
  for (const business of [true,false]) {
    const db=database();
    const created=await createObligation(db,scope,'receivable',{...request,isBusinessRevenue:business});
    const row=created.rows[0];
    const client={async query(sql:string,p:any[]=[]):Promise<{rows:any[]}> {
      if (['BEGIN','COMMIT','ROLLBACK'].includes(sql)) return {rows:[]};
      if (sql.includes('from public.receivables')) return {rows:[row]};
      if (sql.includes('from public.obligation_settlements')) return {rows:[]};
      if (sql.includes('from public.accounts')) return {rows:[{id:'account'}]};
      if (sql.startsWith('insert into public.transactions')) return {rows:[{id:p[0],date:p[2],accountId:p[3],transactionType:p[5],category:p[6],description:p[7],amount:p[8],paymentMethod:p[9],isBusinessRevenue:p[12],isBusinessExpense:p[13]}]};
      if (sql.startsWith('update public.receivables')) return {rows:[{...row,status:p[0],received_amount:p[1]}]};
      if (sql.startsWith('insert into public.obligation_settlements')) return {rows:[]};
      throw new Error(sql);
    },release(){}};
    const result=await settleObligation({async connect(){return client;}},scope,'receivable',{id:row.id,receivedAmount:40,receivedDate:'2026-11-12',accountId:'account'});
    assert.equal(result.rows[0].remaining_amount,60);
    assert.equal(result.tx.isBusinessRevenue,business);
    const fiscal=calculateMeiFiscal({transactions:[result.tx],categories:[{id:'c',name:'Vendas',type:'Entrada',icon:'',meiCategory:'commerce'}],year:2026});
    assert.equal(fiscal.annualRevenue,business?40:0);
  }
});
