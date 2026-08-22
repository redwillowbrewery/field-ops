import Link from "next/link";

type Visit = { id:string; completed_at:string|null; notes:string|null; outcome:string|null; contact?:{full_name?:string|null}|{full_name?:string|null}[]|null; salesperson?:{full_name?:string|null;email?:string|null}|{full_name?:string|null;email?:string|null}[]|null };
type Appointment = { id:string; starts_at:string; purpose:string|null; status:string; notes?:string|null };
type Task = { id:string; title:string; task_type:string; due_at:string|null; status:string; completed_at?:string|null; notes?:string|null; created_at?:string|null };
type TimelineItem = { id:string; at:string; kind:"visit"|"appointment"|"task"; title:string; detail?:string|null; meta?:string|null; href?:string };

export function AccountTimeline({visits,appointments,tasks}:{visits:Visit[];appointments:Appointment[];tasks:Task[]}){
  const items:TimelineItem[]=[];
  for(const v of visits){if(!v.completed_at)continue;const contact=Array.isArray(v.contact)?v.contact[0]:v.contact;const salesperson=Array.isArray(v.salesperson)?v.salesperson[0]:v.salesperson;items.push({id:`visit-${v.id}`,at:v.completed_at,kind:"visit",title:`Visit${v.outcome?` · ${v.outcome}`:""}`,detail:v.notes,meta:[contact?.full_name?`Met ${contact.full_name}`:null,salesperson?.full_name||salesperson?.email].filter(Boolean).join(" · ")});}
  for(const a of appointments){items.push({id:`appointment-${a.id}`,at:a.starts_at,kind:"appointment",title:a.purpose||"Sales appointment",detail:a.notes,meta:a.status,href:`/appointments/${a.id}`});}
  for(const t of tasks){const at=t.completed_at||t.due_at||t.created_at;if(!at)continue;items.push({id:`task-${t.id}`,at,kind:"task",title:t.title,detail:t.notes,meta:`${t.task_type} · ${t.status}`});}
  items.sort((a,b)=>new Date(b.at).getTime()-new Date(a.at).getTime());
  if(!items.length)return <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center"><p className="font-medium">No CRM activity yet</p><p className="mt-1 text-sm text-slate-500">Visits, appointments and follow-ups will appear here.</p></div>;
  return <div className="relative"><div className="absolute bottom-2 left-[15px] top-2 w-px bg-slate-200"/><div className="space-y-1">{items.slice(0,40).map(item=><article key={item.id} className="relative grid grid-cols-[32px_1fr] gap-3 py-3"><div className={`relative z-10 mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${kindStyle(item.kind)}`}>{kindIcon(item.kind)}</div><div className="min-w-0"><div className="flex flex-wrap items-start justify-between gap-2">{item.href?<Link href={item.href} className="font-semibold text-slate-800 hover:underline">{item.title}</Link>:<p className="font-semibold text-slate-800">{item.title}</p>}<time className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(item.at)}</time></div>{item.meta&&<p className="mt-0.5 text-xs capitalize text-slate-500">{item.meta}</p>}{item.detail&&<p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.detail}</p>}</div></article>)}</div></div>;
}
function kindIcon(k:TimelineItem["kind"]){return k==="visit"?"V":k==="appointment"?"A":"T"}
function kindStyle(k:TimelineItem["kind"]){return k==="visit"?"bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200":k==="appointment"?"bg-blue-50 text-blue-700 ring-1 ring-blue-200":"bg-amber-50 text-amber-700 ring-1 ring-amber-200"}
function formatDateTime(v:string){return new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v))}
