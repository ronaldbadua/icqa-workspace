import { Sidebar } from "@/components/dashboard/sidebar";
import { VersionGuard } from "@/components/dashboard/version-guard";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const email = user?.email ?? null;
  const userId = user?.id ?? null;

  // Fetch initial unread count for the sidebar badge
  let initialUnreadCount = 0;
  if (supabase && userId) {
    try {
      const { data: readData } = await supabase
        .from("chat_reads")
        .select("last_read_at")
        .eq("user_id", userId)
        .maybeSingle();
      const lastReadAt = readData?.last_read_at ?? "1970-01-01T00:00:00Z";
      const { count } = await supabase
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .gt("created_at", lastReadAt)
        .neq("user_id", userId);
      initialUnreadCount = count ?? 0;
    } catch {
      initialUnreadCount = 0;
    }
  }

  return (
    <div className="flex min-h-svh w-full max-w-full bg-[#e8ebf0] text-slate-900">
      <VersionGuard />
      <Sidebar email={email} userId={userId} initialUnreadCount={initialUnreadCount} />
      <div className="min-w-0 flex-1 overflow-x-auto p-4 md:p-8">
        <div className="mx-auto w-full max-w-full">
          {children}
        </div>
      </div>
    </div>
  );
}
