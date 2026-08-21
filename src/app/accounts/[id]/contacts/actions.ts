"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function saveContact(formData: FormData) {
  const accountId = String(formData.get("account_id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const jobTitle = String(formData.get("job_title") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const isPrimary = formData.get("is_primary") === "on";
  const active = formData.get("active") !== "off";

  if (!accountId || !fullName) return;
  const supabase = await createSupabaseServerClient();

  if (isPrimary) {
    await supabase.from("contacts").update({ is_primary: false }).eq("account_id", accountId).eq("source", "field_ops");
  }

  const values = {
    account_id: accountId,
    full_name: fullName,
    job_title: jobTitle || null,
    email: email || null,
    phone: phone || null,
    is_primary: isPrimary,
    active,
    source: "field_ops",
  };

  const result = contactId
    ? await supabase.from("contacts").update(values).eq("id", contactId).eq("account_id", accountId).eq("source", "field_ops")
    : await supabase.from("contacts").insert(values);

  if (result.error) throw new Error(result.error.message);
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath(`/accounts/${accountId}/contacts`);
  redirect(`/accounts/${accountId}/contacts`);
}
