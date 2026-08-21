import Link from "next/link";
import { completeTask } from "@/app/tasks/actions";

type Task = {
  id: string;
  title: string;
  task_type: string;
  due_at: string | null;
  account: { id: string; name: string; town: string | null; postcode: string | null } | { id: string; name: string; town: string | null; postcode: string | null }[] | null;
};

export function TaskCard({ task }: { task: Task }) {
  const account = Array.isArray(task.account) ? task.account[0] : task.account;
  const overdue = task.due_at ? new Date(task.due_at).getTime() < startOfToday().getTime() : false;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <form action={completeTask} className="pt-0.5">
          <input type="hidden" name="task_id" value={task.id} />
          <button type="submit" aria-label={`Complete ${task.title}`} className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-600">✓</button>
        </form>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-900">{task.title}</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{task.task_type}</span>
            {overdue && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Overdue</span>}
          </div>
          {account ? <Link href={`/accounts/${account.id}`} className="mt-1 block text-sm font-medium text-slate-700 hover:underline">{account.name}</Link> : null}
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
            {account && <span>{[account.town, account.postcode].filter(Boolean).join(" · ")}</span>}
            <span>{task.due_at ? `Due ${formatDue(task.due_at)}` : "No due date"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function startOfToday() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function formatDue(value: string) { return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value)); }
