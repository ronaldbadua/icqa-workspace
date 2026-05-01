"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export type StaffingRecord = {
  id: string;
  staffing_date: string;
  associate_login: string;
  shift_type: string;
  role: string;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type StaffingInput = {
  staffing_date: string;
  associate_login: string;
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
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return {
    data: rows.map((r) => ({
      id: r.id as string,
      staffing_date: r.staffing_date as string,
      associate_login: (r.associate_name as string) ?? "",
      shift_type: r.shift_type as string,
      role: r.role as string,
      status: r.status as string,
      notes: r.notes as string,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    })),
    error: null,
  };
}

export async function createStaffingRecord(
  input: StaffingInput
): Promise<ActionResult> {
  if (!input.associate_login.trim()) return { ok: false, error: "Associate login is required." };
  const supabase = await getSupabase();
  if (!supabase) return { ok: false, error: "Supabase is not configured." };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("staffing_records")
    .insert({
      staffing_date: input.staffing_date,
      associate_name: input.associate_login.trim(),
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

  const { associate_login, ...rest } = input;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, unknown> = { ...rest };
  if (associate_login !== undefined) {
    patch.associate_name = associate_login.trim();
  }
  patch.updated_at = new Date().toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from("staffing_records").update(patch).eq("id", id);

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
