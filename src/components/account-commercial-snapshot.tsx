import { commercialAmount, commercialStatus, type CommercialResult } from "@/lib/account-commercial";

export function AccountCommercialSnapshot({ result }: { result: CommercialResult }) {
  const { snapshot, freshness, reason } = result;
  const stale = freshness === "stale";
  const stopped = snapshot?.order_blocked === true;
  const paymentRequired = snapshot?.dispatch_blocked === true;
  return (
    <section aria-label="Account commercial position" className={`rounded-2xl border p-4 shadow-sm ${stopped ? "border-rose-200 bg-rose-50" : paymentRequired ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Commercial position</h2>
        <span className="text-xs text-slate-500">Read only</span>
      </div>
      <p className={`mt-2 text-sm font-semibold ${stopped ? "text-rose-800" : "text-slate-800"}`}>
        {commercialStatus(snapshot?.order_blocked, snapshot?.dispatch_blocked, stale)}
      </p>
      {snapshot ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Balance</dt><dd className="mt-1 break-words font-semibold">{commercialAmount(snapshot.balance, snapshot.currency)}</dd></div>
            <div><dt className="text-slate-500">Credit limit</dt><dd className="mt-1 break-words font-semibold">{commercialAmount(snapshot.credit_limit, snapshot.currency)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate-600">
            Ordering: {snapshot.order_blocked === true ? "blocked" : snapshot.order_blocked === false ? "allowed" : "unknown"}{stale ? " (last known)" : ""} · {" "}
            Dispatch: {snapshot.dispatch_blocked === true ? "blocked" : snapshot.dispatch_blocked === false ? "no dispatch hold reported" : "unknown"}{stale ? " (last known)" : ""}
            {snapshot.source_status ? ` · ${snapshot.source_status}` : ""}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {snapshot.source === "viewplan" ? "ViewPlan" : snapshot.source} · Snapshot {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" }).format(new Date(snapshot.observed_at))} (UK time)
          </p>
          {stale ? <p className="mt-2 text-xs font-medium text-amber-800">{reason === "refresh_failed" ? "Latest refresh could not be confirmed." : "Snapshot is out of date."} Values are from the last successful read; verify the current position in ViewPlan.</p> : null}
        </>
      ) : <p className="mt-2 text-sm text-slate-500">{reason === "unmapped" ? "Commercial data becomes available when this Account is linked to ViewPlan. Prospect and follow-up work can continue." : "Commercial data is unavailable. Check the current position in ViewPlan."}</p>}
    </section>
  );
}
