import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";
import { VisitForm } from "./visit-form";

export default async function LogVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id,name,town,postcode,contacts(id,full_name,is_primary)")
    .eq("id", id)
    .single();

  if (error || !account) notFound();
  const contacts = [...(account.contacts || [])].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <Link href={`/accounts/${account.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
            {account.name}
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Log visit</h1>
          <p className="mt-1 text-sm text-slate-500">{[account.town, account.postcode].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <VisitForm accountId={account.id} contacts={contacts} />
        </div>
      </main>
    </div>
  );
}
