"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAppointment, updateAppointment, type AppointmentState } from "./actions";

const initialState: AppointmentState = {};

type Contact = { id: string; full_name: string | null };
type Initial = { id?: string; accountId: string; contactId?: string | null; startsAt?: string; endsAt?: string | null; purpose?: string | null; notes?: string | null };

export function AppointmentForm({ contacts, initial }: { contacts: Contact[]; initial: Initial }) {
  const router = useRouter();
  const action = initial.id ? updateAppointment : createAppointment;
  const [state, formAction, pending] = useActionState(action, initialState);
  const starts = initial.startsAt ? new Date(initial.startsAt) : nextHalfHour();
  const duration = initial.endsAt ? Math.max(15, Math.round((new Date(initial.endsAt).getTime() - starts.getTime()) / 60000)) : 30;

  useEffect(() => {
    if (state.redirectTo) router.replace(state.redirectTo);
  }, [router, state.redirectTo]);

  return <form action={formAction} className="space-y-5">
    {initial.id && <input type="hidden" name="appointment_id" value={initial.id} />}
    <input type="hidden" name="account_id" value={initial.accountId} />
    <div><label className="mb-2 block text-sm font-semibold">Contact</label><select name="contact_id" defaultValue={initial.contactId || ""} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">No contact selected</option>{contacts.map(c=><option key={c.id} value={c.id}>{c.full_name || "Unnamed contact"}</option>)}</select></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <div><label className="mb-2 block text-sm font-semibold">Date</label><input type="date" name="date" defaultValue={localDate(starts)} required className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
      <div><label className="mb-2 block text-sm font-semibold">Time</label><input type="time" name="time" defaultValue={localTime(starts)} required className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
      <div><label className="mb-2 block text-sm font-semibold">Duration</label><select name="duration" defaultValue={String(duration)} className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{[15,30,45,60,90,120].map(n=><option key={n} value={n}>{n} min</option>)}</select></div>
    </div>
    <div><label className="mb-2 block text-sm font-semibold">Purpose</label><input name="purpose" defaultValue={initial.purpose || "Sales visit"} className="h-12 w-full rounded-xl border border-slate-300 px-3" /></div>
    <div><label className="mb-2 block text-sm font-semibold">Notes</label><textarea name="notes" rows={5} defaultValue={initial.notes || ""} className="w-full rounded-xl border border-slate-300 px-3 py-3" placeholder="Anything to prepare, discuss or bring?" /></div>
    {state.error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
    <button disabled={pending || Boolean(state.redirectTo)} className="h-12 w-full rounded-xl bg-slate-950 px-4 font-semibold text-white">{pending || state.redirectTo ? "Saving…" : initial.id ? "Save changes" : "Create appointment"}</button>
  </form>;
}
function nextHalfHour(){const d=new Date();d.setSeconds(0,0);d.setMinutes(d.getMinutes()<30?30:0);if(d.getMinutes()===0)d.setHours(d.getHours()+1);return d;}
function localDate(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function localTime(d:Date){return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;}
