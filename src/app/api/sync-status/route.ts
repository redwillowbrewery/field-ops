import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ modules: [] }, { status: 401 });

  const { data, error } = await supabase.rpc("connector_health");

  if (error) return NextResponse.json({ modules: [], error: error.message }, { status: 500 });
  return NextResponse.json({ modules: data ?? [] });
}
