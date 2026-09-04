import {notFound} from "next/navigation";
import {BottomNav} from "@/components/bottom-nav";
import {SmartBackLink} from "@/components/smart-back-link";
import {getAccountSellingData} from "@/lib/account-selling";
import type {AccountContainerPreference} from "@/lib/package-eligibility";
import {createSupabaseServerClient} from "@/lib/supabase";
import {AvailabilitySelector} from "./availability-selector";

export default async function AvailabilityPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const db=await createSupabaseServerClient();
 const {data:account}=await db.from("accounts").select("id,name,town,postcode,container_preference").eq("id",id).single();if(!account)notFound();
 const preference=(account.container_preference||"any") as AccountContainerPreference;const selling=await getAccountSellingData(db,id,preference);
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><SmartBackLink href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</SmartBackLink><div className="mt-3 flex flex-wrap items-center gap-2"><h1 className="text-3xl font-semibold tracking-tight">What can I sell them?</h1>{preference==="one_way_only"?<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">ONE-WAY ONLY</span>:null}</div><p className="mt-2 text-sm text-slate-500">Current availability and customer pricing · {selling.observedAt?`checked ${relativeTime(selling.observedAt)}`:"not loaded"} · {[account.town,account.postcode].filter(Boolean).join(" · ")}</p>{selling.lastRefreshError&&selling.rows.length?<div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Showing the last known availability; the latest refresh failed.</div>:null}<AvailabilitySelector accountId={id} rows={selling.rows} loaded={Boolean(selling.observedAt)}/></main></div>;
}
function relativeTime(value:string){const minutes=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));return minutes<1?"just now":minutes<60?`${minutes}m ago`:`${Math.round(minutes/60)}h ago`}
