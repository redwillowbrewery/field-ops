export type SourceLine={order_item_id:number;packaging_type:string;product_name?:string;quantity:number;unit_weight_kg:number|null;is_cancelled?:boolean;is_deleted?:boolean;misc_item_id?:number};
export type SourceOrder={source_id:number;account_id:string|null;fulfilment_method:string;delivery_date:string|null;revision:number;observed_at:string;snapshot:{header:{order_id:number;order_no_val:number;delivery_vehicle_id:number|null;order_type:number;is_cancelled?:boolean;is_deleted?:boolean;is_pre_order?:boolean;is_dispatched?:boolean;is_delivered?:boolean;order_exclude_from_dlv_sched?:boolean};customer:{customer_name:string;delivery_address?:string;customer_address_line1?:string;customer_address_line2?:string;customer_address_town?:string;customer_address_postcode?:string;customer_exclude_from_dlv_sched?:boolean};customer_status?:{allow_order?:boolean;allow_order_dispatch?:boolean};lines:SourceLine[];sub_lines?:unknown[]}};
export type Vehicle={vehicle_id:number;vehicle_name:string;vehicle_max_load_kg:number;is_available:boolean};
export type OrderPlan={source_id:number;planned_date:string;vehicle_id:number|null;revision:number;reviewed_source_revision:number};
export function orderWeight(lines:SourceLine[]){
 let knownKg=0;const issues:string[]=[];const active=lines.filter(l=>!l.is_cancelled&&!l.is_deleted);
 for(const l of active){
  if(typeof l.quantity!=="number"||!Number.isFinite(l.quantity)||l.quantity<0){issues.push("Quantity needs review");continue;}
  if(l.packaging_type==="(misc item)"){issues.push(l.misc_item_id===349?"Collection quantity and return weight needed":"Miscellaneous item needs classification");continue;}
  if(typeof l.unit_weight_kg!=="number"||!Number.isFinite(l.unit_weight_kg)||l.unit_weight_kg<=0){issues.push("Missing weight or non-cargo classification");continue;}
  knownKg+=l.quantity*l.unit_weight_kg;
 }
 if(!active.length)issues.push("No active lines");
 knownKg=Math.round(knownKg*1000)/1000;
 return {knownKg,totalKg:issues.length?null:knownKg,issues:[...new Set(issues)]};
}
export function isSourceStale(at:string|null,now=Date.now()){return !at||!Number.isFinite(Date.parse(at))||now-Date.parse(at)>45*60*1000;}
export function monday(date:string){const d=new Date(date+"T12:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==date)throw new Error("Invalid date");d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);}
export function addDays(date:string,n:number){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}

export type AccountLocation={id:string;address_line_1:string|null;town:string|null;postcode:string|null;latitude:number|null;longitude:number|null};
export type DayMapOrder={id:number;accountId:string|null;name:string;date:string|null;vehicleId:number|null;vehicleName:string;transport:string;address:string;latitude:number|null;longitude:number|null;locationIssue:string|null;kind:string;knownKg:number;totalKg:number|null;issues:string[];lines:string[]};
const clean=(value:string|null|undefined)=>(value||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
export function deliveryLocation(order:SourceOrder,account:AccountLocation|undefined){
 const c=order.snapshot.customer;
 if(c.delivery_address?.trim())return {latitude:null,longitude:null,locationIssue:"Delivery address override needs its own coordinates"};
 if(!account)return {latitude:null,longitude:null,locationIssue:"Account location unavailable"};
 if(!clean(c.customer_address_line1)||!clean(c.customer_address_postcode)||clean(account.address_line_1)!==clean(c.customer_address_line1)||clean(account.town)!==clean(c.customer_address_town)||clean(account.postcode)!==clean(c.customer_address_postcode))return {latitude:null,longitude:null,locationIssue:"Source delivery address differs from mapped Account"};
 if(c.customer_address_line2?.trim())return {latitude:null,longitude:null,locationIssue:"Additional delivery address line needs location review"};
 if(typeof account.latitude!=="number"||typeof account.longitude!=="number"||!Number.isFinite(account.latitude)||!Number.isFinite(account.longitude)||Math.abs(account.latitude)>90||Math.abs(account.longitude)>180)return {latitude:null,longitude:null,locationIssue:"Coordinates not recorded"};
 return {latitude:account.latitude,longitude:account.longitude,locationIssue:null};
}
export function mapOrder(order:SourceOrder,plan:OrderPlan|undefined,account:AccountLocation|undefined,vehicles:Vehicle[],now:number):DayMapOrder{
 const h=order.snapshot.header,c=order.snapshot.customer;
 const vehicleId=plan?plan.vehicle_id:order.fulfilment_method==="pallet"?3:h.delivery_vehicle_id;
 const vehicleName=vehicles.find(v=>v.vehicle_id===vehicleId)?.vehicle_name||(vehicleId===null?"Unassigned":"Unknown vehicle");
 const transport=order.fulfilment_method==="pallet"||vehicleId===3?"Pallet network":vehicleId===5?"Courier":vehicleId===6?"COLLECT — classification review":vehicleId===null?"Unassigned":[1,2,4].includes(vehicleId)?"Van":"Transport needs review";
 const active=order.snapshot.lines.filter(l=>!l.is_cancelled&&!l.is_deleted);
 const collection=active.some(l=>l.packaging_type==="(misc item)"&&l.misc_item_id===349);
 const goods=active.some(l=>l.packaging_type!=="(misc item)"&&l.unit_weight_kg!==null&&l.unit_weight_kg>0);
 const weight=orderWeight(order.snapshot.lines),issues=[...weight.issues];
 if(collection)issues.push("Collection instruction from ViewPlan; empty counts unconfirmed");
 if(isSourceStale(order.observed_at,now))issues.push("Source observation stale");
 if(plan&&plan.reviewed_source_revision!==order.revision)issues.push("Order changed since assignment");
 if(order.snapshot.customer_status?.allow_order_dispatch!==true)issues.push(order.snapshot.customer_status?.allow_order_dispatch===false?"Customer dispatch blocked":"Dispatch permission unknown");
 if(h.is_pre_order)issues.push("Pre-order; confirm commitment");
 if(h.order_type!==1)issues.push("Order type needs review");
 return {id:order.source_id,accountId:order.account_id,name:c.customer_name,date:plan?.planned_date||order.delivery_date,vehicleId,vehicleName,transport,
 address:c.delivery_address?.trim()||[c.customer_address_line1,c.customer_address_line2,c.customer_address_town,c.customer_address_postcode].filter(Boolean).join(", "),
 ...deliveryLocation(order,account),kind:collection?(goods?"Delivery + collection":"Collection instruction"):goods?"Delivery":"Work needs review",
 knownKg:weight.knownKg,totalKg:weight.totalKg,issues,lines:active.map(l=>`${l.quantity} × ${l.product_name||"Item"} · ${l.packaging_type}`)};
}
export function dayMapGroups(orders:DayMapOrder[],day:string,vehicle:string){
 const dayOrders=orders.filter(o=>o.date===day);
 const nonVan=dayOrders.filter(o=>o.transport!=="Van"&&o.transport!=="Unassigned");
 const eligible=dayOrders.filter(o=>(o.transport==="Van"||o.transport==="Unassigned")&&(vehicle==="all"||String(o.vehicleId??"unassigned")===vehicle));
 const groups=new Map<string,DayMapOrder[]>();
 for(const order of eligible){const key=[order.accountId||order.id,order.vehicleId,order.address].join("|");groups.set(key,[...(groups.get(key)||[]),order]);}
 const stops=[...groups.entries()].sort(([,a],[,b])=>a[0].vehicleName.localeCompare(b[0].vehicleName)||a[0].name.localeCompare(b[0].name)||a[0].id-b[0].id).map(([key,items],i)=>({key,reference:i+1,orders:items}));
 return {stops,nonVan,unscheduled:orders.filter(o=>!o.date)};
}
export const FULFILMENT_DEPOT={address:"The Lodge, Sutton Mill, Byrons Lane, Macclesfield, SK11 7JW",latitude:53.249509,longitude:-2.118894,locationBasis:"Postcode centre; brewery entrance not yet verified"};
