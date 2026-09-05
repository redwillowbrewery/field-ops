"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

export type LogVisitState = { error?: string };
const OUTCOMES = new Set(["good", "neutral", "problem", "opportunity"]);
const TASK_TYPES = new Set(["call", "email", "quote", "samples", "revisit", "order", "other"]);

export async function logVisit(_previousState: LogVisitState, formData: FormData): Promise<LogVisitState> {
  const accountId = String(formData.get("account_id") ?? "");
  const appointmentId = String(formData.get("appointment_id") ?? "");
  const selectedContactId = String(formData.get("contact_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "neutral");
  const taskType = String(formData.get("task_type") ?? "");
  const taskTitle = String(formData.get("task_title") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const newContactName = String(formData.get("new_contact_name") ?? "").trim();
  const newContactRole = String(formData.get("new_contact_role") ?? "").trim();
  const newContactEmail = String(formData.get("new_contact_email") ?? "").trim().toLowerCase();
  const newContactPhone = String(formData.get("new_contact_phone") ?? "").trim();
  if (!accountId) return { error: "Account is required." };
  if (!OUTCOMES.has(outcome)) return { error: "Choose a valid visit outcome." };

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) redirect("/login");

  if (selectedContactId === "__new__" && !newContactName) return { error: "Enter the name of the new contact." };
  if (taskType && !TASK_TYPES.has(taskType)) return { error: "Choose a valid follow-up type." };
  const { error } = await supabase.rpc("record_account_visit", {p_account_id:accountId,p_appointment_id:appointmentId||null,p_contact_id:selectedContactId==="__new__"?null:selectedContactId,p_new_contact_name:selectedContactId==="__new__"?newContactName:null,p_new_contact_role:newContactRole||null,p_new_contact_email:newContactEmail||null,p_new_contact_phone:newContactPhone||null,p_notes:notes||null,p_outcome:outcome,p_task_type:taskType||null,p_task_title:taskTitle||null,p_due_date:dueDate||null});
  if (error) return { error: error.message };
  if (appointmentId) revalidatePath(`/appointments/${appointmentId}`);

  revalidatePath(`/accounts/${accountId}`); revalidatePath("/accounts"); revalidatePath("/today"); revalidatePath("/diary");
  redirect(`/accounts/${accountId}`);
}
