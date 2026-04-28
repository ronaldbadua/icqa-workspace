import type { HourlyNoteStatus } from "@/lib/supabase/database.types";

export interface HourlySlot {
  hour: number;
  status: HourlyNoteStatus;
  content: string;
  author_name: string;
  manager_comment: string;
  hasPersistedRow: boolean;
  id: string | null;
}

export function toDateStringLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDateString(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function buildHourlySlots(
  dateStr: string,
  rows: {
    id: string;
    hour: number;
    status: HourlyNoteStatus;
    content: string;
    author_name: string;
    manager_comment: string;
  }[],
  rangeStart: number,
  rangeEnd: number
): HourlySlot[] {
  const byHour = new Map(
    rows.map((r) => [r.hour, { ...r, hasPersistedRow: true }])
  );
  const out: HourlySlot[] = [];
  for (let h = rangeStart; h <= rangeEnd; h++) {
    const row = byHour.get(h);
    if (row) {
      out.push({
        hour: h,
        status: row.status,
        content: row.content,
        author_name: row.author_name,
        manager_comment: row.manager_comment ?? "",
        hasPersistedRow: true,
        id: row.id,
      });
    } else {
      out.push({
        hour: h,
        status: "pending",
        content: "",
        author_name: "",
        manager_comment: "",
        hasPersistedRow: false,
        id: null,
      });
    }
  }
  return out;
}

export function summarizeHourlyStatus(slots: HourlySlot[]) {
  let resolved = 0;
  let pending = 0;
  let needsAttention = 0;
  let noActionNeeded = 0;
  let totalLogged = 0;

  for (const s of slots) {
    if (!s.hasPersistedRow) continue; // only count records actually saved in Supabase
    totalLogged += 1;
    switch (s.status) {
      case "resolved":
        resolved += 1;
        break;
      case "pending":
        pending += 1;
        break;
      case "needs_attention":
        needsAttention += 1;
        break;
      case "no_action_needed":
        noActionNeeded += 1;
        break;
    }
  }
  return { resolved, pending, needsAttention, noActionNeeded, totalLogged };
}
