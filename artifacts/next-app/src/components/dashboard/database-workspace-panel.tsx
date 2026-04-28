"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  deleteDatabaseEntryAction,
  importFromDocxAction,
} from "@/app/actions/database";
import type { DatabaseEntryRow } from "@/lib/data/queries";
import { ConfigBanner } from "@/components/dashboard/config-banner";

const SETUP_SQL = `-- Run this in your Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.database_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS database_entries_updated_at ON public.database_entries;
CREATE TRIGGER database_entries_updated_at
  BEFORE UPDATE ON public.database_entries
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.database_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_authenticated ON public.database_entries;
CREATE POLICY allow_all_authenticated ON public.database_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_service_role ON public.database_entries;
CREATE POLICY allow_service_role ON public.database_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);`;

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function matchesSearch(row: DatabaseEntryRow, q: string) {
  if (!q.trim()) return false;
  const lower = q.toLowerCase();
  return (
    row.label.toLowerCase().includes(lower) ||
    (row.notes ?? "").toLowerCase().includes(lower) ||
    JSON.stringify(row.data ?? {}).toLowerCase().includes(lower)
  );
}

export function DatabaseWorkspacePanel({
  entries,
  hasSupabase,
  queryError,
}: {
  entries: DatabaseEntryRow[];
  hasSupabase: boolean;
  queryError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isTableMissing =
    queryError?.toLowerCase().includes("schema cache") ||
    queryError?.toLowerCase().includes("does not exist") ||
    queryError?.toLowerCase().includes("database_entries");

  const results = useMemo(
    () => entries.filter((r) => matchesSearch(r, search)),
    [entries, search]
  );

  const copySQL = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const onDelete = (id: string) => {
    if (!hasSupabase) { setError("Configure Supabase to delete records."); return; }
    setError(null);
    startTransition(async () => {
      const res = await deleteDatabaseEntryAction(id);
      if (!res.ok) { setError(res.error); return; }
      if (expandedId === id) setExpandedId(null);
      router.refresh();
    });
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!hasSupabase) { setError("Configure Supabase to import records."); return; }
    setImportMsg("Importing…");
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await importFromDocxAction(fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!res.ok) { setError(res.error); setImportMsg(null); return; }
      setImportMsg(`Imported ${res.count} record${res.count !== 1 ? "s" : ""} successfully.`);
      setTimeout(() => setImportMsg(null), 4000);
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {!hasSupabase && <ConfigBanner />}

      {isTableMissing && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1 font-semibold text-amber-900">Database table setup required</p>
          <p className="mb-3 text-sm text-amber-800">
            The <code className="rounded bg-amber-100 px-1 text-xs">database_entries</code> table
            does not exist yet. Copy the SQL below and run it in your{" "}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline">
              Supabase SQL Editor
            </a>.
          </p>
          <pre className="mb-3 max-h-48 overflow-auto rounded-lg bg-amber-100 p-3 text-xs text-amber-900 whitespace-pre-wrap">
            {SETUP_SQL}
          </pre>
          <button type="button" onClick={copySQL} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
      )}

      {queryError && !isTableMissing && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{queryError}</p>
      )}
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{error}</p>
      )}
      {importMsg && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{importMsg}</p>
      )}

      {/* Search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keywords, lines, or phrases…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✕</button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import Word (.docx)
          <input ref={fileRef} type="file" accept=".docx" className="sr-only" onChange={onImport} disabled={pending} />
        </label>
      </div>

      {/* Main Source Docs */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase">Main Source Docs</h3>
            <p className="text-xs text-slate-500 mt-0.5">{entries.length} record{entries.length !== 1 ? "s" : ""} — imported from Word documents</p>
          </div>
        </div>
        {entries.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-slate-500">No documents yet. Import a Word (.docx) file to populate this source.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-4 w-4 flex-shrink-0 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-medium text-slate-800 truncate">{row.label}</span>
                  </div>
                  <svg
                    className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expandedId === row.id ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedId === row.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {row.notes ? (
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{row.notes}</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No content.</p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        className="text-xs font-medium text-rose-500 hover:underline"
                        onClick={() => onDelete(row.id)}
                        disabled={pending}
                      >
                        Delete record
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-800 tracking-wide uppercase">Results</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {search.trim()
              ? results.length === 0
                ? `No matches for "${search}"`
                : `${results.length} match${results.length !== 1 ? "es" : ""} for "${search}"`
              : "Type a keyword above to see matches here"}
          </p>
        </div>

        {!search.trim() ? (
          <div className="px-6 py-10 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <p className="text-sm text-slate-400">Search results will appear here.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-slate-500">No records match <span className="font-medium">"{search}"</span>.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((row) => (
              <li key={row.id} className="px-4 py-4">
                <div className="flex items-start gap-2">
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {highlight(row.label, search)}
                    </p>
                    {row.notes ? (
                      <p className="mt-1 text-sm text-slate-600 whitespace-pre-line leading-relaxed">
                        {highlight(row.notes, search)}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
