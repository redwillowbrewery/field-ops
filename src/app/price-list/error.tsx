"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-5 py-20 text-slate-900"><h1 className="text-2xl font-semibold">The price list is temporarily unavailable</h1><p className="mt-3">Please try again or contact your RedWillow salesperson.</p><button onClick={reset} className="mt-4 rounded-xl bg-slate-950 px-4 py-3 text-white">Try again</button></main>;
}
