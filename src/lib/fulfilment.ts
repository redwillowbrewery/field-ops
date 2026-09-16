export type SourceLine={order_item_id:number;packaging_type:string;product_name?:string;quantity:number;unit_weight_kg:number|null;is_cancelled?:boolean;is_deleted?:boolean;misc_item_id?:number};
export type SourceOrder={source_id:number;account_id:string|null;fulfilment_method:string;delivery_date:string|null;revision:number;observed_at:string;snapshot:{header:{order_id:number;order_no_val:number;delivery_vehicle_id:number|null;order_type:number;is_cancelled?:boolean;is_deleted?:boolean;is_pre_order?:boolean;is_dispatched?:boolean;is_delivered?:boolean;order_exclude_from_dlv_sched?:boolean};customer:{customer_name:string;delivery_address?:string;customer_address_line1?:string;customer_address_town?:string;customer_address_postcode?:string;customer_exclude_from_dlv_sched?:boolean};customer_status?:{allow_order?:boolean;allow_order_dispatch?:boolean};lines:SourceLine[];sub_lines?:unknown[]}};
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
