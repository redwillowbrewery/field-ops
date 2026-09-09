import "server-only";
import {getComingSoon} from "@/lib/coming-soon";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountSellingData, getGenericSellingData } from "@/lib/account-selling";
import type { AccountContainerPreference } from "@/lib/package-eligibility";
import { priceListPath, validPriceListToken } from "@/lib/price-list-policy";

function publicPriceListReader() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Price list service is unavailable");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}

// No account ID is accepted from a public request. Resolve the exact live bearer
// token on every request; only the allow-listed name and selling fields leave this layer.
export async function getPublicPriceList(token?: string) {
  if (token !== undefined && !validPriceListToken(token)) return null;
  const db = publicPriceListReader();
  if (token === undefined) {
    const [selling,comingSoon]=await Promise.all([getGenericSellingData(db),getComingSoon(db,null,"any")]);
    return {accountName:null,selling,comingSoon};
  }
  const { data: link, error } = await db.from("account_price_list_links")
    .select("account_id").eq("token", token).is("revoked_at", null).maybeSingle();
  if (error) throw new Error("Price list service is unavailable");
  if (!link) return null;
  const { data: account, error: accountError } = await db.from("accounts")
    .select("name,container_preference,active,relationship_status").eq("id", link.account_id).maybeSingle();
  if (accountError) throw new Error("Price list service is unavailable");
  if (!account || !account.active || account.relationship_status === "closed") return null;
  const preference=(account.container_preference || "any") as AccountContainerPreference;
  const [selling,comingSoon]=await Promise.all([getAccountSellingData(db,link.account_id,preference),getComingSoon(db,link.account_id,preference)]);
  // Avoid returning prices after a revocation that happened during a slow price read.
  const { data: stillActive, error: finalError } = await db.from("account_price_list_links")
    .select("account_id").eq("token", token).is("revoked_at", null).maybeSingle();
  if (finalError) throw new Error("Price list service is unavailable");
  return stillActive ? { accountName: account.name as string, selling, comingSoon } : null;
}

export async function getStaffPriceListPath(db: SupabaseClient, accountId: string) {
  const { data, error } = await db.from("account_price_list_links").select("token")
    .eq("account_id", accountId).is("revoked_at", null).maybeSingle();
  if (error) return null; // Existing selling screens stay usable before migration.
  return data ? priceListPath(data.token) : null;
}
