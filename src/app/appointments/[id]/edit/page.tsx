import Link from "next/link";
import { notFound } from "next/navigation";
import { AppointmentForm } from "../../appointment-form";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function EditAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: appointment, error } = await supabase.from("appointments").select("id,account_id,contact_id,starts_at,ends_at,purpose,notes,account:accounts(id,name,contacts(id,full_name,active))").eq("id", id).single();
  if (error || !appointment) notFound();
  const account = Array.isArray(appointment.account) ? appointment.account[0] : appointment.account;
  const contacts = (account?.contacts || []).filter((c) => c.active !== false);
  return <div className="min-h-screen bg-slate-50 text-slate-950"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-2xl px-4 py-4 sm:px-6"><Link href={`/appointments/${id}`} className="text-sm font-medium text-slate-500">← Appointment</Link><h1 className="mt-3 text-2xl font-semibold">Reschedule / edit</h1><p className="mt-1 text-sm text-slate-500">{account?.name}</p></div></header><main className="mx-auto max-w-2xl px-4 py-5 sm:px-6"><div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6"><AppointmentForm contacts={contacts} initial={{ id, accountId: appointment.account_id, contactId: appointment.contact_id, startsAt: appointment.starts_at, endsAt: appointment.ends_at, purpose: appointment.purpose, notes: appointment.notes }} /></div></main></div>;
}
