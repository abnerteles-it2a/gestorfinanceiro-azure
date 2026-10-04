import assert from 'node:assert/strict';
import { patchInvestment } from './_financial';
let row:any={id:'asset',quantity:2,purchase_price:100,purchase_date:'2026-01-01',maturity_date:'2027-01-01'};
const db={async query(sql:string,p:any[]=[]){ if(sql.startsWith('update')) {const sets=sql.split(' set ')[1].split(' where ')[0].split(',');sets.forEach((set,i)=>{row[set.trim().split('=')[0]]=p[i];});}return {rows:[{...row}]};}};
let result=await patchInvestment(db,{userId:'user',orgId:null},'investment',{id:'asset',quantity:3,purchasePrice:undefined});
assert.equal(result.rows[0].quantity,3);assert.equal(result.rows[0].purchase_price,100);assert.equal(result.rows[0].purchase_date,'2026-01-01');
result=await patchInvestment(db,{userId:'user',orgId:null},'fixed',{id:'asset',maturityDate:null});
assert.equal(result.rows[0].maturity_date,null);assert.equal(result.rows[0].purchase_date,'2026-01-01');
console.log('financial patch tests passed');
