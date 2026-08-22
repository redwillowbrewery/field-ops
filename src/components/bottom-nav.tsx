import Link from "next/link";

const items = [
  { label: "Today", href: "/today", icon: "calendar" },
  { label: "Accounts", href: "/accounts", icon: "accounts" },
  { label: "Map", href: "/map", icon: "map" },
  { label: "Tasks", href: "/tasks", icon: "tasks" },
  { label: "Sales", href: "/sales-intelligence", icon: "sales" },
];

export function BottomNav({ active = "Accounts" }: { active?: string }) {
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {items.map((item) => <NavItem key={item.label} item={item} active={active} mobile />)}
        </div>
      </nav>
      <nav className="sticky top-0 z-50 hidden border-b border-slate-200 bg-white/95 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/today" className="text-sm font-bold tracking-tight text-slate-950">Field Ops</Link>
          <div className="flex items-center gap-1">{items.map((item) => <NavItem key={item.label} item={item} active={active} />)}</div>
        </div>
      </nav>
    </>
  );
}

function NavItem({ item, active, mobile = false }: { item: (typeof items)[number]; active: string; mobile?: boolean }) {
  const isActive = item.label === active;
  const classes = mobile
    ? `flex min-h-16 flex-col items-center justify-center gap-1 px-1 ${isActive ? "text-slate-950" : "text-slate-400"}`
    : `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`;
  return <Link href={item.href} className={classes}><NavIcon name={item.icon} /><span>{item.label}</span></Link>;
}

function NavIcon({name}:{name:string}){const common="h-5 w-5";if(name==="accounts")return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;if(name==="calendar")return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>;if(name==="map")return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15M15 6v15"/></svg>;if(name==="tasks")return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;if(name==="sales")return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m3 8 6-4 6 7 6-5"/></svg>;return null;}
