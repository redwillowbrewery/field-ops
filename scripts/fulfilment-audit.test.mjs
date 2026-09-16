import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewFulfilmentAudit} from './review-fulfilment-audit.mjs';
function fixture() { return {audit:'ViewPlan fulfilment detail - read only',data_reads_complete:true,rows:{
 orders:[{order_id:1,customer_id:1,is_dispatched:true,is_delivered:true,is_pre_order:true}],
 lines:[{order_item_id:10,order_id:1,packaging_type:'Firkin',quantity:2}],sub_lines:[],
 customers:[{customer_id:1}],packages:[{packaging_type:'Firkin',packaging_weight_full_kg:51.2}],vehicles:[],config:[{is_default:true,set_delivered_on_dispatch:true}]}}; }
test('source delivery flag never proves physical completion; preorders remain visible',()=>{
 const result=reviewFulfilmentAudit(fixture());
 assert.equal(result.orders[0].physical_completion,'unknown');
 assert.equal(result.orders[0].source_pre_order,true);
 assert.equal(result.orders[0].candidate_total_weight_kg,102.4);
});
test('missing and miscellaneous weights cannot create a complete weight total',()=>{
 for(const weight of [null,0,-1,'51.2']) {const a=fixture();a.rows.packages[0].packaging_weight_full_kg=weight;assert.equal(reviewFulfilmentAudit(a).orders[0].candidate_total_weight_kg,null);}
 const a=fixture();a.rows.lines.push({order_item_id:11,order_id:1,packaging_type:'(misc item)',quantity:1,misc_item_id:349});
 const row=reviewFulfilmentAudit(a).orders[0];assert.equal(row.known_line_weight_kg,102.4);assert.equal(row.candidate_total_weight_kg,null);
});
test('cancelled lines do not contribute cargo and empty orders require review',()=>{
 const a=fixture();a.rows.lines[0].is_cancelled=true;
 const row=reviewFulfilmentAudit(a).orders[0];assert.equal(row.known_line_weight_kg,0);assert.equal(row.candidate_total_weight_kg,null);
});
test('partial snapshots, duplicate identities and orphan lines fail',()=>{
 const a=fixture();a.data_reads_complete=false;assert.throws(()=>reviewFulfilmentAudit(a));
 const b=fixture();b.rows.orders.push({...b.rows.orders[0]});assert.throws(()=>reviewFulfilmentAudit(b));
 const c=fixture();c.rows.lines[0].order_id=99;assert.throws(()=>reviewFulfilmentAudit(c));
});
