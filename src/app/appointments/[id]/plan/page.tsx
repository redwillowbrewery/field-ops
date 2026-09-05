import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase";

const STATUS_WEIGHT: Record<string, number> = {
  prospect: 32,
  lapsed: 28,
  cooling: 24,
  current: 18,
  dormant: 12,
  closed: -100,
};

type SalesSummary = { last_order_date: string | null; total_spend: number | null; total_orders: number | null } | null;
type Recommendation = {
  id: string;
  name: string;
  town: string | null;
  postcode: string | null;
  classification: string | null;
  relationship_status: string | null;
  latitude: number | string;
  longitude: number | string;
  last_visit_at: string | null;
  sales: SalesSummary;
  task: { overdue: boolean; title: string | null; taskType: string | null } | undefined;
  distanceMiles: number;
  score: number;
  reasons: string[];
};

export default async function PlanNearbyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return null;

  const { data: appointment, error } = await supabase
    .from("appointments")
    .select("id,account_id,starts_at,ends_at,purpose,account:accounts(id,name,town,postcode,latitude,longitude)")
    .eq("id", id)
    .single();

  if (error || !appointment) notFound();
  const anchor = Array.isArray(appointment.account) ? appointment.account[0] : appointment.account;
  if (!anchor?.latitude || !anchor?.longitude) notFound();

  const dayStart = new Date(appointment.starts_at);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [{ data: accounts }, { data: tasks }, { data: booked }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,town,postcode,classification,relationship_status,latitude,longitude,last_visit_at,sales:account_sales_snapshot(last_order_date,total_spend,total_orders)")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .eq("active", true)
      .neq("id", appointment.account_id)
      .limit(2500),
    supabase
      .from("tasks")
      .select("account_id,due_at,task_type,title")
      .eq("assigned_to", userId)
      .eq("status", "open")
      .not("account_id", "is", null),
    supabase
      .from("appointments")
      .select("account_id")
      .eq("assigned_to", userId)
      .eq("status", "planned")
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString()),
  ]);

  const now = new Date().getTime();
  const taskByAccount = new Map<string, { overdue: boolean; title: string | null; taskType: string | null }>();
  for (const task of tasks || []) {
    if (!task.account_id) continue;
    const overdue = Boolean(task.due_at && new Date(task.due_at).getTime() < now);
    const current = taskByAccount.get(task.account_id);
    if (!current || (overdue && !current.overdue)) {
      taskByAccount.set(task.account_id, { overdue, title: task.title || null, taskType: task.task_type || null });
    }
  }
  const bookedIds = new Set((booked || []).map((row) => row.account_id));

  const recommendations: Recommendation[] = (accounts || [])
    .map((account): Recommendation | null => {
      const distanceMiles = haversineMiles(Number(anchor.latitude), Number(anchor.longitude), Number(account.latitude), Number(account.longitude));
      if (distanceMiles > 20) return null;
      const sales = (Array.isArray(account.sales) ? account.sales[0] : account.sales) || null;
      const task = taskByAccount.get(account.id);
      const reasons: string[] = [];
      let score = STATUS_WEIGHT[account.relationship_status || "dormant"] ?? 0;

      if (distanceMiles <= 2) { score += 28; reasons.push(`${distanceMiles.toFixed(1)} miles away`); }
      else if (distanceMiles <= 5) { score += 20; reasons.push(`${distanceMiles.toFixed(1)} miles away`); }
      else if (distanceMiles <= 10) { score += 12; reasons.push(`${distanceMiles.toFixed(1)} miles away`); }
      else { score += 4; reasons.push(`${distanceMiles.toFixed(1)} miles away`); }

      const status = account.relationship_status || "dormant";
      if (["prospect", "lapsed", "cooling"].includes(status)) reasons.push(titleCase(status));
      if (task?.overdue) { score += 30; reasons.push("Follow-up overdue"); }
      else if (task) { score += 10; reasons.push("Open follow-up"); }

      if (account.last_visit_at) {
        const days = Math.floor((now - new Date(account.last_visit_at).getTime()) / 86400000);
        if (days > 365) { score += 18; reasons.push("Not visited for 12+ months"); }
        else if (days > 180) { score += 12; reasons.push("Not visited for 6+ months"); }
        else if (days > 90) { score += 6; reasons.push("Not visited for 3+ months"); }
      } else {
        score += 10;
        reasons.push("No visit recorded");
      }

      if (sales?.last_order_date) {
        const daysSinceOrder = Math.floor((now - new Date(`${sales.last_order_date}T00:00:00`).getTime()) / 86400000);
        if (daysSinceOrder > 180 && daysSinceOrder <= 730) { score += 8; reasons.push("Worth reactivating"); }
      }

      if (bookedIds.has(account.id)) { score -= 80; reasons.push("Already booked today"); }

      return { ...account, sales, task, distanceMiles, score, reasons } as Recommendation;
    })
    .filter((account): account is Recommendation => account !== null)
    .sort((a, b) => (b.score - a.score) || (a.distanceMiles - b.distanceMiles))
    .slice(0, 12);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6">
          <Link href={`/appointments/${id}`} className="text-sm font-medium text-slate-500">← Appointment</Link>
          <h1 className="mt-3 text-2xl font-semibold">Plan nearby</h1>
          <p className="mt-1 text-sm text-slate-500">Around {anchor.name} · {formatDateTime(appointment.starts_at)}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-5 sm:px-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold">Best nearby opportunities</p>
          <p className="mt-1 text-sm text-slate-500">Ranked by distance, account status, overdue follow-ups, recency of visits and existing customer activity. Already-booked accounts are pushed down.</p>
        </section>

        {recommendations.length ? (
          <div className="space-y-3">
            {recommendations.map((account, index) => (
              <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{account.name}</h2>
                      <StatusBadge status={account.relationship_status} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{[account.town, account.postcode, account.classification].filter(Boolean).join(" · ")}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {account.reasons.slice(0, 4).map((reason) => <span key={reason} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{reason}</span>)}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                      <Link href={`/accounts/${account.id}`} className="flex h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">View account</Link>
                      <Link href={`/accounts/${account.id}/appointment?date=${dateParam(appointment.starts_at)}`} className="flex h-10 items-center justify-center rounded-xl bg-slate-950 px-3 text-sm font-semibold text-white">Create appointment</Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No suitable mapped accounts found within 20 miles.</div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-600">{status || "dormant"}</span>;
}
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function dateParam(value: string) { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function haversineMiles(lat1:number, lon1:number, lat2:number, lon2:number) { const r=3958.8; const p1=lat1*Math.PI/180; const p2=lat2*Math.PI/180; const dp=(lat2-lat1)*Math.PI/180; const dl=(lon2-lon1)*Math.PI/180; const a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2; return 2*r*Math.asin(Math.sqrt(a)); }
