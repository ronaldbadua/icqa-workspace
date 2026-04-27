import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-[#0f172a] px-4 py-12 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/60 p-8 shadow-xl backdrop-blur">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400">ICQA Workspace</p>
        <h1 className="mt-2 text-center text-2xl font-bold text-white">Create account</h1>
        <p className="mt-2 text-center text-sm text-slate-400">
          Create a free account to access the ICQA Workspace and Chat Thread.
        </p>
        <div className="mt-6">
          <SignupForm />
        </div>
        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-sky-400 hover:text-sky-300">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
