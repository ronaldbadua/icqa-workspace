"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentRole, ShiftType } from "@/lib/supabase/database.types";
import {
  canAssignDay,
  canAssignPooling,
  canAssignShift,
  defaultSlotTypeForDate,
  SLOT_TYPES,
  weekdayFromYmd,
} from "@/lib/shift-scheduling";
import { monthBounds } from "@/lib/week";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addAssociate(name: string, shiftType: ShiftType): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Associate name is required." };
  const { data, error } = await supabase
    .from("associates")
    .insert({ name: clean, shift_type: shiftType, is_active: true })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add associate." };

  // Default pooling rule row keeps Pooling tab and auto-assign in sync with the master list.
  await supabase.from("pooling_rules").insert({ associate_id: data.id });

  revalidatePath("/scheduling");
  return { ok: true };
}

export async function updateAssociate(data: {
  id: string;
  name: string;
  shift_type: ShiftType;
  is_active: boolean;
}): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  if (!data.name.trim()) return { ok: false, error: "Associate name is required." };
  const { error } = await supabase
    .from("associates")
    .update({ name: data.name.trim(), shift_type: data.shift_type, is_active: data.is_active })
    .eq("id", data.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/scheduling");
  return { ok: true };
}

export async function deleteAssociate(id: string): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await supabase.from("associates").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/scheduling");
  return { ok: true };
}

export async function upsertPoolingRule(data: {
  associate_id: string;
  allow_sunday: boolean;
  allow_monday: boolean;
  allow_tuesday: boolean;
  allow_wednesday: boolean;
  allow_thursday: boolean;
  allow_friday: boolean;
  allow_saturday: boolean;
}): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await supabase.from("pooling_rules").upsert(data, { onConflict: "associate_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/scheduling");
  return { ok: true };
}

export async function upsertPoolingRules(rules: Array<{
  associate_id: string;
  allow_sunday: boolean;
  allow_monday: boolean;
  allow_tuesday: boolean;
  allow_wednesday: boolean;
  allow_thursday: boolean;
  allow_friday: boolean;
  allow_saturday: boolean;
}>): Promise<ActionResult> {
  if (!rules.length) return { ok: true };
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await supabase.from("pooling_rules").upsert(rules, { onConflict: "associate_id" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/scheduling");
  return { ok: true };
}

export async function upsertAssignment(data: {
  assignment_date: string;
  role: AssignmentRole;
  slot_type: ShiftType;
  associate_id: string | null;
}): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };

  if (!SLOT_TYPES.includes(data.slot_type)) {
    return { ok: false, error: "Invalid slot type." };
  }

  const wd = weekdayFromYmd(data.assignment_date);
  const desiredAssociate = data.slot_type === "Vacation" ? null : data.associate_id;

  if (desiredAssociate) {
    const { data: assoc, error: assocErr } = await supabase
      .from("associates")
      .select("shift_type, is_active")
      .eq("id", desiredAssociate)
      .maybeSingle();
    if (assocErr || !assoc) return { ok: false, error: assocErr?.message ?? "Associate not found." };
    if (!assoc.is_active) return { ok: false, error: "Associate is inactive." };

    const st = assoc.shift_type as ShiftType;
    if (data.role === "pooling") {
      const { data: rule } = await supabase.from("pooling_rules").select("*").eq("associate_id", desiredAssociate).maybeSingle();
      if (
        !canAssignPooling(
          { id: desiredAssociate, shift_type: st, is_active: true },
          rule ?? undefined,
          data.slot_type,
          wd
        )
      ) {
        return { ok: false, error: "Associate is not eligible for pooling on this day/slot." };
      }
    } else if (!canAssignShift(st, data.slot_type, wd)) {
      return { ok: false, error: "Associate is not eligible for this slot type/day." };
    }
  }

  const { error } = await supabase.from("monthly_assignments").upsert(
    {
      assignment_date: data.assignment_date,
      role: data.role,
      slot_type: data.slot_type,
      associate_id: desiredAssociate,
    },
    { onConflict: "assignment_date,role" }
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/scheduling");
  return { ok: true };
}

function shuffle<T>(arr: T[]) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickBalanced(candidates: { id: string }[], load: Map<string, number>) {
  if (!candidates.length) return null;
  const minLoad = Math.min(...candidates.map((c) => load.get(c.id) ?? 0));
  const lowest = candidates.filter((c) => (load.get(c.id) ?? 0) === minLoad);
  const picked = shuffle(lowest)[0];
  load.set(picked.id, (load.get(picked.id) ?? 0) + 1);
  return picked.id;
}

export async function autoAssignMonthly(
  ym: string,
  overwriteExisting: boolean
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };

  const { start, end } = monthBounds(ym);

  const [{ data: associates, error: assocErr }, { data: rules, error: ruleErr }, { data: existing, error: existingErr }] =
    await Promise.all([
      supabase.from("associates").select("id, name, shift_type, is_active").eq("is_active", true),
      supabase
        .from("pooling_rules")
        .select(
          "associate_id, allow_sunday, allow_monday, allow_tuesday, allow_wednesday, allow_thursday, allow_friday, allow_saturday"
        ),
      supabase.from("monthly_assignments").select("id").gte("assignment_date", start).lte("assignment_date", end).limit(1),
    ]);

  if (assocErr || ruleErr || existingErr) {
    return { ok: false, error: assocErr?.message ?? ruleErr?.message ?? existingErr?.message ?? "Failed to load data." };
  }

  if ((existing?.length ?? 0) > 0 && !overwriteExisting) {
    return { ok: false, error: "Monthly schedule already exists for that month. Confirm overwrite to regenerate." };
  }

  const active = (associates ?? []).filter((a) => a.shift_type !== "Vacation");
  if (active.length === 0) {
    return { ok: false, error: "Add at least one active associate who is not on Vacation." };
  }

  if (overwriteExisting || (existing?.length ?? 0) > 0) {
    const { error: delErr } = await supabase
      .from("monthly_assignments")
      .delete()
      .gte("assignment_date", start)
      .lte("assignment_date", end);
    if (delErr) return { ok: false, error: delErr.message };
  }

  const [sy, sm] = ym.split("-").map(Number);
  const daysInMonth = new Date(sy, sm, 0).getDate();
  const days: { date: string; weekday: number; slotType: ShiftType }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${sy}-${String(sm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = weekdayFromYmd(date);
    days.push({ date, weekday: wd, slotType: defaultSlotTypeForDate(date) });
  }

  const rulesByAssociate = new Map((rules ?? []).map((r) => [r.associate_id, r]));
  const mainLoad = new Map<string, number>();
  const poolingLoad = new Map<string, number>();
  const backupLoad = new Map<string, number>();

  const rows: {
    assignment_date: string;
    role: AssignmentRole;
    slot_type: ShiftType;
    associate_id: string | null;
  }[] = [];

  // Weekend fallback: any associate of the correct shift type for the day
  // ignoring day flags — used only when day-flag-aware tiers yield no candidates.
  const weekendFallback = (weekday: number) =>
    active.filter((a) => {
      if (weekday === 0) return a.shift_type === "FHD";
      if (weekday === 6) return a.shift_type === "BHD";
      return false;
    });

  for (const day of days) {
    const isEligibleForDay = (a: typeof active[0]) =>
      canAssignDay(
        { id: a.id, shift_type: a.shift_type as ShiftType, is_active: true },
        rulesByAssociate.get(a.id),
        day.slotType,
        day.weekday
      );

    let eligibleMain = active.filter(isEligibleForDay);
    // Weekend Tier 4 for MAIN: fall back to any eligible FHD (Sun) or BHD (Sat)
    if (!eligibleMain.length && (day.weekday === 0 || day.weekday === 6)) {
      eligibleMain = weekendFallback(day.weekday);
    }
    const mainId = pickBalanced(eligibleMain, mainLoad);

    const eligiblePooling = active.filter((a) => {
      if (a.id === mainId) return false;
      const rule = rulesByAssociate.get(a.id);
      return canAssignPooling(
        { id: a.id, shift_type: a.shift_type as ShiftType, is_active: true },
        rule,
        day.slotType,
        day.weekday
      );
    });
    const poolingId = pickBalanced(eligiblePooling, poolingLoad);

    // Tier 1: exclude both main and pooling (ideal)
    let eligibleBackup = active.filter((a) => a.id !== mainId && a.id !== poolingId && isEligibleForDay(a));
    // Tier 2: if no one left, allow reusing the pooling associate
    if (!eligibleBackup.length) {
      eligibleBackup = active.filter((a) => a.id !== mainId && isEligibleForDay(a));
    }
    // Tier 3: allow Part Time to be used twice (any eligible, including main)
    if (!eligibleBackup.length) {
      eligibleBackup = active.filter(isEligibleForDay);
    }
    // Tier 4 (weekends only): ignore day flags — any FHD (Sunday) or BHD (Saturday)
    if (!eligibleBackup.length && (day.weekday === 0 || day.weekday === 6)) {
      eligibleBackup = weekendFallback(day.weekday);
    }
    const backupId = pickBalanced(eligibleBackup, backupLoad);

    rows.push({ assignment_date: day.date, role: "main", slot_type: day.slotType, associate_id: mainId });
    rows.push({ assignment_date: day.date, role: "pooling", slot_type: day.slotType, associate_id: poolingId });
    rows.push({ assignment_date: day.date, role: "backup", slot_type: day.slotType, associate_id: backupId });
  }

  const { error: upsertErr } = await supabase.from("monthly_assignments").upsert(rows, { onConflict: "assignment_date,role" });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidatePath("/scheduling");
  return { ok: true, created: rows.length };
}

/**
 * Creates missing pooling_rules rows for associates (safe if rules already exist).
 * NOTE: Do NOT call revalidatePath here — this function is invoked during page
 * render and Next.js 15 forbids revalidatePath inside renders.
 */
export async function ensurePoolingRulesForAssociates(): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { data: associates, error } = await supabase.from("associates").select("id");
  if (error) return { ok: false, error: error.message };
  const { data: rules } = await supabase.from("pooling_rules").select("associate_id");
  const have = new Set((rules ?? []).map((r) => r.associate_id));
  const missing = (associates ?? []).filter((a) => !have.has(a.id)).map((a) => ({ associate_id: a.id }));
  if (missing.length) {
    const { error: insErr } = await supabase.from("pooling_rules").insert(missing);
    if (insErr) return { ok: false, error: insErr.message };
  }
  return { ok: true };
}
