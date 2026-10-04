import assert from 'node:assert/strict';
import { listTransactions } from './_financial';

const calls: {sql: string; params: any[]}[] = [];
const db = { async query(sql: string, params: any[] = []) { calls.push({sql, params}); return { rows: [{id:'3', date:'2026-03-02',created_at:'2026-03-02T12:00:00Z'}, {id:'2',date:'2026-03-02',created_at:'2026-03-02T10:00:00Z'}, {id:'1',date:'2026-03-01',created_at:'2026-03-01T00:00:00Z'}] }; } };
const page = await listTransactions(db, {userId:'user',orgId:null}, {limit:2, offset:4, beforeDate:'2026-03-03'});
assert.equal(page.rows.length, 2);
assert.equal(page.hasMore,true);
assert.deepEqual(page.nextCursor,{date:'2026-03-02',createdAt:'2026-03-02T10:00:00Z',id:'2'});
assert.match(calls[0].sql,/date < \$2/);
assert.match(calls[0].sql,/offset \$4/i);
assert.deepEqual(calls[0].params,['user','2026-03-03',3,4]);
await listTransactions(db,{userId:'user',orgId:'org',allowedCCs:[]},{cursor:page.nextCursor,limit:2});
assert.match(calls[1].sql,/1=0/);
assert.match(calls[1].sql,/\(date, created_at, id\) </);
console.log('financial pagination tests passed');
