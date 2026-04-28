import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";

export type DatabaseEntryRow = Database["public"]["Tables"]["database_entries"]["Row"];

const LABEL_MAX = 200;
const NOTES_MAX = 50000;

function mapDatabaseEntriesError(message: string) {
  const lower = message.toLowerCase();
  if (
    lower.includes("database_entries") &&
    (lower.includes("does not exist") || lower.includes("could not find the table"))
  ) {
    return "Database table 'database_entries' is missing. Run the latest Supabase migration, then reload this page.";
  }
  return message;
}

function normalizeLabel(raw: string) {
  return raw.trim().slice(0, LABEL_MAX);
}

function normalizeNotes(raw: string) {
  return raw.slice(0, NOTES_MAX);
}

function parseDataJson(raw: unknown): { ok: true; value: Json } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: {} };
  }
  if (typeof raw === "string") {
    if (raw.trim() === "") return { ok: true, value: {} };
    try {
      const v = JSON.parse(raw) as unknown;
      if (v === null || typeof v !== "object" || Array.isArray(v)) {
        return { ok: false, error: "Data must be a JSON object (not an array)." };
      }
      return { ok: true, value: v as Json };
    } catch {
      return { ok: false, error: "Invalid JSON in data field." };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: raw as Json };
  }
  return { ok: false, error: "Data must be a JSON object." };
}

export function validateEntryInput(input: { label: string; notes: string; data: unknown }): { ok: true; label: string; notes: string; data: Json } | { ok: false; error: string } {
  const label = normalizeLabel(input.label);
  if (!label) {
    return { ok: false, error: "Label is required." };
  }
  const notes = normalizeNotes(typeof input.notes === "string" ? input.notes : "");
  const dataParsed = parseDataJson(input.data);
  if (!dataParsed.ok) {
    return { ok: false, error: dataParsed.error };
  }
  return { ok: true, label, notes, data: dataParsed.value };
}

export async function listDatabaseEntries(
  supabase: SupabaseClient<Database>
): Promise<{ data: DatabaseEntryRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from("database_entries")
    .select("id, label, notes, data, created_at, updated_at, created_by")
    .order("updated_at", { ascending: false });
  if (error) {
    return { data: [], error: mapDatabaseEntriesError(error.message) };
  }
  return { data: (data ?? []) as DatabaseEntryRow[], error: null };
}

export async function getDatabaseEntryById(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<{ data: DatabaseEntryRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from("database_entries")
    .select("id, label, notes, data, created_at, updated_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return { data: null, error: mapDatabaseEntriesError(error.message) };
  }
  return { data: (data as DatabaseEntryRow) ?? null, error: null };
}

export async function insertDatabaseEntry(
  supabase: SupabaseClient<Database>,
  input: { label: string; notes: string; data: unknown }
): Promise<{ data: { id: string } | null; error: string | null }> {
  const v = validateEntryInput(input);
  if (!v.ok) {
    return { data: null, error: v.error };
  }
  const { data, error } = await supabase
    .from("database_entries")
    .insert({ label: v.label, notes: v.notes, data: v.data })
    .select("id")
    .single();
  if (error) {
    return { data: null, error: mapDatabaseEntriesError(error.message) };
  }
  return { data, error: null };
}

const BULK_INSERT_BATCH = 75;

export async function insertDatabaseEntries(
  supabase: SupabaseClient<Database>,
  inputs: Array<{ label: string; notes: string; data: unknown }>
): Promise<{ inserted: number; error: string | null }> {
  if (inputs.length === 0) {
    return { inserted: 0, error: null };
  }
  const rows: Array<{ label: string; notes: string; data: Json }> = [];
  for (const input of inputs) {
    const v = validateEntryInput(input);
    if (!v.ok) {
      return { inserted: 0, error: v.error };
    }
    rows.push({ label: v.label, notes: v.notes, data: v.data });
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BULK_INSERT_BATCH) {
    const batch = rows.slice(i, i + BULK_INSERT_BATCH);
    const { error } = await supabase.from("database_entries").insert(batch);
    if (error) {
      return { inserted, error: mapDatabaseEntriesError(error.message) };
    }
    inserted += batch.length;
  }
  return { inserted, error: null };
}

export async function updateDatabaseEntry(
  supabase: SupabaseClient<Database>,
  id: string,
  input: { label: string; notes: string; data: unknown }
): Promise<{ error: string | null }> {
  const v = validateEntryInput(input);
  if (!v.ok) {
    return { error: v.error };
  }
  const { error } = await supabase
    .from("database_entries")
    .update({ label: v.label, notes: v.notes, data: v.data })
    .eq("id", id);
  return { error: error ? mapDatabaseEntriesError(error.message) : null };
}

export async function deleteDatabaseEntry(
  supabase: SupabaseClient<Database>,
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("database_entries").delete().eq("id", id);
  return { error: error ? mapDatabaseEntriesError(error.message) : null };
}
