import type { SupabaseClient } from "@supabase/supabase-js";

export type CommercialSnapshot = {
  balance: number | string | null;
  credit_limit: number | string | null;
  currency: string;
  order_blocked: boolean | null;
  dispatch_blocked: boolean | null;
  source_status: string | null;
  source: string;
  observed_at: string;
};
export type CommercialResult = {
  snapshot: CommercialSnapshot | null;
  freshness: "current" | "stale" | "unavailable";
  reason: "unmapped" | "missing" | "read_failed" | "refresh_failed" | "aged" | null;
};

// Daily overnight refresh plus a 12-hour grace period; never a credit rule.
const MAX_SNAPSHOT_AGE_MS = 36 * 60 * 60 * 1000;

export function commercialFreshness(
  snapshot: CommercialSnapshot | null,
  refreshFailed: boolean,
  now = Date.now(),
): CommercialResult {
  if (!snapshot) return { snapshot: null, freshness: "unavailable", reason: "missing" };
  if (refreshFailed) return { snapshot, freshness: "stale", reason: "refresh_failed" };
  const age = now - Date.parse(snapshot.observed_at);
  if (!Number.isFinite(age) || age < -5 * 60 * 1000 || age > MAX_SNAPSHOT_AGE_MS) {
    return { snapshot, freshness: "stale", reason: "aged" };
  }
  return { snapshot, freshness: "current", reason: null };
}

export async function getAccountCommercialSnapshot(
  db: SupabaseClient,
  accountId: string,
  sourceCustomerId: number | null,
): Promise<CommercialResult> {
  if (sourceCustomerId == null) return { snapshot: null, freshness: "unavailable", reason: "unmapped" };
  try {
    const [facts, sync] = await Promise.all([
      db.from("account_commercial_snapshots")
        .select("balance,credit_limit,currency,order_blocked,dispatch_blocked,source_status,source,observed_at")
        .eq("account_id", accountId).eq("source_customer_id", sourceCustomerId).maybeSingle(),
      db.from("connector_sync_state").select("last_error")
        .eq("source_system", "viewplan").eq("module", "account_commercial").maybeSingle(),
    ]);
    // A missing migration or unavailable connector never breaks prospect/CRM work.
    if (facts.error) return { snapshot: null, freshness: "unavailable", reason: "read_failed" };
    return commercialFreshness(facts.data as CommercialSnapshot | null, Boolean(sync.error || !sync.data || sync.data.last_error));
  } catch {
    return { snapshot: null, freshness: "unavailable", reason: "read_failed" };
  }
}

export function commercialStatus(orderBlocked: boolean | null | undefined, dispatchBlocked: boolean | null | undefined, stale = false) {
  if (stale) return "Status out of date — verify before promising delivery";
  if (orderBlocked === true) return "Stop — ordering blocked";
  if (dispatchBlocked === true) return orderBlocked === false
    ? "Can order — payment required before dispatch"
    : "Payment required before dispatch — order status unknown";
  if (orderBlocked === false && dispatchBlocked === false) return "Ordering and dispatch allowed";
  if (orderBlocked === false) return "Can order — dispatch status unknown";
  return "Order status unknown — verify in ViewPlan";
}

export function commercialAmount(value: number | string | null, currency: string) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "Unavailable";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(value));
  } catch { return "Unavailable"; }
}
