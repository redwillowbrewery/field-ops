import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function AddAccountNotePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createSupabaseServerClient();
  const {data:account}=await supabase.from("accounts").select("id,name,town,postcode").eq("id",id).single();if(!account)notFound();
  async function addNote(formData:FormData){"use server";const body=String(formData.get("body")||"").trim();if(!body)return;const client=await createSupabaseServerClient();const {data:{user}}=await client.auth.getUser();const {error}=await client.from("account_notes").insert({account_id:id,author_id:user?.id||null,body});if(error)throw error;revalidatePath(`/accounts/${id}`);redirect(`/accounts/${id}`);}
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"><BottomNav active="Accounts"/><main className="mx-auto max-w-2xl px-4 py-5 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-4 text-3xl font-semibold tracking-tight">Add note</h1><p className="mt-2 text-sm text-slate-500">{[account.town,account.postcode].filter(Boolean).join(" · ")} · Capture useful customer context without logging a visit.</p><form action={addNote} className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><label htmlFor="body" className="text-sm font-semibold">Note</label><textarea id="body" name="body" required autoFocus rows={7} placeholder="e.g. Spoke to Dave — interested in Godless when current lager contract ends." className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 text-base outline-none focus:border-slate-950"/><div className="mt-4 flex gap-2"><button type="submit" className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Save note</button><Link href={`/accounts/${id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold">Cancel</Link></div></form></main></div>;
}
