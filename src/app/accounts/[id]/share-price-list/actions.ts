"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";
import { priceListPath } from "@/lib/price-list-policy";
export async function managePriceListLink(accountId: string, action: "create" | "replace" | "revoke") {
  if (!/^[a-f0-9-]{36}$/i.test(accountId) || !["create", "replace", "revoke"].includes(action)) return { error: "Invalid link request." };
  const db = await createSupabaseServerClient();
  const { data: account, error: accountError } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (accountError || !account) return { error: "Account is unavailable." };
  const { data: token, error } = await db.rpc("manage_account_price_list_link", { p_account_id: accountId, p_action: action });
  if (error) return { error: "Could not update the link. Check that sharing is enabled and the Account is active." };
  revalidatePath(`/accounts/${accountId}/share-price-list`);
  revalidatePath(`/accounts/${accountId}/quick-price-email`);
  return { path: token ? priceListPath(token) : null };
}
