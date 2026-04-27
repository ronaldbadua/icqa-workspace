import { PageHero } from "@/components/dashboard/page-hero";
import { ProcessPathPanel } from "@/components/dashboard/process-path-panel";
import { getProcessPathItems, isSupabaseConfigured } from "@/lib/data/queries";

export default async function ProcessPathPage() {
  const { items, error } = await getProcessPathItems();
  const hasConfig = isSupabaseConfigured();

  return (
    <>
      <PageHero
        kicker="Operational workflow and ownership"
        title="ICQA Dashboard"
        pill="Process Path"
      />
      <ProcessPathPanel
        items={items}
        hasSupabase={hasConfig && error !== "missing_config"}
        queryError={error && error !== "missing_config" ? error : null}
      />
    </>
  );
}
