"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase";

export async function completeTask(formData: FormData) {
  const taskId = String(formData.get("task_id") ?? "");
  if (!taskId) return;

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return;

  const { error } = await supabase
    .from("tasks")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("assigned_to", authData.user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/today");
  revalidatePath("/tasks");
}
