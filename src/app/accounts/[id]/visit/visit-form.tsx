"use client";

import { useActionState } from "react";
import { logVisit, type LogVisitState } from "./actions";

const initialState: LogVisitState = {};

type Contact = { id: string; full_name: string | null; is_primary: boolean | null };

export function VisitForm({ accountId, contacts }: { accountId: string; contacts: Contact[] }) {
  const [state, action, pending] = useActionState(logVisit, initialState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="account_id" value={accountId} />

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800">Who did you meet?</label>
        <select name="contact_id" defaultValue="" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-slate-600">
          <option value="">No contact selected</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.full_name || "Unnamed contact"}{contact.is_primary ? " (Primary)" : ""}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-800">Outcome</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["good", "Good"],
            ["neutral", "Neutral"],
            ["problem", "Problem"],
            ["opportunity", "Opportunity"],
          ].map(([value, label]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" name="outcome" value={value} defaultChecked={value === "neutral"} className="peer sr-only" />
              <span className="flex h-11 items-center justify-center rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 peer-checked:border-slate-950 peer-checked:bg-slate-950 peer-checked:text-white">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="mb-2 block text-sm font-semibold text-slate-800">Visit notes</label>
        <textarea name="notes" rows={7} placeholder="What happened? What did they say? Any products, pricing or opportunities discussed?" className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-slate-600" />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="font-semibold text-slate-900">Follow-up</h2>
        <p className="mt-1 text-sm text-slate-500">Optional — create the next action while the visit is fresh.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Action</label>
            <select name="task_type" defaultValue="" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-600">
              <option value="">No follow-up</option>
              <option value="call">Call</option>
              <option value="email">Email</option>
              <option value="quote">Send quote</option>
              <option value="samples">Send samples</option>
              <option value="revisit">Revisit</option>
              <option value="order">Order</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Due date</label>
            <input type="date" name="due_date" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-600" />
          </div>
        </div>

        <div className="mt-3">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Follow-up note</label>
          <input name="task_title" placeholder="e.g. Send September cask availability" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-600" />
        </div>
      </div>

      {state.error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}

      <button type="submit" disabled={pending} className="h-12 w-full rounded-xl bg-slate-950 px-4 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
        {pending ? "Saving visit…" : "Complete visit"}
      </button>
    </form>
  );
}
