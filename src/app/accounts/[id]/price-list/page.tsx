import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/bottom-nav";
import { PrintButton } from "@/components/print-button";
import { SmartBackLink } from "@/components/smart-back-link";
import { DecoratedPriceList } from "@/components/decorated-price-list";
import { getAccountSellingData } from "@/lib/account-selling";
import type { AccountContainerPreference } from "@/lib/package-eligibility";
import { createSupabaseServerClient } from "@/lib/supabase";
export default async function AccountPriceListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params; const { format = "all" } = await searchParams;
  const db = await createSupabaseServerClient();
  const { data: account } = await db.from("accounts").select("id,name,container_preference").eq("id", id).single();
  if (!account) notFound();
  const selling = await getAccountSellingData(db, id, (account.container_preference || "any") as AccountContainerPreference);
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 print:bg-white print:pb-0"><header className="border-b border-slate-200 bg-white print:border-0"><div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 print:max-w-none print:px-0">
    <SmartBackLink href={`/accounts/${id}`} className="text-sm font-medium text-slate-500 print:hidden">← {account.name}</SmartBackLink>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Current beer & price list</h1><p className="mt-2 text-sm text-slate-500">Prepared for {account.name} · {selling.observedAt ? `Availability checked ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(selling.observedAt))}` : "Availability not loaded"}</p>
    <div className="mt-4 flex flex-wrap gap-2 print:hidden">{["all", "cask", "keg", "can"].map(f => <Link key={f} href={`/accounts/${id}/price-list?format=${f}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${format === f ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)}</Link>)}<PrintButton /><Link href={`/accounts/${id}/share-price-list`} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold">Share live list</Link></div>
  </div></header><main className="mx-auto max-w-5xl px-4 py-5 sm:px-6 print:max-w-none print:px-0"><DecoratedPriceList selling={selling} format={format} /></main><BottomNav active="Accounts" /></div>;
}
