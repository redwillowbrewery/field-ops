"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {dayMapGroups,type DayMapOrder} from "@/lib/fulfilment";
import {addDays,FULFILMENT_DEPOT,type Vehicle} from "@/lib/fulfilment";
type Point=[number,number];
type MapInstance={setView:(p:Point,z:number)=>MapInstance;fitBounds:(p:Point[],o:Record<string,unknown>)=>void;remove:()=>void};
type Layer={addTo:(m:MapInstance)=>Layer;clearLayers:()=>void};
type Leaflet={map:(e:HTMLElement)=>MapInstance;tileLayer:(url:string,o:Record<string,unknown>)=>{addTo:(m:MapInstance)=>void};layerGroup:()=>Layer;divIcon:(o:Record<string,unknown>)=>unknown;marker:(p:Point,o:Record<string,unknown>)=>{addTo:(l:Layer)=>unknown;on:(event:string,fn:()=>void)=>void}};
const leaflet=()=> (window as unknown as {L?:Leaflet}).L;
const colours:Record<string,string>={1:"#1d4ed8",2:"#b45309",4:"#7e22ce"};
const colour=(id:number|null)=>colours[String(id)]||"#475569";
let loading:Promise<void>|null=null;
function loadMap(){
 if(leaflet())return Promise.resolve();if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{
  const css=document.querySelector('link[data-fieldops-leaflet]');if(!css){const link=document.createElement("link");link.rel="stylesheet";link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";link.dataset.fieldopsLeaflet="true";document.head.appendChild(link);}
  let script=document.querySelector<HTMLScriptElement>('script[data-fieldops-leaflet]');
  const timeout=window.setTimeout(()=>reject(new Error("Map loading timed out")),15000);
  const loaded=()=>{window.clearTimeout(timeout);if(leaflet())resolve();else reject(new Error("Map unavailable"));};
  const failed=()=>{window.clearTimeout(timeout);reject(new Error("Map unavailable"));};
  if(script){script.addEventListener("load",loaded,{once:true});script.addEventListener("error",failed,{once:true});return;}
  script=document.createElement("script");script.dataset.fieldopsLeaflet="true";script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";script.onload=loaded;script.onerror=failed;document.head.appendChild(script);
 });return loading;
}
export function DayMap({orders,start,initialDay,vehicles}:{orders:DayMapOrder[];start:string;initialDay:string;vehicles:Vehicle[]}){
 const [day,setDay]=useState(initialDay),[vehicle,setVehicle]=useState("all"),[selected,setSelected]=useState<string|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(false);
 const el=useRef<HTMLDivElement>(null),map=useRef<MapInstance|null>(null),layer=useRef<Layer|null>(null);
 const groups=useMemo(()=>dayMapGroups(orders,day,vehicle),[orders,day,vehicle]);
 const picked=groups.stops.find(s=>s.key===selected);
 useEffect(()=>{let cancelled=false;loadMap().then(()=>{if(cancelled||!el.current)return;const L=leaflet();if(!L)return;const instance=L.map(el.current).setView([53.2,-2.2],8);map.current=instance;L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap contributors"}).addTo(instance);layer.current=L.layerGroup().addTo(instance);setReady(true);}).catch(()=>{if(!cancelled)setError(true);});return()=>{cancelled=true;map.current?.remove();map.current=null;layer.current=null;};},[]);
 useEffect(()=>{const L=leaflet();if(!ready||!map.current||!layer.current||!L)return;layer.current.clearLayers();const depot:Point=[FULFILMENT_DEPOT.latitude,FULFILMENT_DEPOT.longitude];const bounds:Point[]=[depot];
 const depotIcon=L.divIcon({className:"",html:'<div style="background:#047857;color:white;border:3px solid white;border-radius:6px;width:36px;height:36px;text-align:center;line-height:30px;font-weight:bold">B</div>',iconSize:[36,36],iconAnchor:[18,18]});L.marker(depot,{icon:depotIcon,title:"Brewery depot (postcode centre estimate)"}).addTo(layer.current);
 // One pin per coordinate: shared premises visited by two vans remain selectable.
 const locations=new Map<string,typeof groups.stops>();for(const stop of groups.stops){const p=stop.orders[0];if(p.latitude===null||p.longitude===null)continue;const key=p.latitude+","+p.longitude;locations.set(key,[...(locations.get(key)||[]),stop]);}
 for(const stops of locations.values()){const p=stops[0].orders[0];const point:Point=[p.latitude!,p.longitude!];const same=stops.every(s=>s.orders[0].vehicleId===p.vehicleId);const label=stops.length>1?stops.length+" groups":String(stops[0].reference)+(p.kind.toLowerCase().includes("collection")?" C":" D");const bg=same?colour(p.vehicleId):"#0f172a";
 const icon=L.divIcon({className:"",html:`<div style="background:${bg};color:white;border:3px solid white;border-radius:999px;min-width:36px;height:36px;display:flex;align-items:center;justify-content:center;padding:0 5px;font-weight:bold;box-shadow:0 1px 6px #555">${label}</div>`,iconSize:[60,36],iconAnchor:[30,18]});const marker=L.marker(point,{icon,title:stops.map(s=>s.orders[0].vehicleName+": "+s.orders[0].name).join("; ")});marker.on("click",()=>setSelected(stops[0].key));marker.addTo(layer.current);bounds.push(point);}
 if(bounds.length===1)map.current.setView(bounds[0],12);else if(bounds.length)map.current.fitBounds(bounds,{padding:[30,30],maxZoom:12});else map.current.setView([53.2,-2.2],8);
 },[groups,ready]);
 const missing=groups.stops.filter(s=>s.orders[0].latitude===null);
 const kg=groups.stops.flatMap(s=>s.orders).reduce((n,o)=>n+o.knownKg,0);
 return <section className="space-y-4 rounded-2xl border bg-white p-4" aria-label="Daily fulfilment map"><div><h2 className="text-xl font-semibold">Daily map</h2><p className="text-sm text-slate-600">Delivery locations by van. Numbers identify entries below; they are not a driving sequence. Road routes are not yet calculated.</p></div>
 <div className="flex flex-wrap gap-3"><label>Day <select aria-label="Map day" className="rounded border p-2" value={day} onChange={e=>{setDay(e.target.value);setSelected(null);}}>{Array.from({length:21},(_,i)=>addDays(start,i)).map(d=><option key={d} value={d}>{new Date(d+"T12:00:00Z").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"})}</option>)}</select></label><label>Van <select aria-label="Map van" className="rounded border p-2" value={vehicle} onChange={e=>{setVehicle(e.target.value);setSelected(null);}}><option value="all">All vans and unassigned</option>{vehicles.filter(v=>[1,2,4].includes(v.vehicle_id)).map(v=><option key={v.vehicle_id} value={v.vehicle_id}>{v.vehicle_name}</option>)}<option value="unassigned">Unassigned</option></select></label></div>
 <div className="flex flex-wrap gap-3 text-sm">{vehicles.filter(v=>[1,2,4].includes(v.vehicle_id)).map(v=><span key={v.vehicle_id} className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full" style={{background:colour(v.vehicle_id)}}/>{v.vehicle_name}</span>)}<span>Grey: unassigned · Black: shared location · B: brewery · D: delivery · C: collection included</span></div>
 <p className="text-sm"><strong>Departure and return:</strong> {FULFILMENT_DEPOT.address}. Depot pin is a postcode-centre estimate.</p>
 <p className="text-sm">{groups.stops.length} customer/van groups · {kg.toLocaleString("en-GB",{maximumFractionDigits:1})} kg known outbound · {missing.length} locations need review</p>
 {error&&<p role="alert" className="text-amber-800">Map could not load. All work remains listed below.</p>}
 <div ref={el} className="relative z-0 h-[440px] w-full rounded-xl border bg-slate-100" aria-label={`Delivery locations for ${day}`}/>
 {!groups.stops.length&&<p>No van deliveries or unassigned orders for this day/filter.</p>}
 {picked&&<div className="rounded-xl bg-blue-50 p-4"><h3 className="font-semibold">{picked.orders[0].name} · {picked.orders[0].vehicleName}</h3><p>{picked.orders[0].address}</p>{picked.orders.map(o=><div key={o.id} className="mt-2"><a href={`#order-${o.id}`} className="underline">Open order details</a><ul className="text-sm">{o.lines.map((l,i)=><li key={i}>{l}</li>)}{o.issues.map(i=><li key={i} className="text-amber-800">{i}</li>)}</ul></div>)}</div>}
 <div className="grid gap-2 md:grid-cols-2">{groups.stops.map(s=><button type="button" onClick={()=>setSelected(s.key)} key={s.key} className={`rounded-lg border p-3 text-left ${selected===s.key?"border-blue-600 bg-blue-50":""}`}><span className="font-semibold">{s.reference}. {s.orders[0].name}</span><span className="block text-sm">{s.orders[0].vehicleName} · {[...new Set(s.orders.map(o=>o.kind))].join(" / ")}</span><span className="block text-xs text-amber-800">{s.orders[0].locationIssue}{s.orders.some(o=>o.totalKg===null)?" · Weight unresolved":""}</span></button>)}</div>
 {(groups.nonVan.length>0||groups.unscheduled.length>0)&&<details><summary className="cursor-pointer">Other work: {groups.nonVan.length} non-van orders today · {groups.unscheduled.length} undated orders</summary><ul className="mt-2 text-sm">{[...groups.nonVan,...groups.unscheduled].map(o=><li key={o.id}><a href={`#order-${o.id}`} className="underline">{o.name}</a> · {o.transport} · {o.date||"No date"}</li>)}</ul></details>}
 <p className="text-xs text-slate-500">Locations reuse matching Account addresses and may be postcode-centre estimates, not delivery entrances. Changed/overridden addresses remain in the review list.</p>
 </section>;
}
