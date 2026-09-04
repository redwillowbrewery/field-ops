"use client";

import Link from "next/link";
import {useState} from "react";

export function AccountContactAction({accountId,type,target,label,weeklyPlanId}:{accountId:string;type:"call"|"email"|"whatsapp";target:string|null;label:string;weeklyPlanId?:string}){
 const [launched,setLaunched]=useState(false);
 const disabled=!target;
 function handle(){if(!target)return;setLaunched(true);window.location.href=type==="call"?`tel:${target}`:type==="email"?`mailto:${target}`:`https://wa.me/${target.replace(/\D/g,"")}`;}
 const c="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold hover:bg-slate-100";
 const params=new URLSearchParams({channel:type});if(weeklyPlanId)params.set("weekly_plan_id",weeklyPlanId);
 return <div className="flex flex-col gap-1"><button type="button" onClick={handle} disabled={disabled} className={`${c} ${disabled?"opacity-40":""}`}>{label}</button>{launched?<Link href={`/accounts/${accountId}/interaction?${params}`} className="text-center text-xs font-semibold text-slate-700 underline">Record outcome</Link>:null}</div>;
}
