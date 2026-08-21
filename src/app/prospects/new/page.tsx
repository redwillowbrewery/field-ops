import Link from "next/link";
import { ProspectForm } from "./prospect-form";

export default function NewProspectPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
          <Link href="/map" className="text-sm font-medium text-slate-500">← Map</Link>
          <h1 className="mt-3 text-2xl font-semibold">Add prospect</h1>
          <p className="mt-1 text-sm text-slate-500">Capture a new sales opportunity while you’re out in the area.</p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <ProspectForm />
        </div>
      </main>
    </div>
  );
}
