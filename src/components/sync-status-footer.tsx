"use client";

import { useEffect, useState } from "react";

type SyncModule = {
  module: string;
  last_success_at: string | null;
  last_error: string | null;
  last_row_count: number | null;
};

export function SyncStatusFooter() {
  const [modules, setModules] = useState<SyncModule[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sync-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { modules: [] }))
      .then((body) => { if (!cancelled) setModules(body.modules ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!modules.length) return null;

  return (
    <footer className="border-t border-slate-200 bg-white/80 px-4 py-2 text-[11px] text-slate-500 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold text-slate-600">ViewPlan data</span>
        {modules.map((item) => {
          const failed = Boolean(item.last_error);
          const stale = item.last_success_at ? Date.now() - new Date(item.last_success_at).getTime() > 36 * 60 * 60 * 1000 : true;
          return (
            <span key={item.module} className={failed ? "text-red-600" : stale ? "text-amber-600" : "text-slate-500"} title={item.last_error || undefined}>
              <span className="capitalize">{item.module}</span>: {item.last_success_at ? formatSyncTime(item.last_success_at) : "never"}{failed ? " · error" : ""}
            </span>
          );
        })}
      </div>
    </footer>
  );
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
