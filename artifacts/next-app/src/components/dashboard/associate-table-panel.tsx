"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveAssociatePScores,
  type AssociatePScore,
} from "@/app/actions/associate-table";

type Associate = { id: string; name: string };

const BAND_OPTIONS = [
  "Front Half",
  "Back Half",
  "Donut Shift",
  "Part-Time Shift",
  "On Leave",
] as const;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const SETUP_SQL = `-- Run in Supabase SQL Editor then refresh
ALTER TABLE associate_p_scores ADD COLUMN IF NOT EXISTS band TEXT NOT NULL DEFAULT '';
ALTER TABLE associate_p_scores ADD COLUMN IF NOT EXISTS shift_days TEXT NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';`;

function parseDays(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(raw.split(",").map((d) => d.trim()).filter(Boolean));
}

function serializeDays(days: Set<string>): string {
  return DAYS.filter((d) => days.has(d)).join(",");
}

export function AssociateTablePanel({
  associates,
  scores,
  hasSupabase,
  queryError,
}: {
  associates: Associate[];
  scores: AssociatePScore[];
  hasSupabase: boolean;
  queryError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const scoreMap = new Map(scores.map((s) => [s.associate_id, s]));
  const displayAssociates = associates.slice(0, 15);

  const [logins, setLogins] = useState<Record<string, string>>(
    () => Object.fromEntries(displayAssociates.map((a) => [a.id, scoreMap.get(a.id)?.login ?? ""]))
  );
  const [bands, setBands] = useState<Record<string, string>>(
    () => Object.fromEntries(displayAssociates.map((a) => [a.id, scoreMap.get(a.id)?.band ?? ""]))
  );
  const [shiftDays, setShiftDays] = useState<Record<string, Set<string>>>(
    () => Object.fromEntries(displayAssociates.map((a) => [a.id, parseDays(scoreMap.get(a.id)?.shift_days)]))
  );

  const toggleDay = (associateId: string, day: string) => {
    setShiftDays((prev) => {
      const current = new Set(prev[associateId] ?? []);
      if (current.has(day)) current.delete(day);
      else current.add(day);
      return { ...prev, [associateId]: current };
    });
  };

  const handleSave = () => {
    if (!hasSupabase) { setError("Configure Supabase to save."); return; }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const scoreRows: AssociatePScore[] = displayAssociates.map((a) => ({
        associate_id: a.id,
        p1: scoreMap.get(a.id)?.p1 ?? "",
        p2: scoreMap.get(a.id)?.p2 ?? "",
        p3: scoreMap.get(a.id)?.p3 ?? "",
        login: logins[a.id] ?? "",
        band: bands[a.id] ?? "",
        shift_days: serializeDays(shiftDays[a.id] ?? new Set()),
      }));
      const res = await saveAssociatePScores(scoreRows);
      if (!res.ok) { setError(res.error); return; }

      setSuccess("Saved to Supabase.");
      setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    });
  };

  const isSchemaError =
    queryError?.includes("schema cache") ||
    queryError?.includes("associate_p_scores") ||
    queryError?.includes("band") ||
    queryError?.includes("shift_days");

  return (
    <div className="space-y-4">
      {!hasSupabase && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Configure Supabase to enable saving.
        </div>
      )}

      {isSchemaError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold mb-1">Database column setup required</p>
          <p className="mb-2">
            Run the SQL below in your <strong>Supabase → SQL Editor</strong>, then refresh:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-amber-100 px-4 py-3 font-mono text-xs leading-relaxed text-amber-900">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Associate Login</h3>
            <p className="text-xs text-slate-500">
              Edit login, band, and shift days — click Save to sync to Supabase.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {success && (
              <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {success}
              </span>
            )}
            {error && <span className="text-xs font-medium text-rose-700">{error}</span>}
            <button
              type="button"
              disabled={pending || !hasSupabase}
              onClick={handleSave}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 active:scale-95 disabled:opacity-50 transition-all"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 w-8">#</th>
                <th className="px-4 py-3 min-w-[140px]">Associate Login</th>
                <th className="px-4 py-3 min-w-[160px]">Band</th>
                <th className="px-4 py-3 min-w-[280px]">Shift Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayAssociates.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No associates found. Add associates in the Scheduling page first.
                  </td>
                </tr>
              ) : (
                displayAssociates.map((a, i) => (
                  <tr key={a.id} className="hover:bg-slate-50/40 transition-colors">
                    {/* # */}
                    <td className="px-4 py-2.5 text-xs text-slate-400">{i + 1}</td>

                    {/* Login */}
                    <td className="px-4 py-2.5">
                      <input
                        type="text"
                        value={logins[a.id] ?? ""}
                        onChange={(e) =>
                          setLogins((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        placeholder="—"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                      />
                    </td>

                    {/* Band */}
                    <td className="px-4 py-2.5">
                      <select
                        value={bands[a.id] ?? ""}
                        onChange={(e) =>
                          setBands((prev) => ({ ...prev, [a.id]: e.target.value }))
                        }
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                      >
                        <option value="">— Select —</option>
                        {BAND_OPTIONS.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </td>

                    {/* Shift Days */}
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((day) => {
                          const checked = shiftDays[a.id]?.has(day) ?? false;
                          return (
                            <label
                              key={day}
                              className={[
                                "flex cursor-pointer select-none flex-col items-center gap-0.5 rounded-md border px-2 py-1 text-xs font-semibold transition",
                                checked
                                  ? "border-sky-500 bg-sky-50 text-sky-700"
                                  : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:text-slate-600",
                              ].join(" ")}
                            >
                              <input
                                type="checkbox"
                                className="sr-only"
                                checked={checked}
                                onChange={() => toggleDay(a.id, day)}
                              />
                              {day}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {displayAssociates.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-400">
            {displayAssociates.length} associate{displayAssociates.length !== 1 ? "s" : ""} · Changes are reactive · Click Save to persist
          </div>
        )}
      </div>
    </div>
  );
}
