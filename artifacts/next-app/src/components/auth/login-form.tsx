"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const email = String(fd.get("email") || "");
        const password = String(fd.get("password") || "");
        setError(null);
        startTransition(async () => {
          const supabase = createBrowserSupabaseClient();
          if (!supabase) {
            setError("Supabase is not configured in the browser.");
            return;
          }
          const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
          if (signErr) {
            setError(signErr.message);
            return;
          }
          const safe = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/hourly-notes";
          router.replace(safe);
          router.refresh();
        });
      }}
    >
      {error ? (
        <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-sm text-rose-100" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-400">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-sky-500/50 focus:ring-2"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-400">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-lg border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-white outline-none ring-sky-500/50 focus:ring-2"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-sky-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-500 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
