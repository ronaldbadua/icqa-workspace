"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProcessStage } from "@/lib/supabase/database.types";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createProcessItem(data: {
  title: string;
  detail: string;
  stage: ProcessStage;
}): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  if (!data.title.trim()) {
    return { ok: false, error: "Title is required." };
  }
  const { data: last } = await supabase
    .from("process_path_items")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? 0) + 1;

  const { error } = await supabase.from("process_path_items").insert({
    title: data.title.trim(),
    detail: data.detail?.trim() ?? "",
    stage: data.stage,
    sort_order: nextOrder,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/process-path");
  return { ok: true };
}

export async function updateProcessItem(
  id: string,
  data: { title: string; detail: string; stage: ProcessStage }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  if (!data.title.trim()) {
    return { ok: false, error: "Title is required." };
  }
  const { error } = await supabase
    .from("process_path_items")
    .update({
      title: data.title.trim(),
      detail: data.detail?.trim() ?? "",
      stage: data.stage,
    })
    .eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/process-path");
  return { ok: true };
}

export async function deleteProcessItem(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { error } = await supabase.from("process_path_items").delete().eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }
  revalidatePath("/process-path");
  return { ok: true };
}
