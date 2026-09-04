"use client";

import { useMemo, useState } from "react";

type Row={variantId:string;format:"cask"|"keg"|"can";packageType:string;name:string;description:string;price:number};

export function QuickPriceEmail({accountId,accountName,recipient,rows,initialVariantIds,explicitSelection,sellarUrl}:{accountId:string;accountName:string;recipient:string;rows:Row[];initialVariantIds:string[];explicitSelection:boolean;sellarUrl:string}){
 const [selectedIds,setSelectedIds]=useState<Set<string>>(()=>new Set(explicitSelection?initialVariantIds:rows.map(row=>row.variantId)));
 const [to,setTo]=useState(recipient);
 const selected=useMemo(()=>rows.filter(row=>selectedIds.has(row.variantId)),[rows,selectedIds]);
 function toggleRow(id:string){setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
 function toggleFormat(format:Row["format"]){const ids=rows.filter(row=>row.format===format).map(row=>row.variantId);setSelectedIds(current=>{const next=new Set(current);const remove=ids.every(id=>next.has(id));ids.forEach(id=>remove?next.delete(id):next.add(id));return next})}
 async function openEmail(){
  if(!to.trim()||!selected.length)return;
  try{await fetch(`/api/accounts/${accountId}/quick-price-email/log`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recipient:to,formats:[...new Set(selected.map(row=>row.format))],variantIds:selected.map(row=>row.variantId)})});}catch{}
  const subject=`RedWillow Brewery - current availability & prices`;
  const intro=`Hi,\n\nHere is our current availability and your trade pricing.\n`;
  const groups:[Row["format"],string][]=[["cask","CASK"],["keg","KEG"],["can","CAN"]];
  const sections=groups.map(([f,label])=>{const items=selected.filter(r=>r.format===f);if(!items.length)return"";const lines=items.map(r=>`${r.name} | ${r.packageType} | ${money(r.price)}${r.description?` | ${r.description}`:""}`);return `\n${label}\nBeer | Package | Price | Description\n${lines.join("\n")}`;}).filter(Boolean).join("\n");
  const footer=`\n\nFor images, tasting notes and more product information, view our Sellar shop:\n${sellarUrl}\n\nPrices shown are your current trade prices and availability is subject to confirmation.\n\nCheers,\nRedWillow Brewery`;
  window.location.href=`mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(intro+sections+footer)}`;
 }
 return <div className="space-y-4">
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><label className="text-sm font-semibold" htmlFor="recipient">To</label><input id="recipient" value={to} onChange={e=>setTo(e.target.value)} type="email" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5" placeholder="customer@example.com"/><div className="mt-4"><p className="text-sm font-semibold">Include</p><div className="mt-2 flex flex-wrap gap-2">{(["cask","keg","can"] as Row["format"][]).map(format=><button key={format} type="button" onClick={()=>toggleFormat(format)} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">{cap(format)}</button>)}</div></div></section>
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-3"><p className="font-semibold">Preview</p><p className="text-xs text-slate-500">{selected.length} currently available product{selected.length===1?"":"s"} for {accountName}</p></div><div className="divide-y divide-slate-100">{rows.map(row=><label key={row.variantId} className="grid cursor-pointer grid-cols-[auto_72px_1fr_auto] gap-3 px-4 py-3 text-sm"><input type="checkbox" checked={selectedIds.has(row.variantId)} onChange={()=>toggleRow(row.variantId)} className="mt-1 h-4 w-4 accent-slate-950"/><span className="font-semibold text-slate-500">{row.packageType}</span><div><p className="font-semibold">{row.name}</p>{row.description?<p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-500">{row.description}</p>:null}</div><span className="font-semibold">{money(row.price)}</span></label>)}</div>{!rows.length?<p className="p-6 text-sm text-slate-500">No priced products are currently available for this account.</p>:null}</section>
  <button type="button" onClick={openEmail} disabled={!to.trim()||!selected.length} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">Open email</button>
  <p className="text-xs text-slate-400">This opens your normal email app with the message filled in. Brewery Ops logs that the quick list was prepared; sending remains in your email app.</p>
 </div>;
}
function cap(v:string){return v.charAt(0).toUpperCase()+v.slice(1)}
function money(v:number){return new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",minimumFractionDigits:2,maximumFractionDigits:2}).format(v)}
