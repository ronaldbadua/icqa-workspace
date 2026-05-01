"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveAssociatePScores, type AssociatePScore } from "@/app/actions/associate-table";

type Associate = { id: string };

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

  const [logins, setLogins] = useState<Record<string, string>>(() =>
    Object.fromEntries(displayAssociates.map((a) => [a.id, scoreMap.get(a.id)?.login ?? ""]))
  );

  useEffect(() => {
    const map = new Map(scores.map((s) => [s.associate_id, s]));
    const list = associates.slice(0, 15);
    setLogins(Object.fromEntries(list.map((a) => [a.id, map.get(a.id)?.login ?? ""])));
  }, [associates, scores]);

  const handleSave = () => {
    if (!hasSupabase) {
      setError("Configure Supabase to save.");
      return;
    }
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const scoreRows: AssociatePScore[] = displayAssociates.map((a) => ({
        associate_id: a.id,
        p1: scoreMap.get(a.id)?.p1 ?? "",
        p2: scoreMap.get(a.id)?.p2 ?? "",
        p3: scoreMap.get(a.id)?.p3 ?? "",
        login: logins[a.id] ?? "",
      }));
      const loginRes = await saveAssociatePScores(scoreRows);
      if (!loginRes.ok) {
        setError(loginRes.error);
        return;
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
          <p className="mb-1 font-semibold">Database setup required</p>
          <p className="mb-2">
            Run the SQL below in your <strong>Supabase → SQL Editor</strong>, then refresh this page:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-amber-100 px-4 py-3 font-mono text-xs leading-relaxed text-amber-900">
            {SETUP_SQL}
          </pre>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Associate Login</h3>
            <p className="text-xs text-slate-500">Edit login credentials — click Save to sync to Supabase.</p>
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
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-sky-700 active:scale-95 disabled:opacity-50"
            >
              {pending ? (
                <span className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Saving…
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Associate Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayAssociates.length === 0 ? (
                <tr>
                  <td colSpan={1} className="px-4 py-6 text-center text-slate-400">
                    No associates found. Add associates in the Scheduling page first.
                  </td>
                </tr>
              ) : (
                displayAssociates.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-slate-50/50">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={logins[a.id] ?? ""}
                        onChange={(e) => setLogins((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="—"
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {displayAssociates.length > 0 && (
          <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-400">
            {displayAssociates.length} associate{displayAssociates.length !== 1 ? "s" : ""} shown · Click Save to sync
            changes
          </div>
        )}
      </div>
    </div>
  );
}
