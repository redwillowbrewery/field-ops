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
  let contactId = String(formData.get("contact_id") ?? "") || null;
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

  if (contactId === "__new__") {
    if (!newContactName) return { error: "Enter the name of the new contact." };
    const { data: newContact, error: contactError } = await supabase.from("contacts").insert({ account_id: accountId, full_name: newContactName, job_title: newContactRole || null, email: newContactEmail || null, phone: newContactPhone || null, source: "field_ops", active: true }).select("id").single();
    if (contactError) return { error: `Could not add contact: ${contactError.message}` };
    contactId = newContact.id;
  }

  const now = new Date().toISOString();
  const { data: visit, error: visitError } = await supabase.from("visits").insert({ account_id: accountId, contact_id: contactId, salesperson_id: authData.user.id, started_at: now, completed_at: now, notes: notes || null, outcome }).select("id").single();
  if (visitError) return { error: visitError.message };

  if (taskType && TASK_TYPES.has(taskType)) {
    const { error: taskError } = await supabase.from("tasks").insert({ account_id: accountId, contact_id: contactId, visit_id: visit.id, assigned_to: authData.user.id, task_type: taskType, title: taskTitle || `${titleCase(taskType)} follow-up`, due_at: dueDate ? new Date(`${dueDate}T09:00:00`).toISOString() : null, status: "open" });
    if (taskError) return { error: `Visit saved, but follow-up failed: ${taskError.message}` };
  }

  const { error: accountError } = await supabase.from("accounts").update({ last_visit_at: now, next_visit_due: taskType === "revisit" && dueDate ? dueDate : null }).eq("id", accountId);
  if (accountError) return { error: `Visit saved, but account update failed: ${accountError.message}` };

  if (appointmentId) {
    const { error: appointmentError } = await supabase.from("appointments").update({ status: "completed" }).eq("id", appointmentId).eq("assigned_to", authData.user.id).eq("account_id", accountId);
    if (appointmentError) return { error: `Visit saved, but appointment completion failed: ${appointmentError.message}` };
    revalidatePath(`/appointments/${appointmentId}`);
  }

  revalidatePath(`/accounts/${accountId}`); revalidatePath("/accounts"); revalidatePath("/today"); revalidatePath("/diary");
  redirect(`/accounts/${accountId}`);
}
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
