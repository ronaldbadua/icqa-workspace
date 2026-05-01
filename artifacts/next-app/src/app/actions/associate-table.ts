"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export type AssociatePScore = {
  associate_id: string;
  p1: string;
  p2: string;
  p3: string;
  login: string;
};

export async function getAssociatePScores(): Promise<{ data: AssociatePScore[]; error: string | null }> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { data: [], error: "missing_config" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("associate_p_scores")
    .select("associate_id, p1, p2, p3, login");

  if (error) return { data: [], error: (error as { message: string }).message };
  return { data: (data ?? []) as AssociatePScore[], error: null };
}

export async function saveAssociatePScores(
  scores: AssociatePScore[]
): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("associate_p_scores")
    .upsert(scores, { onConflict: "associate_id" });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/associate-table");
  revalidatePath("/process-path");
  revalidatePath("/hourly-notes");
  return { ok: true };
}

export async function updateAssociateNames(
  updates: { id: string; name: string }[]
): Promise<ActionResult> {
  if (!updates.length) return { ok: true };
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  for (const u of updates) {
    const trimmed = u.name.trim();
    if (!trimmed) continue;
    const { error } = await db
      .from("associates")
      .update({ name: trimmed })
      .eq("id", u.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidatePath("/process-path");
  revalidatePath("/scheduling");
  revalidatePath("/associate-table");
  return { ok: true };
}

export async function saveAssociateLogin(
  associate_id: string,
  login: string
): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Try to update existing row first; insert if none exists
  const { data: existing } = await db
    .from("associate_p_scores")
    .select("associate_id, p1, p2, p3")
    .eq("associate_id", associate_id)
    .maybeSingle();

  const row = {
    associate_id,
    login,
    p1: existing?.p1 ?? "",
    p2: existing?.p2 ?? "",
    p3: existing?.p3 ?? "",
  };

  const { error } = await db
    .from("associate_p_scores")
    .upsert(row, { onConflict: "associate_id" });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/scheduling");
  revalidatePath("/associate-table");
  revalidatePath("/hourly-notes");
  return { ok: true };
}
