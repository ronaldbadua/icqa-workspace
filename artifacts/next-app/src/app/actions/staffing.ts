"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export type StaffingRecord = {
  id: string;
  staffing_date: string;
  associate_name: string;
  shift_type: string;
  role: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type StaffingInput = {
  staffing_date: string;
  associate_name: string;
  shift_type: string;
  role: string;
  status: string;
  notes: string;
};

function getSupabase() {
  return createAdminSupabaseClient() ?? createServerSupabaseClient();
}

export async function getStaffingRecords(
  date: string
): Promise<{ data: StaffingRecord[]; error: string | null }> {
  const supabase = await getSupabase();
  if (!supabase) return { data: [], error: "missing_config" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("staffing_records")
    .select("id, staffing_date, associate_name, shift_type, role, status, notes, created_at, updated_at")
    .eq("staffing_date", date)
    .order("created_at", { ascending: true });

  if (error) return { data: [], error: (error as { message: string }).message };
  return { data: (data ?? []) as StaffingRecord[], error: null };
}

export async function createStaffingRecord(
  input: StaffingInput
): Promise<ActionResult> {
  if (!input.associate_name.trim()) return { ok: false, error: "Associate name is required." };
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("staffing_records")
    .insert({
      staffing_date: input.staffing_date,
      associate_name: input.associate_name.trim(),
      shift_type: input.shift_type,
      role: input.role,
      status: input.status,
      notes: input.notes.trim(),
    });

  if (error) return { ok: false, error: (error as { message: string }).message };
  revalidatePath("/staffing");
  return { ok: true };
}

export async function updateStaffingRecord(
  id: string,
  input: Partial<StaffingInput>
): Promise<ActionResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("staffing_records")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: (error as { message: string }).message };
  revalidatePath("/staffing");
  return { ok: true };
}

export async function deleteStaffingRecord(id: string): Promise<ActionResult> {
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("staffing_records")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, error: (error as { message: string }).message };
  revalidatePath("/staffing");
  return { ok: true };
}

export async function updateStaffingStatus(
  id: string,
  status: string
): Promise<ActionResult> {
  return updateStaffingRecord(id, { status });
}
