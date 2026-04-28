"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteDatabaseEntryAction,
  importFromDocxAction,
  searchDatabaseEntriesAction,
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

-- Add source tracking columns (safe to run multiple times)
ALTER TABLE public.database_entries ADD COLUMN IF NOT EXISTS source_file text DEFAULT NULL;
ALTER TABLE public.database_entries ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT NULL;

ALTER TABLE public.database_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_authenticated ON public.database_entries;
CREATE POLICY allow_all_authenticated ON public.database_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_service_role ON public.database_entries;
CREATE POLICY allow_service_role ON public.database_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);`;

type SearchResult = { id: string; label: string; notes: string };

function highlight(text: string, query: string) {
  if (!query.trim() || !text) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900 font-medium">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
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
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [docsCollapsed, setDocsCollapsed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTableMissing =
    queryError?.toLowerCase().includes("schema cache") ||
    queryError?.toLowerCase().includes("does not exist") ||
    queryError?.toLowerCase().includes("database_entries");

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const res = await searchDatabaseEntriesAction(q);
    setSearching(false);
    setHasSearched(true);
    if (!res.ok) {
      setSearchError(res.error);
      setResults([]);
    } else {
      setResults(res.results);
    }
  }, []);

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setSearch(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setHasSearched(false);
      setSearchError(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
  };

  const clearSearch = () => {
    setSearch("");
    setResults([]);
    setHasSearched(false);
    setSearchError(null);
    setSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

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
      setResults((prev) => prev.filter((r) => r.id !== id));
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
          <pre className="mb-3 max-h-48 overflow-auto rounded-lg bg-amber-100 p-3 text-xs text-amber-900 whitespace-pre-wrap">{SETUP_SQL}</pre>
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

      {/* Search bar + Import */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          {searching ? (
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sky-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
          )}
          <input
            type="text"
            value={search}
            onChange={onSearchChange}
            placeholder="Search any keyword, line, or phrase from your documents…"
            className="w-full rounded-lg border-2 border-slate-300 bg-white pl-9 pr-8 py-2.5 text-sm shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          {search && (
            <button type="button" onClick={clearSearch} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-base leading-none">
              ✕
            </button>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-100 transition-colors">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Import Word (.docx)
          <input ref={fileRef} type="file" accept=".docx" className="sr-only" onChange={onImport} disabled={pending} />
        </label>
      </div>

      {/* Main Source Docs */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setDocsCollapsed((c) => !c)}
          className="flex w-full items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100 transition-colors"
        >
          <div>
            <h3 className="text-sm font-bold tracking-widest text-slate-700 uppercase">Main Source Docs</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {entries.length} record{entries.length !== 1 ? "s" : ""} — imported from Word documents
            </p>
          </div>
          <svg
            className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-200 ${docsCollapsed ? "-rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {!docsCollapsed && entries.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-slate-500">No source documents yet. Import a Word (.docx) file to get started.</p>
          </div>
        ) : !docsCollapsed ? (
          <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
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
                  <svg className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${expandedId === row.id ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedId === row.id && (
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    {row.notes ? (
                      <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{row.notes}</p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No additional content.</p>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button type="button" className="text-xs font-medium text-rose-500 hover:underline" onClick={() => onDelete(row.id)} disabled={pending}>
                        Delete record
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Results */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-bold tracking-widest text-slate-700 uppercase">Results</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {searching
              ? "Searching…"
              : search.trim() && hasSearched
              ? results.length === 0
                ? `No matches found for "${search}"`
                : `${results.length} match${results.length !== 1 ? "es" : ""} found for "${search}"`
              : "Type a keyword above — results from Main Source Docs will appear here"}
          </p>
        </div>

        {searchError && (
          <p className="px-4 py-3 text-sm text-rose-700">{searchError}</p>
        )}

        {!search.trim() ? (
          <div className="px-6 py-10 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <p className="text-sm text-slate-400">Search results will appear here.</p>
          </div>
        ) : searching ? (
          <div className="px-6 py-10 text-center">
            <svg className="mx-auto mb-3 h-6 w-6 text-sky-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="text-sm text-slate-400">Searching Supabase…</p>
          </div>
        ) : results.length === 0 && hasSearched ? (
          <div className="px-6 py-8 text-center">
            <p className="text-sm text-slate-500">No records match <span className="font-semibold">"{search}"</span> in any source document.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 max-h-[28rem] overflow-y-auto">
            {results.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/database/${row.id}?q=${encodeURIComponent(search)}`}
                  className="flex items-start gap-3 px-4 py-4 hover:bg-sky-50 transition-colors group"
                >
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500 group-hover:text-sky-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 group-hover:text-sky-700 transition-colors">
                      {highlight(row.label, search)}
                    </p>
                    {row.notes ? (
                      <p className="mt-1 text-sm text-slate-600 whitespace-pre-line leading-relaxed line-clamp-3">
                        {highlight(row.notes, search)}
                      </p>
                    ) : null}
                  </div>
                  <svg className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300 group-hover:text-sky-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
