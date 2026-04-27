"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  deleteDatabaseEntry,
  insertDatabaseEntry,
  updateDatabaseEntry,
} from "@/lib/services/database-entries";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createDatabaseEntryAction(input: {
  label: string;
  notes: string;
  data: unknown;
}): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { data, error } = await insertDatabaseEntry(supabase, input);
  if (error || !data) {
    return { ok: false, error: error ?? "Failed to create entry." };
  }
  revalidatePath("/database");
  return { ok: true };
}

export async function updateDatabaseEntryAction(
  id: string,
  input: { label: string; notes: string; data: unknown }
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { error } = await updateDatabaseEntry(supabase, id, input);
  if (error) {
    return { ok: false, error };
  }
  revalidatePath("/database");
  return { ok: true };
}

export async function deleteDatabaseEntryAction(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { ok: false, error: "Supabase is not configured on the server." };
  }
  const { error } = await deleteDatabaseEntry(supabase, id);
  if (error) {
    return { ok: false, error };
  }
  revalidatePath("/database");
  return { ok: true };
}
