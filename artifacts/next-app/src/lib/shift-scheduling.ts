import type { AssignmentRole, ShiftType } from "@/lib/supabase/database.types";

/** All slot types shown in scheduling dropdowns. */
export const SLOT_TYPES: ShiftType[] = ["FHD", "BHD", "Part Time", "Vacation"];

export type AssociateLike = { id: string; shift_type: ShiftType; is_active: boolean; name?: string };

export type PoolingRuleLike = {
  associate_id: string;
  allow_sunday: boolean;
  allow_monday: boolean;
  allow_tuesday: boolean;
  allow_wednesday: boolean;
  allow_thursday: boolean;
  allow_friday: boolean;
  allow_saturday: boolean;
};

const DAY_FLAGS: (keyof PoolingRuleLike)[] = [
  "allow_sunday",
  "allow_monday",
  "allow_tuesday",
  "allow_wednesday",
  "allow_thursday",
  "allow_friday",
  "allow_saturday",
];

/**
 * Default slot type for a calendar day (used before a row exists, and as auto-assign pattern).
 * Weekends → Part Time; weekdays alternate FHD/BHD by day-of-month.
 */
export function defaultSlotTypeForDate(ymd: string): ShiftType {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  if (wd === 0 || wd === 6) return "Part Time";
  return d % 2 === 0 ? "FHD" : "BHD";
}

export function weekdayFromYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Whether an associate's contract type can fill a slot on that weekday. */
export function canAssignShift(associateShift: ShiftType, slotType: ShiftType, weekday: number): boolean {
  if (slotType === "Vacation") return false;
  if (associateShift === "Vacation") return false;
  if (slotType === "Part Time") {
    return associateShift === "Part Time" && (weekday === 0 || weekday === 6);
  }
  return associateShift === slotType;
}

/** Pooling eligibility: active associate, matching shift type, and day availability flag. */
export function canAssignPooling(
  associate: AssociateLike,
  rule: PoolingRuleLike | undefined,
  slotType: ShiftType,
  weekday: number
): boolean {
  if (!associate.is_active) return false;
  if (!canAssignShift(associate.shift_type, slotType, weekday)) return false;
  if (!rule) return false;
  return !!rule[DAY_FLAGS[weekday]];
}

/**
 * Full day-eligibility for auto-assign (shift contract + per-day availability flag).
 * Weekdays: shift_type must match slotType AND the day must be enabled.
 * Weekends: day must be enabled; FHD can cover Sunday, BHD can cover Saturday, PT covers both.
 */
export function canAssignDay(
  associate: AssociateLike,
  rule: PoolingRuleLike | undefined,
  slotType: ShiftType,
  weekday: number
): boolean {
  if (!associate.is_active) return false;
  if (slotType === "Vacation" || associate.shift_type === "Vacation") return false;
  if (!rule) return false;

  const dayFlag = rule[DAY_FLAGS[weekday]];
  if (!dayFlag) return false;

  if (slotType === "Part Time") {
    if (associate.shift_type === "Part Time") return true;
    if (weekday === 0) return associate.shift_type === "FHD";
    if (weekday === 6) return associate.shift_type === "BHD";
    return false;
  }

  return associate.shift_type === slotType;
}

export function labelForAssociate(a: AssociateLike | undefined, name: string) {
  if (!a) return "";
  return `${name} (${a.shift_type})`;
}

export function assignmentKey(date: string, role: AssignmentRole) {
  return `${date}::${role}`;
}
