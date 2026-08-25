"use client";

import { useMemo, useState } from "react";

type Row={format:"cask"|"keg"|"can";name:string;description:string;price:number};

export function QuickPriceEmail({accountId,accountName,recipient,rows,sellarUrl}:{accountId:string;accountName:string;recipient:string;rows:Row[];sellarUrl:string}){
 const [formats,setFormats]=useState<Set<Row["format"]>>(new Set(["cask","keg","can"]));
 const [to,setTo]=useState(recipient);
 const selected=useMemo(()=>rows.filter(r=>formats.has(r.format)),[rows,formats]);
 function toggle(format:Row["format"]){setFormats(current=>{const next=new Set(current);if(next.has(format))next.delete(format);else next.add(format);return next;});}
 async function openEmail(){
  if(!to.trim()||!selected.length)return;
  const formatLabel=[...formats].map(cap).join(" + ");
  try{await fetch(`/api/accounts/${accountId}/quick-price-email/log`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:to,formats:[...formats]})});}catch{}
  const subject=`RedWillow Brewery - current availability & prices`;
  const intro=`Hi,\n\nHere is our current availability and your trade pricing.\n`;
  const groups:[Row["format"],string][]=[["cask","CASK"],["keg","KEG"],["can","CAN"]];
  const sections=groups.filter(([f])=>formats.has(f)).map(([f,label])=>{const items=selected.filter(r=>r.format===f);if(!items.length)return"";const lines=items.map(r=>`${r.name} — ${r.description} — ${money(r.price)}`);return `\n${label}\n${lines.join("\n")}`;}).filter(Boolean).join("\n");
  const footer=`\n\nFor images, tasting notes and more product information, view our Sellar shop:\n${sellarUrl}\n\nPrices shown are your current trade prices and availability is subject to confirmation.\n\nCheers,\nRedWillow Brewery`;
  window.location.href=`mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(intro+sections+footer)}`;
 }
 return <div className="space-y-4">
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><label className="text-sm font-semibold" htmlFor="recipient">To</label><input id="recipient" value={to} onChange={e=>setTo(e.target.value)} type="email" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="customer@example.com"/><div className="mt-4"><p className="text-sm font-semibold">Include</p><div className="mt-2 flex flex-wrap gap-2">{(["cask","keg","can"] as Row["format"][]).map(f=><button key={f} type="button" onClick={()=>toggle(f)} className={`rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-inset ${formats.has(f)?"bg-slate-950 text-white ring-slate-950":"bg-white text-slate-600 ring-slate-200"}`}>{cap(f)}</button>)}</div></div></section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><p className="font-semibold">Preview</p><p className="text-xs text-slate-500">{selected.length} currently available product{selected.length===1?"":"s"} for {accountName}</p></div>{selected.length?<div className="divide-y divide-slate-100">{selected.map((r,i)=><div key={`${r.format}-${r.name}-${i}`} className="grid grid-cols-[80px_1fr_auto] gap-3 px-4 py-3 text-sm"><span className="font-semibold capitalize text-slate-500">{r.format}</span><div><p className="font-semibold">{r.name}</p><p className="mt-0.5 text-xs leading-5 text-slate-500">{r.description}</p></div><span className="font-semibold">{money(r.price)}</span></div>)}</div>:<p className="p-6 text-sm text-slate-500">Select at least one format.</p>}</section>
  <button type="button" onClick={openEmail} disabled={!to.trim()||!selected.length} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Open email</button>
  <p className="text-xs text-slate-400">This opens your normal email app with the message filled in. Brewery Ops logs that the quick list was prepared; sending remains in your email app.</p>
 </div>;
}
function cap(v:string){return v.charAt(0).toUpperCase()+v.slice(1)}
function money(v:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:2,maximumFractionDigits:2}).format(v)}
