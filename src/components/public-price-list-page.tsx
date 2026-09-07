import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { DecoratedPriceList } from "@/components/decorated-price-list";
import { getPublicPriceList } from "@/lib/public-price-list";

export async function PublicPriceListPage({ token, format = "all" }: { token?: string; format?: string }) {
  const result = await getPublicPriceList(token);
  if (!result) notFound();
  const { accountName, selling } = result;
  const base = token ? `/price-list/${token}` : "/price-list";
  const selectedFormat = ["all", "cask", "keg", "can"].includes(format) ? format : "all";
  const email = process.env.NEXT_PUBLIC_SALES_EMAIL || "sales@redwillowbrewery.com";
  return <div className="min-h-screen bg-slate-50 pb-10 text-slate-950 print:bg-white">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-7 sm:px-6">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-rose-800">RedWillow Brewery</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Current beer & price list</h1>
      <p className="mt-2 text-sm text-slate-600">{accountName ? `Prepared for ${accountName}` : "Standard trade list prices"}</p>
      <p className="mt-2 text-xs text-slate-500">{selling.observedAt ? `Availability checked ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(selling.observedAt))} (UK time)` : "Availability has not been loaded yet"}. Prices and availability update when you reopen or refresh this page; please confirm your order with Sales.</p>
      <nav aria-label="Package formats" className="mt-5 flex flex-wrap gap-2 print:hidden">{["all", "cask", "keg", "can"].map(f => <Link prefetch={false} key={f} href={`${base}?format=${f}`} aria-current={selectedFormat === f ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${selectedFormat === f ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{f === "all" ? "All" : f === "can" ? "Cans" : f[0].toUpperCase() + f.slice(1)}</Link>)}<PrintButton /></nav>
    </div></header>
    <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><DecoratedPriceList selling={selling} format={selectedFormat} />
      <section className="mt-6 rounded-2xl bg-slate-950 p-5 text-white"><h2 className="text-lg font-semibold">Ready to order?</h2><p className="mt-2 text-sm text-slate-200">Contact the RedWillow Sales team to confirm availability and arrange your order.</p>{email ? <a href={`mailto:${email}?subject=RedWillow%20beer%20order`} className="mt-4 inline-block rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950">Contact Sales to order</a> : <p className="mt-3 text-sm">Reply to your salesperson’s email or contact your usual RedWillow representative.</p>}</section>
    </main>
  </div>;
}
