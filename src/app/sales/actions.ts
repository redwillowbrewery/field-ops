"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

const PLAN_STATUSES = new Set(["draft", "active", "closed"]);
const PROGRESS_STATUSES = new Set(["not_contacted", "contacted", "follow_up", "complete"]);

export async function saveWeeklySalesPlan(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const id = String(formData.get("plan_id") || "");
  const weekStart = String(formData.get("week_start") || "");
  const title = String(formData.get("title") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const status = String(formData.get("status") || "draft");
  const territoryIds = [...new Set(formData.getAll("territory_ids").map(String))];
  const productIds = [...new Set(formData.getAll("product_ids").map(String))];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !title || !PLAN_STATUSES.has(status)) throw new Error("Enter a valid week, title and status.");
  if (!territoryIds.length) throw new Error("Select at least one area for a bounded working list.");

  let planId = id;
  if (id) {
    const { error } = await supabase.from("weekly_sales_plans").update({ week_start: weekStart, title, message, status }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("weekly_sales_plans").insert({ week_start: weekStart, title, message, status, created_by: auth.user.id }).select("id").single();
    if (error) throw new Error(error.message);
    planId = data.id;
  }

  const { error: clearTerritoriesError } = await supabase.from("weekly_sales_plan_territories").delete().eq("plan_id", planId);
  if (clearTerritoriesError) throw new Error(clearTerritoriesError.message);
  const { error: territoryError } = await supabase.from("weekly_sales_plan_territories").insert(territoryIds.map((territory_id) => ({ plan_id: planId, territory_id })));
  if (territoryError) throw new Error(territoryError.message);
  const { error: clearProductsError } = await supabase.from("weekly_sales_plan_products").delete().eq("plan_id", planId);
  if (clearProductsError) throw new Error(clearProductsError.message);
  if (productIds.length) {
    const { error } = await supabase.from("weekly_sales_plan_products").insert(productIds.map((product_id) => ({ plan_id: planId, product_id })));
    if (error) throw new Error(error.message);
  }
  revalidatePath("/sales");
  redirect("/sales");
}

export async function updateWeeklyProgress(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const planId = String(formData.get("plan_id") || "");
  const accountId = String(formData.get("account_id") || "");
  const status = String(formData.get("status") || "");
  if (!planId || !accountId || !PROGRESS_STATUSES.has(status)) throw new Error("Invalid weekly progress update.");
  const { error } = await supabase.from("weekly_sales_account_progress").upsert({ plan_id: planId, account_id: accountId, status, updated_by: auth.user.id });
  if (error) throw new Error(error.message);
  revalidatePath("/sales");
}
