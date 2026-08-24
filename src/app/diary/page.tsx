import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { createSupabaseServerClient } from "@/lib/supabase";

type AccountRef={id:string;name:string|null;town:string|null;postcode:string|null};
type ContactRef={full_name:string|null};
type DiaryAppointment={id:string;starts_at:string;ends_at:string|null;purpose:string|null;status:string;account:AccountRef|AccountRef[]|null;contact:ContactRef|ContactRef[]|null};

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days = "14" } = await searchParams;
  const span = Math.min(60, Math.max(7, Number(days) || 14));
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + span);
  const { data: appointments, error } = await supabase.from("appointments").select("id,starts_at,ends_at,purpose,status,account:accounts(id,name,town,postcode),contact:contacts(full_name)").eq("assigned_to", authData.user!.id).gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).neq("status", "cancelled").order("starts_at", { ascending: true });
  if (error) throw new Error(error.message);
  const grouped = new Map<string, DiaryAppointment[]>();
  for (const appointment of (appointments || []) as DiaryAppointment[]) { const key = appointment.starts_at.slice(0,10); grouped.set(key, [...(grouped.get(key) || []), appointment]); }
  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8"><header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field Ops</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Diary</h1></div><Link href="/today" className="text-sm font-semibold text-slate-600">Today →</Link></div><div className="mt-4 flex gap-2"><Range href="/diary?days=7" active={span===7}>7 days</Range><Range href="/diary?days=14" active={span===14}>14 days</Range><Range href="/diary?days=30" active={span===30}>30 days</Range></div></div></header><main className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6">{grouped.size ? [...grouped.entries()].map(([date,items])=><section key={date}><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{formatDay(date)}</h2><div className="space-y-3">{items.map(a=><DiaryCard key={a.id} appointment={a}/>)}</div></section>) : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-semibold">No appointments in the next {span} days</p><p className="mt-1 text-sm text-slate-500">Create one from an account.</p></div>}</main><BottomNav active="Today" /></div>;
}
function Range({href,active,children}:{href:string;active:boolean;children:React.ReactNode}){return <Link href={href} className={`rounded-xl px-3 py-2 text-sm font-semibold ${active?"bg-slate-950 text-white":"bg-slate-100 text-slate-600"}`}>{children}</Link>}
function DiaryCard({appointment}:{appointment:DiaryAppointment}){const account=Array.isArray(appointment.account)?appointment.account[0]:appointment.account;const contact=Array.isArray(appointment.contact)?appointment.contact[0]:appointment.contact;return <Link href={`/appointments/${appointment.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex gap-4"><div className="w-16 shrink-0"><p className="text-lg font-semibold">{formatTime(appointment.starts_at)}</p>{appointment.ends_at&&<p className="text-xs text-slate-400">to {formatTime(appointment.ends_at)}</p>}</div><div className="min-w-0"><div className="flex flex-wrap gap-2"><p className="font-semibold">{appointment.purpose || "Sales visit"}</p><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{appointment.status}</span></div><p className="mt-1 text-sm font-medium text-slate-700">{account?.name}</p><p className="mt-0.5 text-xs text-slate-500">{[contact?.full_name,account?.town,account?.postcode].filter(Boolean).join(" · ")}</p></div></div></Link>}
function formatDay(v:string){return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long"}).format(new Date(`${v}T12:00:00`))}
function formatTime(v:string){return new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
