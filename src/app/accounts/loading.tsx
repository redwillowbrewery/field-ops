import { BottomNav } from "@/components/bottom-nav";

export default function AccountsLoading() {
  return (
    <div
      className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-8"
      aria-busy="true"
      aria-live="polite"
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Field Ops
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Loading accounts…
            </h1>
          </div>
          <div className="mt-4 h-11 animate-pulse rounded-xl bg-slate-100" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-3 px-4 py-4 sm:px-6">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4"
          >
            <div className="h-5 w-48 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-32 rounded bg-slate-100" />
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[0, 1, 2, 3].map((cell) => (
                <div key={cell} className="h-10 rounded bg-slate-100" />
              ))}
            </div>
          </div>
        ))}
      </main>
      <BottomNav active="Accounts" />
    </div>
  );
}
