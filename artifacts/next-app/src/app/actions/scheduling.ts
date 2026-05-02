"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentRole, ShiftType } from "@/lib/supabase/database.types";
import {
  canAssignPooling,
  canAssignShift,
  canAssignRole,
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

export async function updateAssociateRole(data: {
  id: string;
  is_afm: boolean;
  is_ps: boolean;
}): Promise<ActionResult> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("associates")
    .update({ is_afm: data.is_afm, is_ps: data.is_ps })
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
  role: "afm" | "afm_support" | "ps" = "afm"
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };

  const { start, end } = monthBounds(ym);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: associates, error: assocErr } = await (supabase as any)
    .from("associates")
    .select("id, name, shift_type, is_active, is_afm, is_ps")
    .eq("is_active", true);

  if (assocErr) return { ok: false, error: assocErr.message };

  // Exclude Vacation associates
  const active = (associates ?? []).filter(
    (a: { shift_type: string }) => a.shift_type !== "Vacation"
  );

  // Build the eligible pool for this role (AFM or PS flag must be set)
  const pool: { id: string; shift_type: ShiftType; is_active: boolean }[] = active.filter(
    (a: { is_afm?: boolean; is_ps?: boolean }) =>
      role === "ps" ? a.is_ps : a.is_afm
  );

  const label = role === "ps" ? "PS" : "AFM";
  if (pool.length === 0) {
    return {
      ok: false,
      error: `No active associates are marked as ${label}. Check the Associates List.`,
    };
  }

  // Delete only this role's assignments for the month, then regenerate
  const { error: delErr } = await supabase
    .from("monthly_assignments")
    .delete()
    .gte("assignment_date", start)
    .lte("assignment_date", end)
    .eq("role", role);
  if (delErr) return { ok: false, error: delErr.message };

  const [sy, sm] = ym.split("-").map(Number);
  const daysInMonth = new Date(sy, sm, 0).getDate();

  // Per-associate assignment count — used to keep rotation fair
  const load = new Map<string, number>(pool.map((a) => [a.id, 0]));

  const rows: {
    assignment_date: string;
    role: AssignmentRole;
    slot_type: ShiftType;
    associate_id: string;
  }[] = [];

  let lastPickedId: string | null = null;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${sy}-${String(sm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = weekdayFromYmd(date);
    const slotType = defaultSlotTypeForDate(date);

    // STRICT: only associates whose shift_type allows this weekday
    const eligible = pool.filter((a) => canAssignRole(a, wd));

    // If nobody is eligible for this day, skip — leave the cell blank
    if (eligible.length === 0) continue;

    // Prefer someone who was NOT assigned the previous calendar day (no back-to-back repeats)
    const preferred = eligible.filter((a) => a.id !== lastPickedId);
    const candidates = preferred.length > 0 ? preferred : eligible;

    const picked = pickBalanced(candidates, load);
    if (!picked) continue;

    lastPickedId = picked;
    rows.push({ assignment_date: date, role, slot_type: slotType, associate_id: picked });
  }

  if (rows.length === 0) {
    return { ok: false, error: `No eligible days found for ${label} pool this month.` };
  }

  const { error: upsertErr } = await supabase
    .from("monthly_assignments")
    .upsert(rows, { onConflict: "assignment_date,role" });
  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidatePath("/scheduling");
  return { ok: true, created: rows.length };
}

/**
 * Generates AFM and AFM Support assignments together in one coordinated pass.
 * Rule: on every day, the AFM Support pick must be a different person than the AFM pick.
 * Both rotations also obey the no-back-to-back-consecutive-day rule independently.
 */
export async function autoAssignAfmBoth(
  ym: string
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const supabase = createAdminSupabaseClient() ?? await createServerSupabaseClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };

  const { start, end } = monthBounds(ym);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: associates, error: assocErr } = await (supabase as any)
    .from("associates")
    .select("id, name, shift_type, is_active, is_afm")
    .eq("is_active", true);

  if (assocErr) return { ok: false, error: assocErr.message };

  const pool: { id: string; shift_type: ShiftType; is_active: boolean }[] = (associates ?? [])
    .filter((a: { shift_type: string; is_afm?: boolean }) =>
      a.shift_type !== "Vacation" && a.is_afm
    );

  if (pool.length === 0) {
    return { ok: false, error: "No active associates are marked as AFM. Check the Associates List." };
  }

  // Delete both AFM and AFM Support assignments for the month
  const { error: delErr } = await supabase
    .from("monthly_assignments")
    .delete()
    .gte("assignment_date", start)
    .lte("assignment_date", end)
    .in("role", ["afm", "afm_support"]);
  if (delErr) return { ok: false, error: delErr.message };

  const [sy, sm] = ym.split("-").map(Number);
  const daysInMonth = new Date(sy, sm, 0).getDate();

  // Separate load counters so each rotation stays independently fair
  const afmLoad = new Map<string, number>(pool.map((a) => [a.id, 0]));
  const supLoad = new Map<string, number>(pool.map((a) => [a.id, 0]));

  const rows: {
    assignment_date: string;
    role: AssignmentRole;
    slot_type: ShiftType;
    associate_id: string;
  }[] = [];

  let lastAfmId: string | null = null;
  let lastSupId: string | null = null;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${sy}-${String(sm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = weekdayFromYmd(date);
    const slotType = defaultSlotTypeForDate(date);

    const eligible = pool.filter((a) => canAssignRole(a, wd));
    if (eligible.length === 0) continue;

    // ── Pick AFM ──────────────────────────────────────────────────────────
    const afmPreferred = eligible.filter((a) => a.id !== lastAfmId);
    const afmCandidates = afmPreferred.length > 0 ? afmPreferred : eligible;
    const afmPicked = pickBalanced(afmCandidates, afmLoad);
    if (!afmPicked) continue;
    lastAfmId = afmPicked;
    rows.push({ assignment_date: date, role: "afm", slot_type: slotType, associate_id: afmPicked });

    // ── Pick AFM Support — NEVER the same person as AFM that day ─────────
    // Also prefer someone different from the previous calendar day (no back-to-back).
    const supEligible = eligible.filter((a) => a.id !== afmPicked);
    if (supEligible.length === 0) {
      // Only one person eligible this day — must reuse; skip support to leave blank
      lastSupId = null;
      continue;
    }
    const supPreferred = supEligible.filter((a) => a.id !== lastSupId);
    const supCandidates = supPreferred.length > 0 ? supPreferred : supEligible;
    const supPicked = pickBalanced(supCandidates, supLoad);
    if (!supPicked) continue;
    lastSupId = supPicked;
    rows.push({ assignment_date: date, role: "afm_support", slot_type: slotType, associate_id: supPicked });
  }

  if (rows.length === 0) {
    return { ok: false, error: "No eligible days found for AFM pool this month." };
  }

  const { error: upsertErr } = await supabase
    .from("monthly_assignments")
    .upsert(rows, { onConflict: "assignment_date,role" });
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
