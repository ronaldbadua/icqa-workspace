import { Sidebar } from "@/components/dashboard/sidebar";
import { VersionGuard } from "@/components/dashboard/version-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const email = supabase ? (await supabase.auth.getUser()).data.user?.email ?? null : null;

  return (
    <div className="flex min-h-svh w-full max-w-full bg-[#e8ebf0] text-slate-900">
      <VersionGuard />
      <Sidebar email={email} />
      <div className="min-w-0 flex-1 overflow-x-auto p-4 md:p-8">
        <div className="mx-auto w-full max-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
