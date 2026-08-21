import { BottomNav } from "@/components/bottom-nav";
import { TaskCard } from "@/components/task-card";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "open" } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user!.id;

  let query = supabase.from("tasks").select("id,title,task_type,due_at,status,account:accounts(id,name,town,postcode)").eq("assigned_to", userId).order("due_at", { ascending: true, nullsFirst: false }).limit(100);
  if (view === "completed") query = query.eq("status", "completed"); else query = query.eq("status", "open");
  const { data: tasks, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8">
      <header className="border-b border-slate-200 bg-white"><div className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Field Ops</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Tasks</h1><div className="mt-4 flex gap-2"><Tab href="/tasks" active={view!=="completed"}>Open</Tab><Tab href="/tasks?view=completed" active={view==="completed"}>Completed</Tab></div></div></header>
      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6"><p className="mb-3 text-sm text-slate-500">{tasks?.length || 0} {view === "completed" ? "completed" : "open"} tasks</p>{tasks?.length ? <div className="space-y-3">{tasks.map((task)=><TaskCard key={task.id} task={task} />)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="font-semibold">{view === "completed" ? "No completed tasks yet" : "You’re all caught up"}</p><p className="mt-1 text-sm text-slate-500">Follow-ups created from visits will appear here.</p></div>}</main>
      <BottomNav active="Tasks" />
    </div>
  );
}
function Tab({href,active,children}:{href:string;active:boolean;children:React.ReactNode}){return <a href={href} className={`rounded-xl px-4 py-2 text-sm font-semibold ${active?"bg-slate-950 text-white":"bg-slate-100 text-slate-600"}`}>{children}</a>;}
