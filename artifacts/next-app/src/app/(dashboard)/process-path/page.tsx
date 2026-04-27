import { PageHero } from "@/components/dashboard/page-hero";
import { ProcessPathPanel } from "@/components/dashboard/process-path-panel";
import { AssociateTablePanel } from "@/components/dashboard/associate-table-panel";
import { getProcessPathItems, isSupabaseConfigured } from "@/lib/data/queries";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssociatePScore } from "@/app/actions/associate-table";

async function getAssociateData() {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { associates: [], scores: [], assocError: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [associatesRes, scoresRes] = await Promise.all([
    db
      .from("associates")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(15),
    db
      .from("associate_p_scores")
      .select("associate_id, p1, p2, p3, login"),
  ]);

  const assocError: string | null =
    associatesRes.error?.message ?? scoresRes.error?.message ?? null;

  return {
    associates: (associatesRes.data ?? []) as { id: string; name: string }[],
    scores: (scoresRes.data ?? []) as AssociatePScore[],
    assocError,
  };
}

export default async function ProcessPathPage() {
  const hasConfig = isSupabaseConfigured();

  const [processResult, associateResult] = await Promise.all([
    getProcessPathItems(),
    getAssociateData(),
  ]);

  const { items, error } = processResult;
  const { associates, scores, assocError } = associateResult;

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
      <div className="mt-6">
        <AssociateTablePanel
          associates={associates}
          scores={scores}
          hasSupabase={hasConfig}
          queryError={assocError}
        />
      </div>
    </>
  );
}
