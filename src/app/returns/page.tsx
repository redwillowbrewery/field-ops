import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { ReturnsMap } from "./returns-map";

type ReturnSummary = {
  account_id: string;
  returnable_count: number;
  oldest_days: number | null;
  package_breakdown: Record<string, number> | null;
};

type Account = {
  id: string;
  name: string;
  town: string | null;
  postcode: string | null;
  address_line_1: string | null;
  latitude: number | null;
  longitude: number | null;
  brewery_available: boolean | null;
};

export default async function ReturnsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: summaries, error: summaryError } = await supabase
    .from("account_returnables_summary")
    .select("account_id,returnable_count,oldest_days,package_breakdown")
    .gt("returnable_count", 0)
    .order("returnable_count", { ascending: false });

  if (summaryError) throw new Error(summaryError.message);

  const summaryRows = (summaries || []) as ReturnSummary[];
  const accountIds = summaryRows.map((row) => row.account_id);
  let accounts: Account[] = [];

  for (let i = 0; i < accountIds.length; i += 250) {
    const batch = accountIds.slice(i, i + 250);
    if (!batch.length) continue;
    const { data, error } = await supabase
      .from("accounts")
      .select("id,name,town,postcode,address_line_1,latitude,longitude,brewery_available")
      .in("id", batch)
      .or("brewery_available.is.null,brewery_available.eq.true");
    if (error) throw new Error(error.message);
    accounts.push(...((data || []) as Account[]));
  }

  const summaryByAccount = new Map(summaryRows.map((row) => [row.account_id, row]));
  const points = accounts.flatMap((account) => {
    const summary = summaryByAccount.get(account.id);
    if (!summary || account.latitude == null || account.longitude == null) return [];
    return [{
      id: account.id,
      name: account.name,
      town: account.town,
      postcode: account.postcode,
      address_line_1: account.address_line_1,
      latitude: Number(account.latitude),
      longitude: Number(account.longitude),
      returnable_count: Number(summary.returnable_count || 0),
      oldest_days: summary.oldest_days == null ? null : Number(summary.oldest_days),
      package_breakdown: summary.package_breakdown || {},
    }];
  });

  const totalReturnables = points.reduce((sum, point) => sum + point.returnable_count, 0);
  const unmappedAccounts = accounts.filter((account) => account.latitude == null || account.longitude == null).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Brewery Ops · Driver</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Returns near me</h1>
              <p className="mt-1 text-sm text-slate-500">Find worthwhile returnable-container collections near your current location.</p>
            </div>
            <Link href="/map" className="inline-flex h-10 shrink-0 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Sales map</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <ReturnsMap points={points} totalReturnables={totalReturnables} unmappedAccounts={unmappedAccounts} />
      </main>
      <BottomNav active="Map" />
    </div>
  );
}
