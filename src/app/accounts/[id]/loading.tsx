import { BottomNav } from "@/components/bottom-nav";

export default function AccountLoading() {
  return (
    <div
      className="min-h-screen bg-slate-50 pb-24 text-slate-950 md:pb-10"
      aria-busy="true"
      aria-live="polite"
    >
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <p className="text-sm font-medium text-slate-500">← Accounts</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-950" />
            <div>
              <h1 className="text-2xl font-semibold">Loading account…</h1>
              <p className="mt-1 text-sm text-slate-500">
                Loading customer details, current products and prices.
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 sm:px-6">
        {[0, 1, 2].map((item) => (
          <section
            key={item}
            className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="h-5 w-44 rounded bg-slate-200" />
            <div className="mt-3 h-4 w-64 max-w-full rounded bg-slate-100" />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="h-12 rounded-xl bg-slate-100" />
              <div className="h-12 rounded-xl bg-slate-100" />
            </div>
          </section>
        ))}
      </main>
      <BottomNav active="Accounts" />
    </div>
  );
}
