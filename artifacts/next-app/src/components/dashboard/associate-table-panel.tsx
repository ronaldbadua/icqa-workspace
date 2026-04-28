"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveAssociatePScores,
  updateAssociateNames,
  type AssociatePScore,
} from "@/app/actions/associate-table";

type Associate = { id: string; name: string };

const SETUP_SQL = `CREATE TABLE IF NOT EXISTS associate_p_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  associate_id UUID NOT NULL UNIQUE REFERENCES associates(id) ON DELETE CASCADE,
  p1 TEXT NOT NULL DEFAULT '',
  p2 TEXT NOT NULL DEFAULT '',
  p3 TEXT NOT NULL DEFAULT '',
  login TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE associate_p_scores ADD COLUMN IF NOT EXISTS login TEXT NOT NULL DEFAULT '';
NOTIFY pgrst, 'reload schema';`;

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

  // ── Controlled state for names and logins ─────────────────────────────
  const [names, setNames] = useState<Record<string, string>>(
    () => Object.fromEntries(displayAssociates.map((a) => [a.id, a.name]))
  );
  const [logins, setLogins] = useState<Record<string, string>>(
    () => Object.fromEntries(displayAssociates.map((a) => [a.id, scoreMap.get(a.id)?.login ?? ""]))
  );

  // Track which names have been edited so we only send changed rows
  const originalNames = Object.fromEntries(displayAssociates.map((a) => [a.id, a.name]));

  const handleSave = () => {
    if (!hasSupabase) { setError("Configure Supabase to save."); return; }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      // 1. Save logins + p-scores
      const scoreRows: AssociatePScore[] = displayAssociates.map((a) => ({
        associate_id: a.id,
        p1: scoreMap.get(a.id)?.p1 ?? "",
        p2: scoreMap.get(a.id)?.p2 ?? "",
        p3: scoreMap.get(a.id)?.p3 ?? "",
        login: logins[a.id] ?? "",
      }));
      const loginRes = await saveAssociatePScores(scoreRows);
      if (!loginRes.ok) { setError(loginRes.error); return; }

      // 2. Save changed names
      const nameUpdates = displayAssociates
        .filter((a) => (names[a.id] ?? "").trim() && names[a.id] !== originalNames[a.id])
        .map((a) => ({ id: a.id, name: names[a.id] }));

      if (nameUpdates.length > 0) {
        const nameRes = await updateAssociateNames(nameUpdates);
        if (!nameRes.ok) { setError(nameRes.error); return; }
      }

      setSuccess("All changes saved to Supabase.");
      setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    });
  };

  const isSchemaError =
    queryError?.includes("schema cache") || queryError?.includes("associate_p_scores");

  return (
    <div className="space-y-4">
      {!hasSupabase && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Configure Supabase to enable saving.
        </div>
      )}

      {isSchemaError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold mb-1">Database setup required</p>
          <p className="mb-2">
            Run the SQL below in your <strong>Supabase → SQL Editor</strong>, then refresh this page:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-amber-100 px-4 py-3 font-mono text-xs leading-relaxed text-amber-900">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Associate Login</h3>
            <p className="text-xs text-slate-500">
              Edit names and login credentials — click Save to sync to Supabase.
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
            {error && (
              <span className="text-xs font-medium text-rose-700">{error}</span>
            )}
            <button
              type="button"
              disabled={pending || !hasSupabase}
              onClick={handleSave}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 active:scale-95 disabled:opacity-50 transition-all"
            >
              {pending ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Saving…
                </span>
              ) : "Save"}
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 w-1/2">Associates Name</th>
                <th className="px-4 py-3 w-1/2">Associates Log In</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayAssociates.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center text-slate-400">
                    No associates found. Add associates in the Scheduling page first.
                  </td>
                </tr>
              ) : (
                displayAssociates.map((a) => {
                  const isDirtyName = names[a.id] !== originalNames[a.id];
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Editable name */}
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={names[a.id] ?? ""}
                          onChange={(e) =>
                            setNames((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          placeholder="Associate name"
                          className={`w-full rounded border px-2 py-1.5 text-sm font-medium text-slate-800 transition focus:outline-none focus:ring-2 focus:ring-sky-400/40 ${
                            isDirtyName
                              ? "border-amber-400 bg-amber-50 focus:border-amber-500"
                              : "border-slate-200 bg-white focus:border-sky-400"
                          }`}
                        />
                      </td>
                      {/* Editable login */}
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={logins[a.id] ?? ""}
                          onChange={(e) =>
                            setLogins((prev) => ({ ...prev, [a.id]: e.target.value }))
                          }
                          placeholder="—"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer hint */}
        {displayAssociates.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-400">
            {displayAssociates.length} associate{displayAssociates.length !== 1 ? "s" : ""} shown · Edited name fields are highlighted in amber · Click Save to sync all changes
          </div>
        )}
      </div>
    </div>
  );
}
