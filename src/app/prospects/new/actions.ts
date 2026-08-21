"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export type ProspectState = { error?: string };

export async function createProspect(_prev: ProspectState, formData: FormData): Promise<ProspectState> {
  const name = String(formData.get("name") ?? "").trim();
  const classification = String(formData.get("classification") ?? "").trim();
  const address1 = String(formData.get("address_line_1") ?? "").trim();
  const town = String(formData.get("town") ?? "").trim();
  const postcode = String(formData.get("postcode") ?? "").trim().toUpperCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const website = String(formData.get("website") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const contactName = String(formData.get("contact_name") ?? "").trim();
  const contactRole = String(formData.get("contact_role") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim().toLowerCase();
  const latitudeRaw = String(formData.get("latitude") ?? "").trim();
  const longitudeRaw = String(formData.get("longitude") ?? "").trim();
  const latitude = latitudeRaw ? Number(latitudeRaw) : null;
  const longitude = longitudeRaw ? Number(longitudeRaw) : null;

  if (!name) return { error: "Prospect name is required." };
  if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
    return { error: "The captured location is invalid. Try using your location again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: account, error } = await supabase.from("accounts").insert({
    name,
    classification: classification || null,
    relationship_status: "prospect",
    assigned_rep_id: authData.user.id,
    address_line_1: address1 || null,
    town: town || null,
    postcode: postcode || null,
    country: "United Kingdom",
    phone: phone || null,
    email: email || null,
    website: website || null,
    notes: notes || null,
    latitude,
    longitude,
    geocoded_at: latitude !== null && longitude !== null ? new Date().toISOString() : null,
    active: true,
  }).select("id").single();

  if (error) return { error: error.message };

  if (contactName) {
    const { error: contactError } = await supabase.from("contacts").insert({
      account_id: account.id,
      full_name: contactName,
      job_title: contactRole || null,
      phone: contactPhone || null,
      email: contactEmail || null,
      is_primary: true,
      active: true,
      source: "field_ops",
    });
    if (contactError) return { error: `Prospect saved, but contact failed: ${contactError.message}` };
  }

  revalidatePath("/accounts");
  revalidatePath("/map");
  redirect(`/accounts/${account.id}`);
}
