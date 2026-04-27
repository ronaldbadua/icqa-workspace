import { PageHero } from "@/components/dashboard/page-hero";
import { ShiftManagerPanel } from "@/components/dashboard/shift-manager-panel";
import { ensurePoolingRulesForAssociates } from "@/app/actions/scheduling";
import { getSchedulingData, isSupabaseConfigured } from "@/lib/data/queries";
import { defaultYmParam } from "@/lib/week";

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

  const { associates, rules, assignments, monthDays, error } = await getSchedulingData(ym);

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
        hasSupabase={hasConfig && error !== "missing_config"}
        queryError={error && error !== "missing_config" ? error : null}
      />
    </>
  );
}
