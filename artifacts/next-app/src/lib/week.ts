export function getMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const day = c.getDay();
  const diff = (day + 6) % 7;
  c.setDate(c.getDate() - diff);
  return c;
}

export function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function toYm(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Server-safe current month `YYYY-MM` (do not define this inside `"use client"` modules). */
export function defaultYmParam() {
  return toYm(new Date());
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function parseYmd(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function parseYm(s: string) {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1, 0, 0, 0, 0);
}

export function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 0, 0, 0, 0);
}

export function monthBounds(ym: string) {
  const start = parseYm(ym);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 0, 0, 0, 0);
  return { start: toYmd(start), end: toYmd(end) };
}

export function monthDays(ym: string) {
  const start = parseYm(ym);
  const endDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  return Array.from({ length: endDay }, (_, idx) => {
    const date = new Date(start.getFullYear(), start.getMonth(), idx + 1);
    return { date: toYmd(date), weekday: date.getDay(), label: date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" }) };
  });
}
