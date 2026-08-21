import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-5">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-400">RedWillow</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Field Ops</h1>
        <p className="mb-7 mt-2 text-slate-400">Sign in to view and manage customer accounts.</p>
        <LoginForm />
      </section>
    </main>
  );
}
