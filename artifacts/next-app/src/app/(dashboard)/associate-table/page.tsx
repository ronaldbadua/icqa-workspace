import { PageHero } from "@/components/dashboard/page-hero";
import { AssociateTablePanel } from "@/components/dashboard/associate-table-panel";
import { isSupabaseConfigured } from "@/lib/data/queries";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssociatePScore } from "@/app/actions/associate-table";

async function getData() {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) {
    return { associates: [], scores: [], error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [associatesRes, scoresRes] = await Promise.all([
    db.from("associates").select("id").eq("is_active", true).order("created_at", { ascending: true }).limit(15),
    db
      .from("associate_p_scores")
      .select("associate_id, p1, p2, p3, login"),
  ]);

  const error = associatesRes.error?.message ?? scoresRes.error?.message ?? null;

  return {
    associates: (associatesRes.data ?? []) as { id: string }[],
    scores: (scoresRes.data ?? []) as AssociatePScore[],
    error,
  };
}

export default async function AssociateTablePage() {
  const hasSupabase = isSupabaseConfigured();
  const { associates, scores, error } = await getData();

  const isSchemaError = error?.includes("schema cache") || error?.includes("associate_p_scores");
  const queryError = error && !isSchemaError ? error : isSchemaError ? error : null;

  return (
    <>
      <PageHero
        kicker="Associate performance tracking"
        title="Associate Table"
        pill="P1 / P2 / P3"
      />
      <AssociateTablePanel
        associates={associates}
        scores={scores}
        hasSupabase={hasSupabase}
        queryError={queryError ?? (isSchemaError ? error : null)}
      />
    </>
  );
}
