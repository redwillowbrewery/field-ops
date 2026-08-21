"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initialState);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">Email address</label>
        <input name="email" type="email" autoComplete="email" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400" />
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-200">Password</label>
        <input name="password" type="password" autoComplete="current-password" required className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-400" />
      </div>
      {state.error ? <p className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-200">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
