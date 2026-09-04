import Link from "next/link";
import {notFound} from "next/navigation";
import {BottomNav} from "@/components/bottom-nav";
import {createSupabaseServerClient} from "@/lib/supabase";
import {InteractionForm} from "./interaction-form";

export default async function InteractionPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{channel?:string;weekly_plan_id?:string}>}){
 const {id}=await params;const query=await searchParams;const db=await createSupabaseServerClient();const {data:account}=await db.from("accounts").select("id,name,contacts(id,full_name,is_primary,active)").eq("id",id).single();if(!account)notFound();const contacts=(account.contacts||[]).filter(contact=>contact.active).sort((a,b)=>Number(b.is_primary)-Number(a.is_primary));const initialChannel=["call","email","whatsapp"].includes(query.channel||"")?query.channel!:"call";
 return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950"><BottomNav active="Accounts"/><main className="mx-auto max-w-xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-3 text-3xl font-semibold">Record contact</h1><p className="mt-2 text-sm text-slate-500">Capture the outcome and next action while it is fresh.</p><div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><InteractionForm accountId={id} contacts={contacts} initialChannel={initialChannel} weeklyPlanId={query.weekly_plan_id||""}/></div></main></div>;
}
