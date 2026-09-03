import type { SupabaseClient } from "@supabase/supabase-js";

export type CurrentSalesProduct = {
  id: string;
  name: string;
};

/**
 * Canonical current RedWillow catalogue.
 *
 * Availability and Product.sellable are deliberately not part of this rule: a
 * weekly sales focus may pre-sell future stock, and sellable is retained for
 * later order/customer-output workflows.
 */
export async function getCurrentSalesCatalogue(db: SupabaseClient): Promise<CurrentSalesProduct[]> {
  const { data, error } = await db
    .from("products")
    .select("id,name")
    .eq("active", true)
    .eq("business_exchange", false)
    .order("name");

  if (error) throw new Error(error.message);
  return (data || []) as CurrentSalesProduct[];
}

