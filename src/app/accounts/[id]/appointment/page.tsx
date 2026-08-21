import Link from "next/link";
import { notFound } from "next/navigation";
import { AppointmentForm } from "@/app/appointments/appointment-form";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function CreateAppointmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: account, error } = await supabase.from("accounts").select("id,name,town,postcode,contacts(id,full_name,active)").eq("id", id).single();
  if (error || !account) notFound();
  const contacts = (account.contacts || []).filter((c) => c.active !== false);
  const startsAt = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? `${date}T10:00:00` : undefined;
  return <div className="min-h-screen bg-slate-50 text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-2xl px-4 py-4 sm:px-6"><Link href={`/accounts/${id}`} className="text-sm font-medium text-slate-500">← {account.name}</Link><h1 className="mt-3 text-2xl font-semibold">Create appointment</h1><p className="mt-1 text-sm text-slate-500">{[account.town, account.postcode].filter(Boolean).join(" · ")}</p></div></header><main className="mx-auto max-w-2xl px-4 py-5 sm:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><AppointmentForm contacts={contacts} initial={{ accountId: id, startsAt }} /></div></main></div>;
}
