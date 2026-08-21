import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";

const RELATIONSHIP_STATUSES = ["current", "cooling", "lapsed", "dormant", "prospect", "closed"];

type TerritoryRelation = { name?: string | null } | { name?: string | null }[] | null;
type SalesRelation = { last_order_date?: string | null; total_spend?: number | null; total_orders?: number | null } | { last_order_date?: string | null; total_spend?: number | null; total_orders?: number | null }[] | null;

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; classification?: string; territory?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const status = params.status || "";
  const classification = params.classification || "";
  const territory = params.territory || "";

  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("accounts")
    .select(
      `id,name,town,postcode,classification,relationship_status,brewery_location_zone,
       territory:territories(id,name),
       sales:account_sales_snapshot(last_order_date,total_spend,total_orders)`,
      { count: "exact" }
    )
    .order("name", { ascending: true })
    .limit(100);

  if (q) {
    const safe = q.replace(/[,%()]/g, " ").trim();
    query = query.or(`name.ilike.%${safe}%,town.ilike.%${safe}%,postcode.ilike.%${safe}%`);
  }
  if (status && RELATIONSHIP_STATUSES.includes(status)) query = query.eq("relationship_status", status);
  if (classification) query = query.eq("classification", classification);
  if (territory) query = query.eq("brewery_location_zone", territory);

  const [{ data: accounts, count, error }, { data: classificationRows }, { data: territoryRows }] =
    await Promise.all([
      query,
      supabase.from("accounts").select("classification").not("classification", "is", null),
      supabase.from("territories").select("name").order("name"),
    ]);

  if (error) throw new Error(error.message);

  const classifications = [...new Set((classificationRows || []).map((row) => row.classification).filter(Boolean))].sort();
  const territories = (territoryRows || []).map((row) => row.name);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field Ops</p>
              <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/prospects/new?from=accounts" className="inline-flex h-10 items-center rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">+ Add prospect</Link>
              <div className="hidden text-right md:block">
                <p className="text-sm font-medium">{count ?? 0} matches</p>
                <p className="text-xs text-slate-500">Showing up to 100</p>
              </div>
            </div>
          </div>

          <form className="mt-4 grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_220px_auto]" action="/accounts">
            <label className="relative block">
              <span className="sr-only">Search accounts</span>
              <svg className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
              <input name="q" defaultValue={q} placeholder="Search name, town or postcode" className="h-11 w-full rounded-xl border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none ring-0 transition focus:border-slate-500" />
            </label>

            <FilterSelect name="status" defaultValue={status} label="All statuses" options={RELATIONSHIP_STATUSES} />
            <FilterSelect name="classification" defaultValue={classification} label="All types" options={classifications} />
            <FilterSelect name="territory" defaultValue={territory} label="All territories" options={territories} />

            <button className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">Filter</button>
          </form>

          {(q || status || classification || territory) && (
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{count ?? 0} matching accounts</span>
              <Link href="/accounts" className="font-medium text-slate-700 underline underline-offset-2">Clear filters</Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <div className="mb-3 md:hidden">
          <p className="text-sm font-medium">{count ?? 0} matches</p>
          <p className="text-xs text-slate-500">Showing up to 100 accounts</p>
        </div>

        <div className="grid gap-3">
          {(accounts || []).map((account) => {
            const salesRelation = account.sales as SalesRelation;
            const sales = Array.isArray(salesRelation) ? salesRelation[0] : salesRelation;
            const territoryRelation = account.territory as TerritoryRelation;
            const territoryName = Array.isArray(territoryRelation) ? territoryRelation[0]?.name : territoryRelation?.name;
            return (
              <Link key={account.id} href={`/accounts/${account.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold sm:text-lg">{account.name}</h2>
                      <StatusBadge status={account.relationship_status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{[account.town, account.postcode].filter(Boolean).join(" · ") || "No address location"}</p>
                  </div>
                  <svg className="mt-1 h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                  <Meta label="Type" value={account.classification || "—"} />
                  <Meta label="Territory" value={territoryName || account.brewery_location_zone || "—"} />
                  <Meta label="Last order" value={formatDate(sales?.last_order_date)} />
                  <Meta label="Lifetime sales" value={formatCurrency(sales?.total_spend)} />
                </div>
              </Link>
            );
          })}
        </div>

        {!accounts?.length && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h2 className="font-semibold">No accounts found</h2>
            <p className="mt-1 text-sm text-slate-500">Try clearing a filter or using a broader search.</p>
          </div>
        )}
      </main>

      <BottomNav active="Accounts" />
    </div>
  );
}

function FilterSelect({ name, defaultValue, label, options }: { name: string; defaultValue: string; label: string; options: string[] }) {
  return <select name={name} defaultValue={defaultValue} className="h-11 min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500"><option value="">{label}</option>{options.map((option) => <option key={option} value={option}>{titleCase(option)}</option>)}</select>;
}
function StatusBadge({ status }: { status: string | null }) {
  const styles: Record<string, string> = { current: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", cooling: "bg-amber-50 text-amber-700 ring-amber-600/20", lapsed: "bg-orange-50 text-orange-700 ring-orange-600/20", dormant: "bg-slate-100 text-slate-600 ring-slate-500/20", prospect: "bg-blue-50 text-blue-700 ring-blue-600/20", closed: "bg-rose-50 text-rose-700 ring-rose-600/20" };
  const key = status || "dormant";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset ${styles[key] || styles.dormant}`}>{key}</span>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 truncate font-medium text-slate-700">{value}</p></div>; }
function formatDate(value?: string | null) { if (!value) return "—"; return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function formatCurrency(value?: number | null) { if (value === null || value === undefined) return "—"; return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value); }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
