"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import {
  deleteDatabaseEntry,
  insertDatabaseEntry,
  updateDatabaseEntry,
} from "@/lib/services/database-entries";

type ActionResult = { ok: true } | { ok: false; error: string };

function getSupabase() {
  return createAdminSupabaseClient() ?? createServerSupabaseClient();
}

export async function createDatabaseEntryAction(input: {
  label: string;
  notes: string;
  data: unknown;
}): Promise<ActionResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { data, error } = await insertDatabaseEntry(supabase, input);
  if (error || !data) return { ok: false, error: error ?? "Failed to create entry." };
  revalidatePath("/database");
  return { ok: true };
}

export async function updateDatabaseEntryAction(
  id: string,
  input: { label: string; notes: string; data: unknown }
): Promise<ActionResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await updateDatabaseEntry(supabase, id, input);
  if (error) return { ok: false, error };
  revalidatePath("/database");
  return { ok: true };
}

export async function deleteDatabaseEntryAction(id: string): Promise<ActionResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await deleteDatabaseEntry(supabase, id);
  if (error) return { ok: false, error };
  revalidatePath("/database");
  return { ok: true };
}

export async function importFromDocxAction(
  formData: FormData
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "No file provided." };
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return { ok: false, error: "Only .docx files are supported." };
  }

  let text = "";
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } catch (err) {
    return { ok: false, error: `Failed to parse document: ${String(err)}` };
  }

  const rawSections = text.split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);

  const records: { label: string; notes: string; data: Record<string, unknown> }[] = [];
  for (const section of rawSections) {
    const lines = section.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const label = lines[0].slice(0, 200);
    const notes = lines.slice(1).join("\n").trim();
    records.push({ label, notes, data: {} });
  }

  if (!records.length) {
    return { ok: false, error: "No content found in the document." };
  }

  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("database_entries").insert(records);
  if (error) return { ok: false, error: (error as { message: string }).message };

  revalidatePath("/database");
  return { ok: true, count: records.length };
}

export async function bulkCreateDatabaseEntriesAction(
  records: { label: string; notes: string; data: Record<string, unknown> }[]
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  if (!records.length) return { ok: false, error: "No records to insert." };
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("database_entries").insert(records);
  if (error) return { ok: false, error: (error as { message: string }).message };
  revalidatePath("/database");
  return { ok: true, count: records.length };
}
