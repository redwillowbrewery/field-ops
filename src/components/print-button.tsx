"use client";

export function PrintButton(){
 return <button type="button" onClick={()=>window.print()} className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white print:hidden">Print / Save PDF</button>
}
