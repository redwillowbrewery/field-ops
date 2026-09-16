"use client";
import {useEffect,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {DayMap} from "./day-map";
import {saveRouteDraft} from "./actions";
import {googleMapsSections,movePlanningOrder,isSourceStale,type DayMapOrder,type Vehicle} from "@/lib/fulfilment";
const button="rounded border px-3 py-2 text-sm disabled:opacity-40";
export function RoutePlanner({orders,start,initialDay,vehicles,refreshError}:{orders:DayMapOrder[];start:string;initialDay:string;vehicles:Vehicle[];refreshError:boolean}){
 const [draft,setDraft]=useState(orders),[day,setDay]=useState(initialDay),[dirty,setDirty]=useState(false),[message,setMessage]=useState(""),[dragging,setDragging]=useState<number|null>(null);
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[]);
 const [pending,begin]=useTransition();const router=useRouter();
 const vans=vehicles.filter(v=>[1,2,4].includes(v.vehicle_id));
 function move(id:number,van:number|null,before:number|null){if(pending)return;setDraft(current=>movePlanningOrder(current,id,van,before,vehicles));setDirty(true);setMessage("");}
 const eligible=draft.filter(o=>o.transport==="Van"||o.transport==="Unassigned");
 function save(){begin(async()=>{try{
  const changedDays=new Set(eligible.filter(o=>{const prior=orders.find(p=>p.id===o.id);return prior?.vehicleId!==o.vehicleId||prior?.stopPosition!==o.stopPosition;}).map(o=>o.date));
  const rows=eligible.filter(o=>changedDays.has(o.date)).map(o=>({source:o.id,source_revision:o.sourceRevision!,plan_revision:o.planRevision!,date:o.date!,vehicle:o.vehicleId,position:o.stopPosition??1000000+o.id}));
  const result=await saveRouteDraft(rows);
  if(result.error){setMessage(result.error+". Your draft remains visible; reload to reconcile it.");return;}
  setMessage("Provisional sequence saved. ViewPlan is unchanged.");setDirty(false);router.refresh();
 }catch{setMessage("Save failed. Your draft remains visible; retry or reload.");}});}
 return <div className="space-y-4">
 <DayMap orders={draft} start={start} initialDay={initialDay} vehicles={vehicles} selectedDay={day} onDayChange={setDay}/>
 <section className="space-y-4 rounded-2xl border bg-white p-4" aria-label="Plan van stops">
 <h2 className="text-xl font-semibold">Plan stops · {day}</h2>
 <p className="text-sm">Drag an order onto another order to place it before that stop, or onto a van heading to move it to the end. Up/down buttons and the van selector work on touch screens and keyboards.</p>
 <p className="text-sm text-amber-900">Provisional planning only. Receiving hours, road times, return loads and the four-hour driving limit are not checked. Google Maps opens a route preview, not a dispatch instruction. Missing receiving hours are unknown.</p>
 <div className="flex gap-2"><button className={button} disabled={!dirty||pending} onClick={save}>{pending?"Saving…":"Save provisional sequence"}</button><button className={button} disabled={!dirty||pending} onClick={()=>{setDraft(orders);setDirty(false);setMessage("");}}>Discard edits</button>{dirty&&<span role="status">Unsaved edits</span>}</div>
 {message&&<p role="status" className="text-sm">{message}</p>}
 <div className="grid gap-4 lg:grid-cols-2">{[...vans.map(v=>v.vehicle_id),null].map(id=>{
 const van=vans.find(v=>v.vehicle_id===id);const rows=eligible.filter(o=>o.date===day&&o.vehicleId===id).sort((a,b)=>(a.stopPosition??1e9)-(b.stopPosition??1e9)||a.id-b.id);
 const total=rows.reduce((n,o)=>n+o.knownKg,0),unknown=rows.some(o=>o.totalKg===null),over=!!van?.vehicle_max_load_kg&&total>van.vehicle_max_load_kg;
 const changed=rows.some(o=>o.issues.includes("Order changed since assignment"));
 const stale=refreshError||rows.some(o=>o.issues.includes("Source observation stale")||(now!==null&&isSourceStale(o.observedAt||null,now)));
 let links:ReturnType<typeof googleMapsSections>=[],linkError="";
 try{if(id!==null)links=googleMapsSections(rows.map(o=>o.address));}catch(e){linkError=e instanceof Error?e.message:"Addresses need review";}
 const blocked=dirty||changed||stale||over||unknown||!van?.is_available||rows.some(o=>o.issues.includes("Customer dispatch blocked"));
 return <div key={id??"unassigned"} className="rounded-xl border p-3" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragging!==null)move(dragging,id,null);setDragging(null);}}>
 <h3 className="font-semibold">{van?.vehicle_name||"Unassigned"}{van&&!van.is_available?" · unavailable":""}</h3>
 <p className={over?"font-bold text-red-700":"text-sm"}>{total.toFixed(1)} kg known outbound{van?` / ${van.vehicle_max_load_kg} kg payload`:""}{over?" · OVER PAYLOAD":""}{unknown?" · weight incomplete":""}</p>
 <ol className="my-3 space-y-2">{rows.map((o,index)=><li key={o.id} draggable={!pending} onDragStart={e=>{setDragging(o.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(o.id));}} onDragEnd={()=>setDragging(null)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragging!==null)move(dragging,id,o.id);setDragging(null);}} className="rounded border bg-slate-50 p-3">
 <a className="font-medium underline" href={`#order-${o.id}`}>{index+1}. {o.name}</a><p className="text-xs">Order {o.id} · {o.kind} · {o.knownKg.toFixed(1)} kg known</p><p className="text-xs">{o.address||"Address missing"}</p>
 <ul className="text-xs text-amber-800">{o.issues.map(i=><li key={i}>{i}</li>)}</ul>
 <div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={index===0||pending} aria-label={`Move ${o.name} up`} onClick={()=>move(o.id,id,rows[index-1].id)}>↑ Up</button><button className={button} disabled={index===rows.length-1||pending} aria-label={`Move ${o.name} down`} onClick={()=>move(o.id,id,rows[index+2]?.id??null)}>↓ Down</button>
 <select className={button} disabled={pending} aria-label={`Van for ${o.name}`} value={id??""} onChange={e=>move(o.id,e.target.value?Number(e.target.value):null,null)}><option value="">Unassigned</option>{vans.map(v=><option key={v.vehicle_id} value={v.vehicle_id} disabled={!v.is_available}>{v.vehicle_name}</option>)}</select></div>
 </li>)}</ol>
 {!rows.length&&<p className="p-4 text-sm text-slate-500">Drop an order here.</p>}
 {id!==null&&rows.length>0&&<div className="space-y-2"><p className="text-xs">Brewery → listed stops → brewery. Several orders at one address may appear consecutively. Open each section in order; Google Maps may adjust roads.</p>
 {linkError&&<p className="text-amber-800">{linkError}</p>}
 {blocked?<p className="text-sm text-amber-800">Save edits and review changed/stale source data, incomplete weights, dispatch blocks or excess payload before opening the preview.</p>:links.map((link,i)=><a key={i} className={button+" mr-2 inline-block"} href={link.url} target="_blank" rel="noopener noreferrer">Google Maps preview{links.length>1?` · section ${i+1}/${links.length}`:""}</a>)}
 </div>}
 </div>;
 })}</div>
 </section></div>;
}
