"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAssociatePScores, type AssociatePScore } from "@/app/actions/associate-table";

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

  const handleSave = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const rows: AssociatePScore[] = displayAssociates.map((a) => ({
        associate_id: a.id,
        p1: scoreMap.get(a.id)?.p1 ?? "",
        p2: scoreMap.get(a.id)?.p2 ?? "",
        p3: scoreMap.get(a.id)?.p3 ?? "",
        login: (document.getElementById(`login-${a.id}`) as HTMLInputElement)?.value ?? scoreMap.get(a.id)?.login ?? "",
      }));
      const res = await saveAssociatePScores(rows);
      if (!res.ok) { setError(res.error); return; }
      setSuccess("Saved.");
      router.refresh();
    });
  };

  const isSchemaError = queryError?.includes("schema cache") || queryError?.includes("associate_p_scores");

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
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Associate Login</h3>
            <p className="text-xs text-slate-500">Login credentials per associate — max 15 associates shown.</p>
          </div>
          <div className="flex items-center gap-3">
            {success && <span className="text-xs text-emerald-700">{success}</span>}
            {error && <span className="text-xs text-rose-700">{error}</span>}
            <button
              type="button"
              disabled={pending || !hasSupabase}
              onClick={handleSave}
              className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Associates Name</th>
                <th className="px-4 py-3">Associates Log In</th>
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
                  const s = scoreMap.get(a.id);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{a.name}</td>
                      <td className="px-4 py-2.5">
                        <input
                          id={`login-${a.id}`}
                          type="text"
                          defaultValue={s?.login ?? ""}
                          placeholder="—"
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-sm focus:border-sky-400 focus:outline-none"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
