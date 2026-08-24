"use client";

import {useEffect,useState} from "react";
import {usePathname,useRouter,useSearchParams} from "next/navigation";

export function AccountLiveSearch({initialValue=""}:{initialValue?:string}){
 const router=useRouter();const pathname=usePathname();const searchParams=useSearchParams();const [value,setValue]=useState(initialValue);
 useEffect(()=>{const timer=setTimeout(()=>{const params=new URLSearchParams(searchParams.toString());const next=value.trim();if(next)params.set("q",next);else params.delete("q");router.replace(`${pathname}${params.toString()?`?${params.toString()}`:""}`,{scroll:false});},250);return()=>clearTimeout(timer);},[value,pathname,router,searchParams]);
 return <label className="relative block"><span className="sr-only">Search accounts</span><svg className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input name="q" value={value} onChange={e=>setValue(e.target.value)} autoComplete="off" placeholder="Start typing an account name…" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-slate-500"/></label>;
}
