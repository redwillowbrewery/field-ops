import {ProductInformationDetails} from "@/components/product-information-details";
import type { AccountSellingResult, AccountSellingRow } from "@/lib/account-selling";
import { allowedPriceListImage } from "@/lib/price-list-policy";

export function DecoratedPriceList({ selling, format = "all" }: { selling: AccountSellingResult; format?: string }) {
  const grouped = new Map<string, { item: AccountSellingRow; rows: AccountSellingRow[] }>();
  for (const row of selling.rows) {
    if (format !== "all" && row.broadFormat !== format) continue;
    const group = grouped.get(row.productId) || { item: row, rows: [] };
    group.rows.push(row); grouped.set(row.productId, group);
  }
  const products = [...grouped.values()].sort((a, b) => a.item.productName.localeCompare(b.item.productName));
  return <div className="space-y-4">
    {selling.lastRefreshError ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Showing the last known availability; the latest refresh could not be confirmed.</p> : null}
    {products.map(({ item, rows }) => {
      const image = allowedPriceListImage(item.imageUrl);
      return <section key={item.productId} className="break-inside-avoid rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex items-start gap-4">
          {/* Product artwork has variable external dimensions; never send a customer link as its referrer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image ? <img src={image} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : null}
          <div className="min-w-0"><h2 className="text-lg font-semibold">{item.productName}</h2>{item.abv != null ? <p className="text-sm text-slate-500">{item.abv}% ABV</p> : null}{item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p> : null}</div>
        </div>
        <div className="mt-4 border-t border-slate-100">{rows.map(row => <div key={row.variantId} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-50 py-2.5 text-sm">
          <div>{row.packageLabel}<span className="ml-2 text-xs text-emerald-700">Available</span><ProductInformationDetails information={row.information}/></div>
          <span className="text-right font-semibold">{money(row.customerPrice ?? row.listPrice)}</span>
        </div>)}</div>
      </section>;
    })}
    {!products.length ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">No available products to show for this selection. Please contact Sales for the latest options.</p> : null}
  </div>;
}
function money(value: number | null) { return value == null ? "Ask for price" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value); }
