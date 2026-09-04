import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";

const statuses=[
  {value:"prospect",label:"Prospect",help:"Pre-customer relationship owned by Brewery Ops; no ViewPlan identity is required."},
  {value:"current",label:"Current",help:"Active customer we expect to keep trading with."},
  {value:"cooling",label:"Cooling",help:"Ordering or engagement is slowing and needs attention."},
  {value:"lapsed",label:"Lapsed",help:"Previously active but has not ordered for a meaningful period."},
  {value:"dormant",label:"Dormant",help:"Known account we do not want in the normal targeting queue. Keep for future reactivation."},
  {value:"closed",label:"Closed",help:"Business/account is gone or should no longer appear in sales targeting."},
] as const;

const containerPreferences=[
  {value:"any",label:"Any packaging",help:"Show all suitable returnable and one-way draught packages."},
  {value:"one_way_only",label:"One-way only",help:"For distributors or distant customers who cannot return our casks or steel kegs. Quick Email will only offer one-way draught packages."},
] as const;

export default async function AccountStatusPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();
  const {data:account}=await supabase.from("accounts").select("id,name,relationship_status,container_preference,town,postcode,brewery_customer_id").eq("id",id).single();if(!account)notFound();
  async function updateAccountSettings(formData:FormData){"use server";
    const status=String(formData.get("status")||"");
    const containerPreference=String(formData.get("container_preference")||"any");
    if(!statuses.some(s=>s.value===status))throw new Error("Invalid account status");
    if(!containerPreferences.some(p=>p.value===containerPreference))throw new Error("Invalid container preference");
    const client=await createSupabaseServerClient();
    const {error}=await client.from("accounts").update({relationship_status:status,container_preference:containerPreference}).eq("id",id);if(error)throw error;
    revalidatePath(`/accounts/${id}`);revalidatePath(`/accounts/${id}/quick-price-email`);revalidatePath(`/accounts/${id}/availability`);revalidatePath("/accounts");revalidatePath("/sales-intelligence");redirect(`/accounts/${id}`);
  }
  async function linkViewPlanAccount(formData:FormData){"use server";const customerId=Number(formData.get("viewplan_customer_id"));const note=String(formData.get("reconciliation_note")||"").trim();if(!Number.isInteger(customerId)||customerId<=0)throw new Error("Enter a valid numeric ViewPlan customer ID.");const client=await createSupabaseServerClient();const {error}=await client.rpc("link_viewplan_account",{p_account_id:id,p_viewplan_customer_id:customerId,p_note:note||null});if(error)throw error;revalidatePath(`/accounts/${id}`);revalidatePath(`/accounts/${id}/status`);redirect(`/accounts/${id}`)}
  const currentPreference=account.container_preference||"any";
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-2xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">Account settings</h1><p className="mt-2 text-sm text-slate-500">{[account.town,account.postcode].filter(Boolean).join(" · ")}</p><form action={updateAccountSettings} className="mt-6 space-y-6"><section><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">Relationship status</h2><div className="space-y-3">{statuses.map(s=><label key={s.value} className={`block cursor-pointer rounded-2xl border bg-white p-4 shadow-sm ${account.relationship_status===s.value?"border-slate-950 ring-1 ring-slate-950":"border-slate-200"}`}><div className="flex items-start gap-3"><input type="radio" name="status" value={s.value} defaultChecked={account.relationship_status===s.value} className="mt-1"/><div><p className="font-semibold">{s.label}</p><p className="mt-1 text-sm text-slate-500">{s.help}</p></div></div></label>)}</div></section><section><h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">Container preference</h2><div className="space-y-3">{containerPreferences.map(p=><label key={p.value} className={`block cursor-pointer rounded-2xl border bg-white p-4 shadow-sm ${currentPreference===p.value?"border-slate-950 ring-1 ring-slate-950":"border-slate-200"}`}><div className="flex items-start gap-3"><input type="radio" name="container_preference" value={p.value} defaultChecked={currentPreference===p.value} className="mt-1"/><div><p className="font-semibold">{p.label}</p><p className="mt-1 text-sm text-slate-500">{p.help}</p></div></div></label>)}</div></section><div className="flex gap-2 pt-2"><button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Save settings</button><Link href={`/accounts/${id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></form>{account.brewery_customer_id?<section className="mt-8 rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">ViewPlan identity</p><p className="mt-2 font-semibold">Customer {account.brewery_customer_id}</p><p className="mt-1 text-sm text-slate-500">Imported fields reconcile to this canonical Account.</p></section>:<form action={linkViewPlanAccount} className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Link trading customer</h2><p className="mt-1 text-sm text-amber-900">After this prospect is created in ViewPlan, attach the exact numeric customer ID here. This is explicit and auditable; Brewery Ops will never guess by name.</p><label className="mt-4 block text-sm font-semibold">ViewPlan customer ID<input name="viewplan_customer_id" type="number" min="1" required className="mt-2 h-11 w-full rounded-xl border border-amber-300 bg-white px-3"/></label><label className="mt-3 block text-sm font-semibold">Reason / reference <span className="font-normal">optional</span><input name="reconciliation_note" maxLength={500} className="mt-2 h-11 w-full rounded-xl border border-amber-300 bg-white px-3"/></label><button className="mt-4 rounded-xl bg-amber-950 px-4 py-2.5 text-sm font-semibold text-white">Attach ViewPlan identity</button></form>}</main></div>;
}
