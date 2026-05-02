import { createServerSupabaseClient, createAdminSupabaseClient } from "@/lib/supabase/server";
import { listDatabaseEntries, type DatabaseEntryRow } from "@/lib/services/database-entries";
import type { AssignmentRole, HourlyNoteStatus, ProcessStage, ShiftType } from "@/lib/supabase/database.types";
import { monthBounds, monthDays } from "@/lib/week";

export type { DatabaseEntryRow };

export type AssociateRow = {
  id: string;
  name: string;
  shift_type: ShiftType;
  is_active: boolean;
  is_afm: boolean;
  is_ps: boolean;
  created_at: string;
  updated_at: string;
};

export type PoolingRuleRow = {
  id: string;
  associate_id: string;
  allow_sunday: boolean;
  allow_monday: boolean;
  allow_tuesday: boolean;
  allow_wednesday: boolean;
  allow_thursday: boolean;
  allow_friday: boolean;
  allow_saturday: boolean;
  created_at: string;
  updated_at: string;
};

export type MonthlyAssignmentRow = {
  id: string;
  assignment_date: string;
  role: AssignmentRole;
  slot_type: ShiftType;
  associate_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export type HourlyNoteRow = { id: string; hour: number; status: HourlyNoteStatus; content: string; author_name: string; manager_comment: string };

export async function getHourlyNotesForDate(dateStr: string) {
  // Prefer admin client (bypasses RLS). Fall back to regular session client.
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) {
    return { rows: [] as HourlyNoteRow[], error: "missing_config" as const };
  }

  const { data, error } = await supabase
    .from("hourly_notes")
    .select("id, hour, status, content, author_name, manager_comment")
    .eq("note_date", dateStr)
    .order("hour", { ascending: true });

  if (error) {
    // If manager_comment column doesn't exist yet, fall back without it
    const fallback = await supabase
      .from("hourly_notes")
      .select("id, hour, status, content, author_name")
      .eq("note_date", dateStr)
      .order("hour", { ascending: true });
    if (fallback.error) {
      return { rows: [] as HourlyNoteRow[], error: fallback.error.message };
    }
    return {
      rows: (fallback.data ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        manager_comment: "",
      })) as HourlyNoteRow[],
      error: null,
    };
  }

  return {
    rows: (data ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      manager_comment: (r.manager_comment as string) ?? "",
    })) as HourlyNoteRow[],
    error: null,
  };
}

export type ChatMessage = { id: string; body: string; author_name: string; user_id: string; created_at: string };

export async function getChatMessages(limit = 200) {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) {
    return { messages: [] as ChatMessage[], error: "missing_config" as const };
  }
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, body, author_name, user_id, created_at")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    return { messages: [] as ChatMessage[], error: error.message };
  }
  return { messages: (data ?? []) as ChatMessage[], error: null };
}

export type SourceEntry = {
  id: string;
  label: string;
  notes: string;
  sort_order: number | null;
  source_file: string | null;
  created_at: string;
};

export async function getDatabaseEntry(id: string) {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { entry: null, error: "missing_config" as const };
  const { getDatabaseEntryById } = await import("@/lib/services/database-entries");
  const { data, error } = await getDatabaseEntryById(supabase, id);
  if (error) return { entry: null, error };
  return { entry: data, error: null };
}

export async function getDatabaseSourceDocument(id: string): Promise<{
  focusEntry: SourceEntry | null;
  allEntries: SourceEntry[];
  sourceFile: string | null;
  error: string | null;
}> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { focusEntry: null, allEntries: [], sourceFile: null, error: "missing_config" };

  // Fetch the clicked entry including optional new columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: focusRaw, error: focusErr } = await (supabase as any)
    .from("database_entries")
    .select("id, label, notes, sort_order, source_file, created_at")
    .eq("id", id)
    .maybeSingle();

  if (focusErr) return { focusEntry: null, allEntries: [], sourceFile: null, error: (focusErr as { message: string }).message };
  if (!focusRaw) return { focusEntry: null, allEntries: [], sourceFile: null, error: null };

  const focus = focusRaw as SourceEntry;
  const sourceFile: string | null = focus.source_file ?? null;

  let allEntries: SourceEntry[] = [];

  if (sourceFile) {
    // Fetch all entries from the same source file, ordered by sort_order
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("database_entries")
      .select("id, label, notes, sort_order, source_file, created_at")
      .eq("source_file", sourceFile)
      .order("sort_order", { ascending: true });
    if (!error && data) allEntries = data as SourceEntry[];
  } else {
    // Fallback: group by same-second created_at (records from same import batch)
    const ts = focus.created_at.slice(0, 19); // "YYYY-MM-DDTHH:MM:SS"
    const from = ts + ".000Z";
    const to = ts + ".999Z";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("database_entries")
      .select("id, label, notes, sort_order, source_file, created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true });
    if (!error && data && (data as SourceEntry[]).length > 1) {
      allEntries = data as SourceEntry[];
    } else {
      // Last resort: just show the single entry
      allEntries = [focus];
    }
  }

  return { focusEntry: focus, allEntries, sourceFile, error: null };
}

export async function getDatabaseEntries() {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) {
    return { entries: [] as DatabaseEntryRow[], error: "missing_config" as const };
  }
  const { data, error } = await listDatabaseEntries(supabase);
  if (error) {
    return { entries: [] as DatabaseEntryRow[], error };
  }
  return { entries: data, error: null };
}

export async function getProcessPathItems() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { items: [] as ProcessRow[], error: "missing_config" as const };
  }
  const { data, error } = await supabase
    .from("process_path_items")
    .select("id, title, stage, detail, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true });
  if (error) {
    return { items: [] as ProcessRow[], error: error.message };
  }
  return { items: (data ?? []) as ProcessRow[], error: null };
}

export type ProcessRow = {
  id: string;
  title: string;
  stage: ProcessStage;
  detail: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export async function getSchedulingData(ym: string) {
  // Prefer admin client (bypasses RLS). Fall back to regular session client.
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) {
    return {
      associates: [] as AssociateRow[],
      rules: [] as PoolingRuleRow[],
      assignments: [] as MonthlyAssignmentRow[],
      monthDays: monthDays(ym),
      error: "missing_config" as const,
    };
  }

  const { start, end } = monthBounds(ym);
  const [associatesRes, rulesRes, assignmentsRes] = await Promise.all([
    supabase.from("associates").select("id, name, shift_type, is_active, is_afm, is_ps, created_at, updated_at").order("name", { ascending: true }),
    supabase.from("pooling_rules").select("id, associate_id, allow_sunday, allow_monday, allow_tuesday, allow_wednesday, allow_thursday, allow_friday, allow_saturday, created_at, updated_at"),
    supabase
      .from("monthly_assignments")
      .select("id, assignment_date, role, slot_type, associate_id, created_at, updated_at")
      .gte("assignment_date", start)
      .lte("assignment_date", end),
  ]);

  const error = associatesRes.error ?? rulesRes.error ?? assignmentsRes.error;
  if (error) {
    return {
      associates: [] as AssociateRow[],
      rules: [] as PoolingRuleRow[],
      assignments: [] as MonthlyAssignmentRow[],
      monthDays: monthDays(ym),
      error: error.message,
    };
  }

  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    associates: (associatesRes.data ?? []) as any as AssociateRow[],
    rules: (rulesRes.data ?? []) as PoolingRuleRow[],
    assignments: (assignmentsRes.data ?? []) as MonthlyAssignmentRow[],
    monthDays: monthDays(ym),
    error: null,
  };
}
