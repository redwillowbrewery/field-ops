import test from 'node:test';import assert from 'node:assert/strict';
import {orderWeight,isSourceStale,monday,addDays,deliveryLocation,mapOrder,dayMapGroups,googleMapsSections,movePlanningOrder,FULFILMENT_DEPOT} from '../src/lib/fulfilment.ts';
test('known delivery weight excludes cancellation but never conceals unknown return load',()=>{
 const lines=[{quantity:2,unit_weight_kg:51.2,packaging_type:'Firkin'},{quantity:10,unit_weight_kg:51.2,packaging_type:'Firkin',is_cancelled:true}];
 assert.equal(orderWeight(lines).totalKg,102.4);lines.push({quantity:1,unit_weight_kg:0,packaging_type:'(misc item)',misc_item_id:349});assert.equal(orderWeight(lines).totalKg,null);assert.equal(orderWeight(lines).knownKg,102.4);
});
test('invalid quantity and missing weights remain unresolved',()=>{for(const value of [null,0,-1,NaN])assert.equal(orderWeight([{quantity:2,unit_weight_kg:value,packaging_type:'Keg'}]).totalKg,null);assert.equal(orderWeight([]).totalKg,null);});
test('poll freshness and week arithmetic are explicit',()=>{assert.equal(isSourceStale(null),true);assert.equal(isSourceStale('bad'),true);assert.equal(isSourceStale(new Date(0).toISOString(),46*60000),true);assert.equal(isSourceStale(new Date(0).toISOString(),30*60000),false);assert.equal(monday('2026-09-16'),'2026-09-14');assert.equal(addDays('2026-09-28',7),'2026-10-05');assert.throws(()=>monday('2026-02-31'));});

const sample=()=>({source_id:1,account_id:'account',fulfilment_method:'van',delivery_date:'2026-09-16',revision:2,observed_at:new Date().toISOString(),snapshot:{header:{order_id:1,delivery_vehicle_id:1,order_type:1},customer:{customer_name:'Test pub',customer_address_line1:'1 High Street',customer_address_town:'Town',customer_address_postcode:'SK11 7JW'},lines:[{order_item_id:1,quantity:2,unit_weight_kg:51.2,packaging_type:'Firkin'}]}});
const location={id:'account',address_line_1:'1 High Street',town:'Town',postcode:'SK117JW',latitude:53.2,longitude:-2.1};
test('map never uses Account coordinates for a changed or overridden delivery address',()=>{
 const o=sample();assert.equal(deliveryLocation(o,location).latitude,53.2);
 o.snapshot.customer.delivery_address='Different depot';assert.equal(deliveryLocation(o,location).latitude,null);
 delete o.snapshot.customer.delivery_address;o.snapshot.customer.customer_address_postcode='XX1 1XX';assert.equal(deliveryLocation(o,location).latitude,null);
 assert.equal(deliveryLocation(sample(),{...location,latitude:null}).latitude,null);
});
test('map follows local day and vehicle, keeps non-van and undated work visible',()=>{
 const o=sample(),now=Date.now(),vehicles=[{vehicle_id:2,vehicle_name:'VAN 2'}];
 const a=mapOrder(o,{planned_date:'2026-09-17',vehicle_id:2,reviewed_source_revision:1},location,vehicles,now);
 assert.equal(a.date,'2026-09-17');assert.equal(a.vehicleId,2);assert.ok(a.issues.includes('Order changed since assignment'));
 const pallet={...a,id:2,transport:'Pallet network'},undated={...a,id:3,date:null};
 assert.equal(dayMapGroups([a],'2026-09-16','all').stops.length,0);
 const g=dayMapGroups([a,pallet,undated],'2026-09-17','all');assert.equal(g.stops.length,1);assert.equal(g.nonVan.length,1);assert.equal(g.unscheduled.length,1);
 assert.equal(dayMapGroups([a],'2026-09-17','1').stops.length,0);
});
test('collection instructions remain uncertain and co-located orders are grouped without losing quantities',()=>{
 const o=sample();o.snapshot.lines.push({order_item_id:2,packaging_type:'(misc item)',quantity:1,misc_item_id:349,unit_weight_kg:0});
 const a=mapOrder(o,undefined,location,[],Date.now());assert.equal(a.kind,'Delivery + collection');assert.equal(a.totalKg,null);
 const g=dayMapGroups([a,{...a,id:2}],'2026-09-16','all');assert.equal(g.stops.length,1);assert.equal(g.stops[0].orders.length,2);
});

test('Maps sections preserve every stop and brewery return within mobile and URL limits',()=>{
 const addresses=Array.from({length:14},(_,i)=>`Address ${i}, Street & Lane, SK11 7JW`);
 const sections=googleMapsSections(addresses);const reconstructed=[];
 for(const [i,s] of sections.entries()){
  const q=new URL(s.url).searchParams;const waypoints=q.get('waypoints')?.split('|')||[];
  assert.ok(waypoints.length<=3);assert.ok(s.url.length<=2048);
  assert.equal(q.get('origin'),i?new URL(sections[i-1].url).searchParams.get('destination'):FULFILMENT_DEPOT.address);
  reconstructed.push(...waypoints,q.get('destination'));
 }
 assert.deepEqual(reconstructed,[...addresses,FULFILMENT_DEPOT.address]);
 assert.deepEqual(googleMapsSections([]),[]);assert.throws(()=>googleMapsSections(['']));assert.throws(()=>googleMapsSections(['x'.repeat(3000)]));
});
test('moving an order preserves all work and changes only the intended run',()=>{
 const base=mapOrder(sample(),undefined,location,[],Date.now());
 const orders=[{...base,id:1,stopPosition:1},{...base,id:2,stopPosition:2},{...base,id:3,vehicleId:2,stopPosition:1},{...base,id:4,date:'2026-09-17',stopPosition:1}];
 const vehicles=[{vehicle_id:1,is_available:true},{vehicle_id:2,is_available:true}];
 let moved=movePlanningOrder(orders,2,1,1,vehicles);
 assert.equal(moved.find(o=>o.id===2).stopPosition,1);assert.equal(moved.find(o=>o.id===1).stopPosition,2);
 moved=movePlanningOrder(moved,2,2,3,vehicles);
 assert.equal(moved.find(o=>o.id===2).vehicleId,2);assert.equal(moved.find(o=>o.id===3).stopPosition,2);assert.deepEqual(moved[3],orders[3]);assert.equal(moved.length,4);
 assert.deepEqual(movePlanningOrder(orders,1,3,null,vehicles),orders);
 assert.deepEqual(movePlanningOrder([{...base,transport:'Pallet network'}],1,2,null,vehicles),[{...base,transport:'Pallet network'}]);
});
