"use client";

import { useRouter } from "next/navigation";

export function AccountContactAction({accountId,type,target,label,weeklyPlanId}:{accountId:string;type:"call"|"email";target:string|null;label:string;weeklyPlanId?:string}){
 const router=useRouter();
 const disabled=!target;
 async function handle(){if(!target)return;try{const response=await fetch(`/api/accounts/${accountId}/interactions`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({interaction_type:type,target,weekly_plan_id:weeklyPlanId})});if(response.ok)router.refresh();}catch{}window.location.href=type==="call"?`tel:${target}`:`mailto:${target}`;}
 const c="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold hover:bg-slate-100";
 return <button type="button" onClick={handle} disabled={disabled} className={`${c} ${disabled?"opacity-40":""}`}>{label}</button>;
}
