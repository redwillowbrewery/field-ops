import test from 'node:test';
import assert from 'node:assert/strict';
import {getAccountOrderHistory} from '../src/lib/account-orders.ts';
test('Account history keeps orders and all their product lines beyond REST row caps',async()=>{
 const orders=Array.from({length:1101},(_,i)=>({id:String(i),account_id:'a',dispatched:true}));
 orders.push({id:'pending',account_id:'a',dispatched:false});
 const lines=Array.from({length:1205},(_,i)=>({order_id:'0',product_name:'Beer '+i,line_number:i}));
 lines.push({order_id:'1100',product_name:'Last order beer',line_number:1});
 const db={from(table){let rows=table==='sales_orders'?orders:lines,start=0,end=499;
  return {select(){return this;},eq(k,v){rows=rows.filter(r=>r[k]===v);return this;},in(k,ids){rows=rows.filter(r=>ids.includes(r[k]));return this;},order(){return this;},range(a,b){start=a;end=b;return this;},then(resolve){resolve({data:rows.slice(start,end+1),error:null});}};
 }};
 const result=await getAccountOrderHistory(db,'a');
 assert.equal(result.orders.length,1101);assert.equal(result.lines.length,1206);
 assert.equal(result.lines.at(-1).product_name,'Last order beer');
 assert.deepEqual(await getAccountOrderHistory(db,'another'),{orders:[],lines:[]});
});
test('failed product reads are surfaced instead of displaying incomplete orders',async()=>{
 const db={from(table){return{select(){return this;},eq(){return this;},in(){return this;},order(){return this;},range(){return this;},then(resolve){resolve(table==='sales_orders'?{data:[{id:'one'}],error:null}:{data:null,error:new Error('Line read failed')});}};}};
 await assert.rejects(getAccountOrderHistory(db,'a'),/Line read failed/);
});
