import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const next = sp.next ?? "/hourly-notes";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#0f172a] px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">ICQA Workspace</p>
        <h1 className="mt-2 text-center text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-2 text-center text-sm text-slate-400">Sign in to access the ICQA Workspace.</p>

        {sp.error === "auth" ? (
          <p className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-center text-sm text-rose-200">
            Email link or confirmation failed. Try again or sign in with password.
          </p>
        ) : null}
        {sp.error === "config" ? (
          <p className="mt-4 rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-2 text-center text-sm text-amber-100">
            Missing Supabase environment variables on the server.
          </p>
        ) : null}

        <div className="mt-6">
          <LoginForm nextPath={next} />
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          No account?{" "}
          <Link href="/signup" className="font-medium text-sky-400 hover:text-sky-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
