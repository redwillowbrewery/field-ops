import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ modules: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("connector_sync_state")
    .select("module,last_success_at,last_error,last_row_count")
    .eq("source_system", "viewplan")
    .order("module", { ascending: true });

  if (error) return NextResponse.json({ modules: [], error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data ?? [] });
}
