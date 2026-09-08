"use client";
import {useState} from "react";
import type {Package,Request} from "@/lib/take-off";
import {packagingGroup,requestedSplit} from "@/lib/take-off";
import {saveGrid} from "./actions";
import {Submit} from "./submit";

const field="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2";
const litres=(n:number|null)=>n==null?"Unknown":new Intl.NumberFormat("en-GB",{maximumFractionDigits:3}).format(n)+" L";
export function QuantityGrid({brew,context,requestsContext,packages,requests,userId,available,estimatedDate}:{
 brew:string;context:string;requestsContext:string;packages:Package[];requests:Request[];userId:string;available:number|null;estimatedDate:string|null;
}){
 const active=requests.filter(r=>!r.withdrawn);
 const [cells,setCells]=useState(()=>packages.map(pkg=>{
  const own=active.filter(r=>r.package_id===pkg.id&&r.owner_id===userId);
  const existing=own.length===1?own[0]:null;
  return {package_id:pkg.id,id:existing?.id||null,revision:existing?.revision??null,quantity:String(existing?.quantity??""),required_by:existing?.required_by||"",notes:existing?.notes||""};
 }));
 const [date,setDate]=useState("");
 const editedIds=new Set(cells.map(c=>c.id).filter(Boolean));
 const other=active.filter(r=>!editedIds.has(r.id));
 const items=cells.map(c=>({...c,quantity:c.quantity===""?0:Number(c.quantity),required_by:c.required_by||date}));
 const totals=requestedSplit([...other,...items],packages,available);
 const changed=items.some(c=>c.id?(()=>{
  const r=active.find(r=>r.id===c.id)!;
  return c.quantity!==r.quantity||c.required_by!==r.required_by||c.notes!==r.notes;
 })():c.quantity>0);
 const update=(id:string,patch:Partial<(typeof cells)[number]>)=>setCells(previous=>previous.map(c=>c.package_id===id?{...c,...patch}:c));
 return <form action={saveGrid} className="my-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
  <h3 className="text-lg font-semibold">Packaging quantities</h3>
  <p className="mt-1 text-sm text-slate-600">Enter your required units for each package. Other saved requests are included in the totals. Changes go to the Head Brewer for approval.</p>
  <input type="hidden" name="brew" value={brew}/><input type="hidden" name="context" value={context}/><input type="hidden" name="requests_context" value={requestsContext}/><input type="hidden" name="items" value={JSON.stringify(items)}/>
  <label className="mt-4 block max-w-xs text-sm font-medium">Required by for new quantities<input type="date" className={field} value={date} onChange={e=>setDate(e.target.value)} required={items.some(c=>c.quantity>0&&!c.required_by)}/></label>
  {estimatedDate&&<p className="mt-1 text-xs text-slate-600">Estimated packaging date: {estimatedDate}. Choose the date Sales needs; this is not a confirmed availability date.</p>}
  {(["nonCarbonated","carbonated","unclassified"] as const).map(group=>{
   const grouped=packages.filter(p=>packagingGroup(p)===group);
   if(!grouped.length)return null;
   return <fieldset key={group} className="mt-5"><legend className="font-semibold">{group==="nonCarbonated"?"Non-carbonated · cask / pin":group==="carbonated"?"Carbonated · keg / can":"Other formats · carbonation unconfirmed"}</legend>
    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{grouped.map(pkg=>{
     const cell=cells.find(c=>c.package_id===pkg.id)!;
     const others=other.filter(r=>r.package_id===pkg.id).reduce((n,r)=>n+r.quantity,0);
     return <div key={pkg.id} className="rounded-xl border bg-white p-3">
      <label className="block font-medium">{pkg.name}<input aria-label={pkg.name+" quantity"} type="number" min="0" max="2147483647" step="1" inputMode="numeric" className={field} value={cell.quantity} placeholder="0" onChange={e=>update(pkg.id,{quantity:e.target.value})}/></label>
      <p className="mt-2 text-xs text-slate-600">{litres(pkg.capacity_litres)} per unit · {others} other requested units</p>
      {active.filter(r=>r.package_id===pkg.id&&r.owner_id===userId).length>1&&<p className="mt-1 text-xs text-amber-900">You have separate requests for this package. This box adds another; edit existing requests below.</p>}
      <details className="mt-2 text-sm"><summary className="cursor-pointer">Date and notes{cell.required_by?" · "+cell.required_by:""}</summary>
       <label className="mt-2 block">Required by<input type="date" className={field} value={cell.required_by} onChange={e=>update(pkg.id,{required_by:e.target.value})}/></label>
       <label className="mt-2 block">Notes<textarea maxLength={2000} className={field} value={cell.notes} onChange={e=>update(pkg.id,{notes:e.target.value})}/></label>
      </details>
     </div>;
    })}</div>
   </fieldset>;
  })}
  <div aria-live="polite" aria-atomic="true" className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
   {[[ "Non-carbonated",totals.nonCarbonated],["Carbonated",totals.carbonated],["Other / unconfirmed",totals.unclassified],["Remaining before losses",totals.remaining]].map(([label,value])=><div key={String(label)} className="rounded-lg bg-white p-3"><p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-lg font-semibold">{litres(value as number|null)}</p></div>)}
  </div>
  <p className="mt-2 text-xs text-slate-600">Live request totals use package capacities, before packaging losses. The approved beer requirement below includes the Head Brewer’s explicit allowances. Both packaging groups draw from the same source volume.</p>
  {totals.remaining!=null&&totals.remaining<0&&<p role="alert" className="mt-2 font-semibold text-red-800">Requested packaging exceeds the beer available by {litres(-totals.remaining)} before losses.</p>}
  {changed&&<div className="mt-4"><Submit>Save packaging quantities</Submit><p className="mt-2 text-xs">Set an existing quantity to 0 to withdraw your request. Unchanged approvals are preserved.</p></div>}
  {!packages.length&&<p className="mt-3 text-amber-900">No saleable packaging is mapped for this beer. Refresh the products connector.</p>}
 </form>;
}
