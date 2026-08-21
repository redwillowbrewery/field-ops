"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export type AppointmentState = { error?: string };

export async function createAppointment(_prev: AppointmentState, formData: FormData): Promise<AppointmentState> {
  const accountId = String(formData.get("account_id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "") || null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = Number(formData.get("duration") ?? 30);
  const purpose = String(formData.get("purpose") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!accountId || !date || !time) return { error: "Account, date and time are required." };
  if (!Number.isFinite(duration) || duration < 15 || duration > 240) return { error: "Choose a duration between 15 and 240 minutes." };

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const startsAt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(startsAt.getTime())) return { error: "Choose a valid date and time." };
  const endsAt = new Date(startsAt.getTime() + duration * 60000);

  const { data, error } = await supabase.from("appointments").insert({
    account_id: accountId,
    contact_id: contactId,
    assigned_to: authData.user.id,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    purpose: purpose || "Sales visit",
    notes: notes || null,
    status: "planned",
  }).select("id").single();

  if (error) return { error: error.message };
  revalidatePath("/today");
  revalidatePath("/diary");
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/appointments/${data.id}`);
}

export async function updateAppointment(_prev: AppointmentState, formData: FormData): Promise<AppointmentState> {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const contactId = String(formData.get("contact_id") ?? "") || null;
  const date = String(formData.get("date") ?? "");
  const time = String(formData.get("time") ?? "");
  const duration = Number(formData.get("duration") ?? 30);
  const purpose = String(formData.get("purpose") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  const startsAt = new Date(`${date}T${time}:00`);
  const endsAt = new Date(startsAt.getTime() + duration * 60000);
  if (!appointmentId || Number.isNaN(startsAt.getTime())) return { error: "Choose a valid date and time." };

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { error } = await supabase.from("appointments").update({
    contact_id: contactId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    purpose: purpose || "Sales visit",
    notes: notes || null,
  }).eq("id", appointmentId).eq("assigned_to", authData.user.id);

  if (error) return { error: error.message };
  revalidatePath("/today");
  revalidatePath("/diary");
  revalidatePath(`/appointments/${appointmentId}`);
  revalidatePath(`/accounts/${accountId}`);
  redirect(`/appointments/${appointmentId}`);
}

export async function setAppointmentStatus(formData: FormData) {
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const accountId = String(formData.get("account_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!appointmentId || !["completed", "cancelled", "no_show"].includes(status)) return;

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");
  const { error } = await supabase.from("appointments").update({ status }).eq("id", appointmentId).eq("assigned_to", authData.user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/today");
  revalidatePath("/diary");
  revalidatePath(`/appointments/${appointmentId}`);
  revalidatePath(`/accounts/${accountId}`);
}
