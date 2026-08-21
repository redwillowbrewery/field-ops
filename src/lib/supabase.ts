import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createSupabaseServerClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return supabase;
}
