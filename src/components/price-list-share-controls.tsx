"use client";
import { useState, useTransition } from "react";
import { managePriceListLink } from "@/app/accounts/[id]/share-price-list/actions";
export function PriceListShareControls({ accountId, initialPath, onChange }: { accountId: string; initialPath: string | null; onChange?: (path: string | null) => void }) {
  const [path, setPath] = useState(initialPath);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  function update(action: "create" | "replace" | "revoke") {
    startTransition(async () => {
      try {
        const result = await managePriceListLink(accountId, action);
        if (result.error) { setNotice(result.error); return; }
        const next = result.path ?? null;
        setPath(next); onChange?.(next);
        setNotice(action === "revoke" ? "Customer link revoked." : action === "replace" ? "New link ready. The previous link no longer works." : "Customer link ready to copy.");
      } catch { setNotice("Could not update the link. Please try again."); }
    });
  }
  async function copy(target: string, label: string) {
    const url = new URL(target, window.location.origin).href;
    try { await navigator.clipboard.writeText(url); setNotice(`${label} copied.`); }
    catch { setNotice(`Copy this link: ${url}`); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="font-semibold">Share a live price list</h2>
    <p className="mt-1 text-sm text-slate-500">Opens without a login. Customer links show this Account’s prices and package options; anyone you give the link to can view them.</p>
    <div className="mt-4 flex flex-wrap gap-2">
      {path ? <>
        <button type="button" disabled={pending} onClick={() => copy(path, "Customer link")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Copy customer link</button>
        <a href={path} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm">Preview</a>
        <button type="button" disabled={pending} onClick={() => update("replace")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm disabled:opacity-50">Replace link</button>
        <button type="button" disabled={pending} onClick={() => update("revoke")} className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm text-rose-800 disabled:opacity-50">Revoke link</button>
      </> : <button type="button" disabled={pending} onClick={() => update("create")} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Creating…" : "Create customer link"}</button>}
    </div>
    <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-sm text-slate-500">Generic version: standard list prices, suitable for prospects and general sharing.</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => copy("/price-list", "Generic link")} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold">Copy generic link</button><a href="/price-list" target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm">Preview generic list</a></div></div>
    {notice ? <p role="status" className="mt-3 break-all text-sm text-slate-600">{notice}</p> : null}
  </section>;
}
