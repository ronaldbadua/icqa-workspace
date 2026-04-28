import { PageHero } from "@/components/dashboard/page-hero";
import { ShiftManagerPanel } from "@/components/dashboard/shift-manager-panel";
import { ensurePoolingRulesForAssociates } from "@/app/actions/scheduling";
import { getSchedulingData, isSupabaseConfigured } from "@/lib/data/queries";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { defaultYmParam } from "@/lib/week";

async function getLoginMap(): Promise<Record<string, string>> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("associate_p_scores")
    .select("associate_id, login");
  if (!data) return {};
  return Object.fromEntries(
    (data as { associate_id: string; login: string }[]).map((r) => [r.associate_id, r.login])
  );
}

function isYm(s: string) {
  return /^\d{4}-\d{2}$/.test(s);
}

export default async function SchedulingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const ym = sp.month && isYm(sp.month) ? sp.month : defaultYmParam();
  const hasConfig = isSupabaseConfigured();

  if (hasConfig) {
    await ensurePoolingRulesForAssociates();
  }

  const [{ associates, rules, assignments, monthDays, error }, loginMap] = await Promise.all([
    getSchedulingData(ym),
    getLoginMap(),
  ]);

  return (
    <>
      <PageHero kicker="Shift operations" title="ShiftManager Operations Dashboard" pill="Scheduling" />
      <ShiftManagerPanel
        key={ym}
        ym={ym}
        associates={associates}
        rules={rules}
        assignments={assignments}
        monthDays={monthDays}
        loginMap={loginMap}
        hasSupabase={hasConfig && error !== "missing_config"}
        queryError={error && error !== "missing_config" ? error : null}
      />
    </>
  );
}
