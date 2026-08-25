import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { TaskCard } from "@/components/task-card";
import { createSupabaseServerClient } from "@/lib/supabase";

type AccountRef={id:string;name:string;town:string|null;postcode:string|null;brewery_available?:boolean|null};
type ContactRef={full_name:string|null};
type TaskRow={id:string;title:string;task_type:string;due_at:string|null;account:AccountRef|AccountRef[]|null};
type AppointmentRow={id:string;purpose:string|null;starts_at:string;ends_at:string|null;status:string;account:AccountRef|AccountRef[]|null;contact:ContactRef|ContactRef[]|null};

export default async function TodayPage() {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user!.id;
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate()+1);
  const nextWeek = new Date(todayStart); nextWeek.setDate(nextWeek.getDate()+8);

  const [{ data: dueTaskRows }, { data: upcomingTaskRows }, { data: appointmentRows }] = await Promise.all([
    supabase.from("tasks").select("id,title,task_type,due_at,account:accounts(id,name,town,postcode,brewery_available)").eq("assigned_to", userId).eq("status", "open").lt("due_at", tomorrow.toISOString()).order("due_at", { ascending: true }),
    supabase.from("tasks").select("id,title,task_type,due_at,account:accounts(id,name,town,postcode,brewery_available)").eq("assigned_to", userId).eq("status", "open").gte("due_at", tomorrow.toISOString()).lt("due_at", nextWeek.toISOString()).order("due_at", { ascending: true }).limit(8),
    supabase.from("appointments").select("id,purpose,starts_at,ends_at,status,account:accounts(id,name,town,postcode,brewery_available),contact:contacts(full_name)").eq("assigned_to", userId).eq("status", "planned").gte("starts_at", todayStart.toISOString()).lt("starts_at", tomorrow.toISOString()).order("starts_at", { ascending: true }),
  ]);

  const dueTasks=((dueTaskRows||[]) as TaskRow[]).filter(t=>accountAvailable(t.account));
  const upcomingTasks=((upcomingTaskRows||[]) as TaskRow[]).filter(t=>accountAvailable(t.account));
  const appointments=((appointmentRows||[]) as AppointmentRow[]).filter(a=>accountAvailable(a.account));
  const overdue = dueTasks.filter((task) => task.due_at && new Date(task.due_at) < todayStart);
  const today = dueTasks.filter((task) => !task.due_at || new Date(task.due_at) >= todayStart);

  return <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field Ops</p>
      <div className="mt-1 flex items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Today</h1><p className="mt-1 text-sm text-slate-500">{formatToday(now)}</p></div><div className="flex gap-3"><Link href="/diary" className="text-sm font-semibold text-slate-700 hover:underline">Diary →</Link><Link href="/tasks" className="text-sm font-semibold text-slate-700 hover:underline">Tasks →</Link></div></div>
      <div className="mt-5 grid grid-cols-3 gap-2"><Summary label="Overdue" value={overdue.length} urgent={overdue.length>0}/><Summary label="Due today" value={today.length}/><Summary label="Appointments" value={appointments.length}/></div>
    </div></header>
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-5 sm:px-6">
      {appointments.length>0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Appointments</h2><Link href="/diary" className="text-xs font-semibold text-slate-500">Open diary</Link></div><div className="space-y-3">{appointments.map(a=><AppointmentCard key={a.id} appointment={a}/>)}</div></section>}
      {overdue.length>0 && <TaskSection title="Overdue" tasks={overdue}/>}<TaskSection title="Tasks today" tasks={today} empty="Nothing due today."/>
      {!appointments.length && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">Appointments</h2><Link href="/diary" className="text-xs font-semibold text-slate-500">Open diary</Link></div><div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">No appointments today.</div></section>}
      {upcomingTasks.length>0 && <TaskSection title="Coming up" tasks={upcomingTasks}/>} 
    </main><BottomNav active="Today" />
  </div>;
}
function accountAvailable(relation:AccountRef|AccountRef[]|null){const account=Array.isArray(relation)?relation[0]:relation;return !account||account.brewery_available!==false;}
function TaskSection({title,tasks,empty}:{title:string;tasks:TaskRow[];empty?:string}){return <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><span className="text-xs font-medium text-slate-400">{tasks.length}</span></div>{tasks.length?<div className="space-y-3">{tasks.map(t=><TaskCard key={t.id} task={t}/>)}</div>:empty?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">{empty}</div>:null}</section>}
function Summary({label,value,urgent=false}:{label:string;value:number;urgent?:boolean}){return <div className={`rounded-2xl p-3 ${urgent?"bg-rose-50":"bg-slate-100"}`}><p className={`text-2xl font-semibold ${urgent?"text-rose-700":"text-slate-900"}`}>{value}</p><p className={`text-[11px] font-semibold uppercase tracking-wide ${urgent?"text-rose-600":"text-slate-500"}`}>{label}</p></div>}
function AppointmentCard({appointment}:{appointment:AppointmentRow}){const account=Array.isArray(appointment.account)?appointment.account[0]:appointment.account;const contact=Array.isArray(appointment.contact)?appointment.contact[0]:appointment.contact;return <Link href={`/appointments/${appointment.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex gap-4"><div className="w-14 shrink-0 text-center"><p className="text-lg font-semibold">{formatTime(appointment.starts_at)}</p>{appointment.ends_at&&<p className="text-xs text-slate-400">{formatTime(appointment.ends_at)}</p>}</div><div className="min-w-0"><p className="font-semibold">{appointment.purpose||"Sales visit"}</p>{account&&<p className="mt-1 text-sm text-slate-600">{account.name} · {[contact?.full_name,account.town,account.postcode].filter(Boolean).join(" · ")}</p>}</div></div></Link>}
function formatTime(v:string){return new Intl.DateTimeFormat("en-GB",{hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
function formatToday(date:Date){return new Intl.DateTimeFormat("en-GB",{weekday:"long",day:"numeric",month:"long"}).format(date)}
