import { PageHero } from "@/components/dashboard/page-hero";
import { DatabaseWorkspacePanel } from "@/components/dashboard/database-workspace-panel";
import { getDatabaseEntries, isSupabaseConfigured } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

export default async function DatabasePage() {
  const { entries, error } = await getDatabaseEntries();
  const hasConfig = isSupabaseConfigured();

  return (
    <>
      <PageHero kicker="Data workspace" title="ICQA Dashboard" pill="Database" />
      <DatabaseWorkspacePanel
        entries={entries}
        hasSupabase={hasConfig && error !== "missing_config"}
        queryError={error && error !== "missing_config" ? error : null}
      />
    </>
  );
}
