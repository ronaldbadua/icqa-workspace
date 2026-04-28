"use client";

import { useState, useTransition, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createDatabaseEntryAction,
  deleteDatabaseEntryAction,
  updateDatabaseEntryAction,
  importFromDocxAction,
} from "@/app/actions/database";
import type { DatabaseEntryRow } from "@/lib/data/queries";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel } from "@/components/dashboard/status-pill";

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

CREATE POLICY IF NOT EXISTS allow_all_authenticated ON public.database_entries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS allow_service_role ON public.database_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);`;

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-slate-900">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function formatDataPreview(data: unknown) {
  try { return JSON.stringify(data, null, 2); } catch { return String(data); }
}

function matchesSearch(row: DatabaseEntryRow, q: string) {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  if (row.label.toLowerCase().includes(lower)) return true;
  if (row.notes && row.notes.toLowerCase().includes(lower)) return true;
  if (row.data && JSON.stringify(row.data).toLowerCase().includes(lower)) return true;
  return false;
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
  const [editing, setEditing] = useState<DatabaseEntryRow | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isTableMissing = queryError?.toLowerCase().includes("schema cache") ||
    queryError?.toLowerCase().includes("does not exist") ||
    queryError?.toLowerCase().includes("database_entries");

  const filtered = useMemo(
    () => entries.filter((r) => matchesSearch(r, search)),
    [entries, search]
  );

  const copySQL = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hasSupabase) { setError("Configure Supabase to create records."); return; }
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await createDatabaseEntryAction({
        label: String(fd.get("label") || ""),
        notes: String(fd.get("notes") || ""),
        data: String(fd.get("data") || ""),
      });
      if (!res.ok) { setError(res.error); return; }
      (e.target as HTMLFormElement).reset();
      const dataField = (e.target as HTMLFormElement).elements.namedItem("data") as HTMLTextAreaElement;
      if (dataField) dataField.value = "{}";
      router.refresh();
    });
  };

  const onUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing || !hasSupabase) return;
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const res = await updateDatabaseEntryAction(editing.id, {
        label: String(fd.get("label") || ""),
        notes: String(fd.get("notes") || ""),
        data: String(fd.get("data") || ""),
      });
      if (!res.ok) { setError(res.error); return; }
      setEditing(null);
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!hasSupabase) { setError("Configure Supabase to delete records."); return; }
    setError(null);
    startTransition(async () => {
      const res = await deleteDatabaseEntryAction(id);
      if (!res.ok) { setError(res.error); return; }
      if (editing?.id === id) setEditing(null);
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
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Search, add, or import records into your Supabase database.{" "}
        <span className="text-slate-400">REST: <code className="rounded bg-slate-100 px-1 text-xs">/api/database/entries</code></span>
      </p>

      {!hasSupabase ? <ConfigBanner /> : null}

      {isTableMissing && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 font-semibold text-amber-900">Database table setup required</p>
          <p className="mb-3 text-sm text-amber-800">
            The <code className="rounded bg-amber-100 px-1 text-xs">database_entries</code> table does not exist yet in your Supabase project.
            Copy the SQL below and run it in your{" "}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline">
              Supabase SQL Editor
            </a>.
          </p>
          <pre className="mb-3 max-h-48 overflow-auto rounded-lg bg-amber-100 p-3 text-xs text-amber-900 whitespace-pre-wrap">
            {SETUP_SQL}
          </pre>
          <button
            type="button"
            onClick={copySQL}
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
      )}

      {queryError && !isTableMissing ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {queryError}
        </p>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {importMsg ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {importMsg}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, section, or content…"
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
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

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Records</h3>
            <p className="text-xs text-slate-500">
              {search ? `${filtered.length} of ${entries.length} match` : `${entries.length} total — most recently updated first`}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">
              {search ? `No records match "${search}".` : "No database records yet. Add one below or import a Word document."}
            </li>
          ) : (
            filtered.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">
                  {highlight(row.label, search)}
                </p>
                {row.notes ? (
                  <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">
                    {highlight(row.notes, search)}
                  </p>
                ) : null}
                {row.data && typeof row.data === "object" && !Array.isArray(row.data) && Object.keys(row.data).length > 0 ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                    {formatDataPreview(row.data)}
                  </pre>
                ) : null}
                <div className="mt-2 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="text-sm font-medium text-sky-700 hover:underline"
                    onClick={() => setEditing(row)}
                    disabled={pending}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-sm font-medium text-rose-600 hover:underline"
                    onClick={() => onDelete(row.id)}
                    disabled={pending}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Add record</h3>
          <form onSubmit={onCreate} className="mt-3 space-y-3">
            <div>
              <FormLabel>Label / Title</FormLabel>
              <input
                name="label"
                required
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Display name or section heading"
              />
            </div>
            <div>
              <FormLabel>Content / Notes</FormLabel>
              <textarea
                name="notes"
                rows={4}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Paste text, instructions, or notes here…"
              />
            </div>
            <div>
              <FormLabel>Extra data (JSON)</FormLabel>
              <textarea
                name="data"
                rows={2}
                defaultValue="{}"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 font-mono text-xs"
                placeholder="{}"
              />
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                disabled={pending}
              >
                {pending ? "Saving…" : "Add record"}
              </button>
            </div>
          </form>
        </div>

        {editing ? (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Edit record</h3>
            <form key={editing.id} onSubmit={onUpdate} className="mt-3 space-y-3">
              <div>
                <FormLabel>Label / Title</FormLabel>
                <input
                  name="label"
                  required
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  defaultValue={editing.label}
                />
              </div>
              <div>
                <FormLabel>Content / Notes</FormLabel>
                <textarea
                  name="notes"
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  defaultValue={editing.notes}
                />
              </div>
              <div>
                <FormLabel>Extra data (JSON)</FormLabel>
                <textarea
                  name="data"
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 font-mono text-xs"
                  defaultValue={formatDataPreview(editing.data)}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  onClick={() => setEditing(null)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="hidden overflow-hidden rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 p-4 lg:block">
            <p className="text-sm text-slate-500">Select a record to edit, or add a new one on the left.</p>
          </div>
        )}
      </div>
    </div>
  );
}
