"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createProspect, type ProspectState } from "./actions";

const initialState: ProspectState = {};

export function ProspectForm() {
  const [state, action, pending] = useActionState(createProspect, initialState);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [duplicateReviewed,setDuplicateReviewed]=useState(false);

  function useLocation() {
    setLocationMessage(null);
    if (!navigator.geolocation) {
      setLocationMessage("Location isn’t available on this device.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setLocationMessage("Current location captured.");
      },
      () => setLocationMessage("Couldn’t get your location. Check browser location permission."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="latitude" value={location?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={location?.longitude ?? ""} />
      <input type="hidden" name="duplicate_reviewed" value={duplicateReviewed?"yes":"no"}/>

      <div>
        <label className="mb-2 block text-sm font-semibold">Prospect name</label>
        <input name="name" required autoFocus className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base" placeholder="Pub, bar, shop or venue name" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-semibold">Type</label>
          <select name="classification" defaultValue="Pub" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3">
            <option>Pub</option><option>Restaurant</option><option>Bar</option><option>Hotel</option><option>Off-Licence</option><option>Shop</option><option>Brewery</option><option>Distributor</option><option value="">Other / unknown</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-semibold">Town</label>
          <input name="town" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-2 block text-sm font-semibold">Address</label><input name="address_line_1" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
        <div><label className="mb-2 block text-sm font-semibold">Postcode</label><input name="postcode" autoCapitalize="characters" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 uppercase" /></div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-semibold">Map location</p><p className="mt-1 text-sm text-slate-500">Useful when adding a prospect while you’re standing nearby.</p></div>
          <button type="button" onClick={useLocation} className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold">Use my location</button>
        </div>
        {locationMessage && <p className={`mt-3 text-sm ${location ? "text-emerald-700" : "text-rose-700"}`}>{locationMessage}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="mb-2 block text-sm font-semibold">Phone</label><input name="phone" type="tel" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
        <div><label className="mb-2 block text-sm font-semibold">Email</label><input name="email" type="email" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
      </div>
      <div><label className="mb-2 block text-sm font-semibold">Website</label><input name="website" inputMode="url" className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="font-semibold">Contact met</h2>
        <p className="mt-1 text-sm text-slate-500">Optional — add the person you spoke to while it’s fresh.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Name</label><input name="contact_name" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label><input name="contact_role" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</label><input name="contact_phone" type="tel" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
          <div className="sm:col-span-2"><label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label><input name="contact_email" type="email" className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3" /></div>
        </div>
      </div>

      <div><label className="mb-2 block text-sm font-semibold">Notes</label><textarea name="notes" rows={5} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3" placeholder="What caught your eye? Who did you speak to? Any useful sales context?" /></div>

      {state.matches?.length?<section className="rounded-2xl border border-amber-300 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">Could this Account already exist?</h2><p className="mt-1 text-sm text-amber-900">Review these explainable matches. Open the existing Account if it is the same business; Brewery Ops will never merge it automatically.</p><div className="mt-3 space-y-2">{state.matches.map(match=><Link key={match.id} href={`/accounts/${match.id}`} className="block rounded-xl bg-white p-3 text-sm ring-1 ring-amber-200"><span className="font-semibold">{match.name}</span><span className="ml-2 text-slate-500">{[match.town,match.postcode,match.relationship_status].filter(Boolean).join(" · ")}</span></Link>)}</div><label className="mt-4 flex items-start gap-2 text-sm font-medium text-amber-950"><input type="checkbox" checked={duplicateReviewed} onChange={event=>setDuplicateReviewed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-slate-950"/>I reviewed these Accounts and this is a different business.</label></section>:null}
      {state.error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>}
      <button disabled={pending||Boolean(state.matches?.length&&!duplicateReviewed)} className="h-12 w-full rounded-xl bg-slate-950 px-4 text-base font-semibold text-white disabled:opacity-60">{pending ? "Saving prospect…" : state.matches?.length?"Create separate prospect":"Add prospect"}</button>
    </form>
  );
}
