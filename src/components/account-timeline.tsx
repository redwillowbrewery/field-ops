import Link from "next/link";

type Visit = {
  id: string;
  completed_at: string | null;
  notes: string | null;
  outcome: string | null;
  contact?:
    | { full_name?: string | null }
    | { full_name?: string | null }[]
    | null;
  salesperson?:
    | { full_name?: string | null; email?: string | null }
    | { full_name?: string | null; email?: string | null }[]
    | null;
};
type Appointment = {
  id: string;
  starts_at: string;
  purpose: string | null;
  status: string;
  notes?: string | null;
};
type Task = {
  id: string;
  title: string;
  task_type: string;
  due_at: string | null;
  status: string;
  completed_at?: string | null;
  notes?: string | null;
  created_at?: string | null;
};
type Note = {
  id: string;
  body: string;
  created_at: string;
  author?:
    | { full_name?: string | null; email?: string | null }
    | { full_name?: string | null; email?: string | null }[]
    | null;
};
type Interaction = {
  id: string;
  channel: "call" | "email" | "whatsapp" | "visit";
  outcome: string | null;
  note: string | null;
  occurred_at: string;
  visit_id: string | null;
  contact?: { full_name?: string | null } | { full_name?: string | null }[] | null;
  actor?: { full_name?: string | null; email?: string | null } | { full_name?: string | null; email?: string | null }[] | null;
  visit?: { id: string; outcome: string | null; notes: string | null } | { id: string; outcome: string | null; notes: string | null }[] | null;
};
type TimelineItem = {
  id: string;
  at: string;
  kind: "visit" | "appointment" | "task" | "note" | "call" | "email" | "whatsapp";
  title: string;
  detail?: string | null;
  meta?: string | null;
  href?: string;
};
export function AccountTimeline({
  interactions,
  visits,
  appointments,
  tasks,
  notes = [],
}: {
  interactions: Interaction[];
  visits: Visit[];
  appointments: Appointment[];
  tasks: Task[];
  notes?: Note[];
}) {
  const items: TimelineItem[] = [];
  const linkedVisits = new Set(interactions.map((interaction) => interaction.visit_id).filter(Boolean));
  for (const interaction of interactions) {
    const contact = one(interaction.contact); const actor = one(interaction.actor); const visit = one(interaction.visit);
    const isVisit = interaction.channel === "visit";
    items.push({
      id: `interaction-${interaction.id}`,
      at: interaction.occurred_at,
      kind: interaction.channel,
      title: isVisit ? `Visit${visit?.outcome ? ` · ${visit.outcome}` : ""}` : `${channelLabel(interaction.channel)}${interaction.outcome ? ` · ${outcomeLabel(interaction.outcome)}` : ""}`,
      detail: isVisit ? visit?.notes : interaction.note,
      meta: [contact?.full_name ? `${isVisit ? "Met" : "Contact"} ${contact.full_name}` : null, actor?.full_name || actor?.email].filter(Boolean).join(" · "),
    });
  }
  for (const v of visits) {
    if (!v.completed_at || linkedVisits.has(v.id)) continue;
    const c = Array.isArray(v.contact) ? v.contact[0] : v.contact;
    const s = Array.isArray(v.salesperson) ? v.salesperson[0] : v.salesperson;
    items.push({
      id: `visit-${v.id}`,
      at: v.completed_at,
      kind: "visit",
      title: `Visit${v.outcome ? ` · ${v.outcome}` : ""}`,
      detail: v.notes,
      meta: [
        c?.full_name ? `Met ${c.full_name}` : null,
        s?.full_name || s?.email,
      ]
        .filter(Boolean)
        .join(" · "),
    });
  }
  for (const a of appointments)
    items.push({
      id: `appointment-${a.id}`,
      at: a.starts_at,
      kind: "appointment",
      title: a.purpose || "Sales appointment",
      detail: a.notes,
      meta: a.status,
      href: `/appointments/${a.id}`,
    });
  for (const t of tasks) {
    const at = t.completed_at || t.due_at || t.created_at;
    if (at)
      items.push({
        id: `task-${t.id}`,
        at,
        kind: "task",
        title: t.title,
        detail: t.notes,
        meta: `${t.task_type} · ${t.status}`,
      });
  }
  for (const n of notes) {
    const a = Array.isArray(n.author) ? n.author[0] : n.author;
    const match = n.body.match(/^\[(call|email)\]\s*(.*)$/i);
    if (match) {
      const kind = match[1].toLowerCase() as "call" | "email";
      items.push({
        id: `${kind}-${n.id}`,
        at: n.created_at,
        kind,
        title: kind === "call" ? "Call initiated (legacy)" : "Email prepared (legacy)",
        detail: match[2] || null,
        meta: a?.full_name || a?.email || null,
      });
    } else
      items.push({
        id: `note-${n.id}`,
        at: n.created_at,
        kind: "note",
        title: "Note",
        detail: n.body,
        meta: a?.full_name || a?.email || null,
      });
  }
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center">
        <p className="font-medium">No CRM activity yet</p>
        <p className="mt-1 text-sm text-slate-500">
          Notes, calls, emails, visits, appointments and follow-ups will appear
          here.
        </p>
      </div>
    );
  return (
    <div className="relative">
      <div className="absolute bottom-2 left-[15px] top-2 w-px bg-slate-200" />
      <div className="space-y-1">
        {items.slice(0, 40).map((i) => (
          <article
            key={i.id}
            className="relative grid grid-cols-[32px_1fr] gap-3 py-3"
          >
            <div
              className={`relative z-10 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${kindStyle(i.kind)}`}
            >
              {kindIcon(i.kind)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                {i.href ? (
                  <Link
                    href={i.href}
                    className="font-semibold text-slate-800 hover:underline"
                  >
                    {i.title}
                  </Link>
                ) : (
                  <p className="font-semibold text-slate-800">{i.title}</p>
                )}
                <time className="whitespace-nowrap text-xs text-slate-400">
                  {formatDateTime(i.at)}
                </time>
              </div>
              {i.meta && (
                <p className="mt-0.5 text-xs capitalize text-slate-500">
                  {i.meta}
                </p>
              )}
              {i.detail && (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {i.detail}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
function kindIcon(k: TimelineItem["kind"]) {
  return k === "visit"
    ? "V"
    : k === "appointment"
      ? "A"
      : k === "note"
        ? "N"
        : k === "call"
          ? "C"
          : k === "email"
            ? "E"
            : k === "whatsapp"
              ? "W"
            : "T";
}
function kindStyle(k: TimelineItem["kind"]) {
  return k === "visit"
    ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
    : k === "appointment"
      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
      : k === "note"
        ? "bg-violet-50 text-violet-700 ring-1 ring-violet-200"
        : k === "call"
          ? "bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200"
          : k === "email"
            ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200"
            : k === "whatsapp"
              ? "bg-green-50 text-green-700 ring-1 ring-green-200"
            : "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
}
function one<T>(value:T|T[]|null|undefined){return Array.isArray(value)?value[0]:value||null}
function channelLabel(value:string){return value === "whatsapp" ? "WhatsApp" : value.charAt(0).toUpperCase()+value.slice(1)}
function outcomeLabel(value:string){return value.replace(/_/g," ")}
function formatDateTime(v: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
