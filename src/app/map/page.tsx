import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";
import { MapView } from "./map-view";

export default async function MapPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user!.id;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);

  const [{ data: accounts, error }, { data: tasks }, { data: appointments }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,town,postcode,classification,relationship_status,latitude,longitude,last_visit_at")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .eq("active", true)
      .limit(2500),
    supabase
      .from("tasks")
      .select("account_id,due_at")
      .eq("assigned_to", userId)
      .eq("status", "open")
      .not("due_at", "is", null)
      .limit(1000),
    supabase
      .from("appointments")
      .select("id,starts_at,purpose,status,account:accounts(id,name,town,postcode,latitude,longitude)")
      .eq("assigned_to", userId)
      .eq("status", "planned")
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", tomorrow.toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  if (error) throw new Error(error.message);

  const overdueAccountIds = new Set(
    (tasks || [])
      .filter((task) => task.due_at && new Date(task.due_at).getTime() < Date.now())
      .map((task) => task.account_id)
      .filter(Boolean)
  );

  const points = (accounts || []).map((account) => ({
    ...account,
    latitude: Number(account.latitude),
    longitude: Number(account.longitude),
    overdue_follow_up: overdueAccountIds.has(account.id),
  }));

  const todaysAppointments = (appointments || []).flatMap((appointment) => {
    const account = Array.isArray(appointment.account) ? appointment.account[0] : appointment.account;
    if (!account?.latitude || !account?.longitude) return [];
    return [{
      id: appointment.id,
      starts_at: appointment.starts_at,
      purpose: appointment.purpose,
      account: {
        id: account.id,
        name: account.name,
        town: account.town,
        postcode: account.postcode,
        latitude: Number(account.latitude),
        longitude: Number(account.longitude),
      },
    }];
  });

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field Ops</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Map</h1>
          <p className="mt-1 text-sm text-slate-500">Find nearby accounts when you have a gap in the day.</p>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
        <MapView accounts={points} appointments={todaysAppointments} />
      </main>
      <BottomNav active="Map" />
    </div>
  );
}
