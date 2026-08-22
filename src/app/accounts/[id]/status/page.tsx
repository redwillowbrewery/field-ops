import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";

const statuses=[
  {value:"current",label:"Current",help:"Active customer we expect to keep trading with."},
  {value:"cooling",label:"Cooling",help:"Ordering or engagement is slowing and needs attention."},
  {value:"lapsed",label:"Lapsed",help:"Previously active but has not ordered for a meaningful period."},
  {value:"dormant",label:"Dormant",help:"Known account we do not want in the normal targeting queue. Keep for future reactivation."},
  {value:"closed",label:"Closed",help:"Business/account is gone or should no longer appear in sales targeting."},
] as const;

export default async function AccountStatusPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();
  const {data:account}=await supabase.from("accounts").select("id,name,relationship_status,town,postcode").eq("id",id).single();if(!account)notFound();
  async function updateStatus(formData:FormData){"use server";const status=String(formData.get("status")||"");if(!statuses.some(s=>s.value===status))throw new Error("Invalid account status");const client=await createSupabaseServerClient();const {error}=await client.from("accounts").update({relationship_status:status}).eq("id",id);if(error)throw error;revalidatePath(`/accounts/${id}`);revalidatePath("/accounts");revalidatePath("/sales-intelligence");redirect(`/accounts/${id}`);}
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-2xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">Account status</h1><p className="mt-2 text-sm text-slate-500">{[account.town,account.postcode].filter(Boolean).join(" · ")}</p><form action={updateStatus} className="mt-6 space-y-3">{statuses.map(s=><label key={s.value} className={`block cursor-pointer rounded-2xl border bg-white p-4 shadow-sm ${account.relationship_status===s.value?"border-slate-950 ring-1 ring-slate-950":"border-slate-200"}`}><div className="flex items-start gap-3"><input type="radio" name="status" value={s.value} defaultChecked={account.relationship_status===s.value} className="mt-1"/><div><p className="font-semibold">{s.label}</p><p className="mt-1 text-sm text-slate-500">{s.help}</p></div></div></label>)}<div className="flex gap-2 pt-2"><button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Save status</button><Link href={`/accounts/${id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></form></main></div>;
}
