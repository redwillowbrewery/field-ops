import test from 'node:test';import assert from 'node:assert/strict';
import {orderWeight,isSourceStale,monday,addDays} from '../src/lib/fulfilment.ts';
test('known delivery weight excludes cancellation but never conceals unknown return load',()=>{
 const lines=[{quantity:2,unit_weight_kg:51.2,packaging_type:'Firkin'},{quantity:10,unit_weight_kg:51.2,packaging_type:'Firkin',is_cancelled:true}];
 assert.equal(orderWeight(lines).totalKg,102.4);lines.push({quantity:1,unit_weight_kg:0,packaging_type:'(misc item)',misc_item_id:349});assert.equal(orderWeight(lines).totalKg,null);assert.equal(orderWeight(lines).knownKg,102.4);
});
test('invalid quantity and missing weights remain unresolved',()=>{for(const value of [null,0,-1,NaN])assert.equal(orderWeight([{quantity:2,unit_weight_kg:value,packaging_type:'Keg'}]).totalKg,null);assert.equal(orderWeight([]).totalKg,null);});
test('poll freshness and week arithmetic are explicit',()=>{assert.equal(isSourceStale(null),true);assert.equal(isSourceStale('bad'),true);assert.equal(isSourceStale(new Date(0).toISOString(),46*60000),true);assert.equal(isSourceStale(new Date(0).toISOString(),30*60000),false);assert.equal(monday('2026-09-16'),'2026-09-14');assert.equal(addDays('2026-09-28',7),'2026-10-05');assert.throws(()=>monday('2026-02-31'));});
