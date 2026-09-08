import type { SupabaseClient } from "@supabase/supabase-js";
export type Subject={id:string;source_key:string;kind:"plan"|"batch";product_id:string|null;product_name:string;source_product_id:string;source_link_key:string|null;source_link_conflict?:boolean;manual_batch_id:string|null;brew_date:string|null;gyle:string|null;phase:string;volume_litres:number|null;vessels:{label:string;litres:number|null;staging:boolean}[];source_take_off:{packaging_type:string;take_off_qty:number;is_processed:boolean}[];revision:number;missing:boolean;snapshot_at:string;packaging_days?:number|null};
export type Request={id:string;subject_id:string;package_id:string;quantity:number;required_by:string;notes:string;owner_id:string;owner_label:string;revision:number;withdrawn:boolean;approved_quantity:number|null;approved_date:string|null;extra_input_percent:number|null;approval_context:string|null;response:string;account_id:string|null};
export type Package={id:string;name:string;capacity_litres:number|null;broad_format?:string};
export function rootOf(s:Subject,subjects:Subject[]){return subjects.find(b=>b.source_key===s.source_link_key&&b.source_product_id===s.source_product_id)?.id||s.manual_batch_id||s.id;}
export function volumeSummary(requests:Request[],packages:Package[],context:string,available:number|null){
 let requested=0,agreed=0,input=0;let knownRequested=true,knownAgreed=true;let pending=0;
 for(const r of requests.filter(r=>!r.withdrawn)){
  const cap=packages.find(p=>p.id===r.package_id)?.capacity_litres;
  if(cap==null||Number(cap)<=0)knownRequested=false;else requested+=r.quantity*Number(cap);
  if(r.approved_quantity==null||r.approval_context!==context){pending++;continue;}
  if(cap==null||Number(cap)<=0||r.extra_input_percent==null){knownAgreed=false;continue;}
  agreed+=r.approved_quantity*Number(cap);
  input+=r.approved_quantity*Number(cap)*(1+Number(r.extra_input_percent)/100);
 }
 return {requested:knownRequested?requested:null,agreed:knownAgreed?agreed:null,input:knownAgreed?input:null,remaining:knownAgreed&&available!=null?Number(available)-input:null,pending};
}
export async function readTakeOff(db:SupabaseClient){
 async function all<T>(table:string):Promise<T[]>{
  const rows:T[]=[];
  for(let offset=0;;offset+=1000){
   const {data,error}=await db.from(table).select("*").order("id").range(offset,offset+999);
   if(error)throw new Error("Take Off data is unavailable. Check the migration and connector.");
   rows.push(...data as T[]);if(data.length<1000)return rows;
  }
 }
 const [subjects,requests,packages,state,role]=await Promise.all([
  all<Subject>("take_off_subjects"),all<Request>("take_off_requests"),all<Package>("packages"),
  db.from("take_off_sync").select("*").single(),db.rpc("take_off_is_approver")
 ]);
 if(state.error||role.error)throw new Error("Take Off setup is incomplete.");
 return {subjects,requests,packages,state:state.data,canApprove:role.data===true,loadedAt:Date.now()};
}

export function estimatedPackagingDate(brewDate:string|null,days:number|null|undefined){
 if(!brewDate||days==null||!Number.isInteger(days)||days<0)return null;
 const date=new Date(brewDate.slice(0,10)+"T00:00:00Z");
 if(!Number.isFinite(date.getTime()))return null;
 date.setUTCDate(date.getUTCDate()+days);
 return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
export function packagingGroup(pkg:Package){
 return pkg.broad_format==="cask"?"nonCarbonated":pkg.broad_format==="keg"||pkg.broad_format==="can"?"carbonated":"unclassified";
}
export function requestedSplit(rows:Pick<Request,"package_id"|"quantity">[],packages:Package[],available:number|null){
 const totals:{carbonated:number|null;nonCarbonated:number|null;unclassified:number|null}={carbonated:0,nonCarbonated:0,unclassified:0};
 for(const row of rows){
  if(row.quantity===0)continue;
  const pkg=packages.find(p=>p.id===row.package_id);
  const group=pkg?packagingGroup(pkg):"unclassified";
  const cap=pkg?.capacity_litres;
  if(cap==null||!Number.isFinite(Number(cap))||Number(cap)<=0||!Number.isInteger(row.quantity)||row.quantity<0)totals[group]=null;
  else if(totals[group]!=null)totals[group]!+=row.quantity*Number(cap);
 }
 const known=Object.values(totals).every(n=>n!=null);
 const output=known?Object.values(totals).reduce<number>((n,v)=>n+(v??0),0):null;
 return {...totals,output,remaining:output!=null&&available!=null?Number(available)-output:null};
}
