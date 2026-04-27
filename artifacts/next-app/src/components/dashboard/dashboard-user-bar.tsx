import { signOut } from "@/app/actions/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DashboardUserBar() {
  const supabase = await createServerSupabaseClient();
  const email = supabase ? (await supabase.auth.getUser()).data.user?.email : null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-sm shadow-sm">
      <p className="truncate text-slate-600">
        Signed in as <span className="font-medium text-slate-900">{email ?? "—"}</span>
      </p>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
