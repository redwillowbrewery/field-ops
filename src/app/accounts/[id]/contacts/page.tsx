import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { saveContact } from "./actions";

export default async function ContactsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: account, error } = await supabase.from("accounts").select("id,name,town,postcode").eq("id", id).single();
  if (error || !account) notFound();
  const { data: contacts } = await supabase.from("contacts").select("id,full_name,job_title,email,phone,is_primary,active,source,brewery_contact_slot").eq("account_id", id).order("is_primary", { ascending: false }).order("full_name", { ascending: true });
  const editing = (contacts || []).find((contact) => contact.id === edit && contact.source === "field_ops") || null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-3xl px-4 py-4 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500 hover:text-slate-900">← {account.name}</Link><h1 className="mt-3 text-2xl font-semibold tracking-tight">Manage contacts</h1><p className="mt-1 text-sm text-slate-500">{[account.town, account.postcode].filter(Boolean).join(" · ")}</p></div></header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h2 className="font-semibold">{editing ? "Edit Field Ops contact" : "Add contact"}</h2>
          <form action={saveContact} className="mt-4 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="account_id" value={id} />
            <input type="hidden" name="contact_id" value={editing?.id || ""} />
            <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</label><input required name="full_name" defaultValue={editing?.full_name || ""} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label><input name="job_title" defaultValue={editing?.job_title || ""} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
            <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label><input name="phone" type="tel" defaultValue={editing?.phone || ""} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
            <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label><input name="email" type="email" defaultValue={editing?.email || ""} className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" /></div>
            <label className="flex items-center gap-2 text-sm"><input name="is_primary" type="checkbox" defaultChecked={Boolean(editing?.is_primary)} /> Primary contact</label>
            <label className="flex items-center gap-2 text-sm"><input name="active" type="checkbox" defaultChecked={editing ? Boolean(editing.active) : true} /> Active</label>
            <div className="sm:col-span-2 flex gap-2"><button className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">{editing ? "Save changes" : "Add contact"}</button>{editing && <Link href={`/accounts/${id}/contacts`} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</Link>}</div>
          </form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Contacts</h2><span className="text-xs text-slate-400">{contacts?.length || 0}</span></div>
          <div className="divide-y divide-slate-100">
            {(contacts || []).map((contact) => (
              <div key={contact.id} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{contact.full_name || "Unnamed contact"}</p>{contact.is_primary && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">Primary</span>}<span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${contact.source === "field_ops" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}>{contact.source === "field_ops" ? "Field Ops" : "ViewPlan"}</span>{contact.active === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Inactive</span>}</div>{contact.job_title && <p className="mt-1 text-sm text-slate-500">{contact.job_title}</p>}{contact.email && <p className="mt-1 truncate text-sm text-slate-600">{contact.email}</p>}{contact.phone && <p className="text-sm text-slate-600">{contact.phone}</p>}</div>
                {contact.source === "field_ops" ? <Link href={`/accounts/${id}/contacts?edit=${contact.id}`} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">Edit</Link> : <span className="shrink-0 text-xs text-slate-400">Read only</span>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
