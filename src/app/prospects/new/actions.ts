"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export type ProspectMatch = {id:string;name:string;town:string|null;postcode:string|null;relationship_status:string};
export type ProspectState = { error?: string; matches?:ProspectMatch[] };

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
  const duplicateReviewed = String(formData.get("duplicate_reviewed") ?? "") === "yes";

  if (!name) return { error: "Prospect name is required." };
  if ((latitude !== null && !Number.isFinite(latitude)) || (longitude !== null && !Number.isFinite(longitude))) {
    return { error: "The captured location is invalid. Try using your location again." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  if (!duplicateReviewed) {
    const safeName=name.replace(/[,%()]/g," ").replace(/\s+/g," ").trim();
    const safePostcode=postcode.replace(/\s+/g,"");
    const filters=[] as string[];
    if(safeName.length>=3)filters.push(`name.ilike.%${safeName}%`);
    if(safePostcode)filters.push(`postcode.ilike.${safePostcode.split("").join("%")}`);
    if(phone)filters.push(`phone.eq.${phone.replace(/[,()]/g,"")}`,`mobile.eq.${phone.replace(/[,()]/g,"")}`);
    if(email)filters.push(`email.eq.${email.replace(/[,()]/g,"")}`);
    if(filters.length){
      const {data:matches,error:matchError}=await supabase.from("accounts").select("id,name,town,postcode,relationship_status").or(filters.join(",")).order("name").limit(8);
      if(matchError)return{error:`Could not check for existing Accounts: ${matchError.message}`};
      if(matches?.length)return{matches:matches as ProspectMatch[]};
    }
  }

  const { data: accountId, error } = await supabase.rpc("create_brewery_ops_prospect", {p_name:name,p_classification:classification||null,p_address_line_1:address1||null,p_town:town||null,p_postcode:postcode||null,p_phone:phone||null,p_email:email||null,p_website:website||null,p_latitude:latitude,p_longitude:longitude,p_contact_name:contactName||null,p_contact_role:contactRole||null,p_contact_phone:contactPhone||null,p_contact_email:contactEmail||null,p_notes:notes||null});
  if (error || !accountId) return { error: error?.message || "Could not create prospect." };

  revalidatePath("/accounts");
  revalidatePath("/map");
  redirect(`/accounts/${accountId}`);
}
