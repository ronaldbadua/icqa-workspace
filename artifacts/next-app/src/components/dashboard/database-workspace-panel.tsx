"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDatabaseEntryAction,
  deleteDatabaseEntryAction,
  importDocxChunksAction,
  updateDatabaseEntryAction,
} from "@/app/actions/database";
import type { DatabaseEntryRow } from "@/lib/data/queries";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel } from "@/components/dashboard/status-pill";

function formatDataPreview(data: unknown) {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

function getContentFromData(data: DatabaseEntryRow["data"]): string | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const c = (data as Record<string, unknown>).content;
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function getRowSearchableText(row: DatabaseEntryRow): string {
  const body = getContentFromData(row.data);
  if (body) {
    return `${row.label}\n${row.notes}\n${body}`;
  }
  return `${row.label}\n${row.notes}\n${formatDataPreview(row.data)}`;
}

function buildMatchSnippet(haystack: string, query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const lower = haystack.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx === -1) return null;
  const padBefore = 140;
  const padAfter = 260;
  const start = Math.max(0, idx - padBefore);
  const end = Math.min(haystack.length, idx + q.length + padAfter);
  let out = haystack.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) out = `…${out}`;
  if (end < haystack.length) out = `${out}…`;
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === q.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-200 px-0.5">
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
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<DatabaseEntryRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) => {
      const hay = getRowSearchableText(row).toLowerCase();
      return hay.includes(q);
    });
  }, [entries, searchQuery]);

  const snippetById = useMemo(() => {
    const q = searchQuery.trim();
    const map = new Map<string, string>();
    if (!q) return map;
    for (const row of filteredEntries) {
      const snippet = buildMatchSnippet(getRowSearchableText(row), q);
      map.set(row.id, snippet ?? (row.notes.slice(0, 280) || row.label));
    }
    return map;
  }, [filteredEntries, searchQuery]);

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hasSupabase) {
      setError("Configure Supabase to create records.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const label = String(fd.get("label") || "");
    const notes = String(fd.get("notes") || "");
    const dataRaw = String(fd.get("data") || "");
    setError(null);
    startTransition(async () => {
      const res = await createDatabaseEntryAction({ label, notes, data: dataRaw });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      (e.target as HTMLFormElement).reset();
      const dataField = (e.target as HTMLFormElement).elements.namedItem("data") as HTMLTextAreaElement;
      if (dataField) dataField.value = "{}";
      router.refresh();
    });
  };

  const onUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    if (!hasSupabase) {
      setError("Configure Supabase to update records.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const label = String(fd.get("label") || "");
    const notes = String(fd.get("notes") || "");
    const dataRaw = String(fd.get("data") || "");
    setError(null);
    startTransition(async () => {
      const res = await updateDatabaseEntryAction(editing.id, { label, notes, data: dataRaw });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    if (!hasSupabase) {
      setError("Configure Supabase to delete records.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteDatabaseEntryAction(id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (editing?.id === id) setEditing(null);
      router.refresh();
    });
  };

  const onImportDocx = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hasSupabase) {
      setError("Configure Supabase to import documents.");
      return;
    }
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    setImportMessage(null);
    startTransition(async () => {
      const res = await importDocxChunksAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setImportMessage(`Imported ${res.inserted} searchable chunk${res.inserted === 1 ? "" : "s"} from your Word file.`);
      form.reset();
      router.refresh();
    });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Each record has a <span className="font-medium">label</span>, optional <span className="font-medium">notes</span>
        , and a <span className="font-medium">data</span> JSON object. For Word imports, full text is stored in{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">data.content</code> so keyword search can surface it. REST:{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">/api/database/entries</code>. For image-heavy pages, use the{" "}
        <a
          className="font-medium text-sky-700 underline"
          href="https://github.com/ronaldbadua/docx-to-full-text"
          target="_blank"
          rel="noreferrer"
        >
          docx-to-full-text
        </a>{" "}
        CLI for OCR, then paste chunks manually if needed.
      </p>
      {!hasSupabase ? <ConfigBanner /> : null}
      {queryError && queryError !== "missing_config" ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {queryError}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {importMessage ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {importMessage}
        </p>
      ) : null}

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Import Word (.docx)</h3>
          <p className="mt-1 text-xs text-slate-500">
            Body text is extracted with Mammoth (same family as{" "}
            <a className="text-sky-700 underline" href="https://github.com/ronaldbadua/docx-to-full-text" target="_blank" rel="noreferrer">
              docx-to-full-text
            </a>
            ). One database record is created per chunk so search stays fast.
          </p>
          <form onSubmit={onImportDocx} className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label htmlFor="docx-import-file" className="mb-1 block text-xs font-medium text-slate-500">
                File
              </label>
              <input
                id="docx-import-file"
                name="file"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                required
                disabled={!hasSupabase || pending}
                className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800 hover:file:bg-sky-100"
              />
            </div>
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              disabled={!hasSupabase || pending}
            >
              {pending ? "Importing…" : "Import to database"}
            </button>
          </form>
        </div>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Document search</h3>
          <p className="text-xs text-slate-500">
            Type a keyword or phrase. Matching records show a highlighted excerpt; open “Show full text” for the whole chunk.
          </p>
          <div className="mt-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              placeholder="Search labels, notes, and imported document text…"
              aria-label="Search database records"
            />
            <p className="mt-1 text-xs text-slate-500">
              {searchQuery.trim()
                ? `${filteredEntries.length} match${filteredEntries.length === 1 ? "" : "es"} out of ${entries.length} records.`
                : `${entries.length} record${entries.length === 1 ? "" : "s"} loaded.`}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {entries.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">No database records yet. Import a .docx above or add a record below.</li>
          ) : filteredEntries.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">No records match your search. Try another keyword.</li>
          ) : (
            filteredEntries.map((row) => {
              const fullText = getContentFromData(row.data);
              const isOpen = Boolean(expanded[row.id]);
              const q = searchQuery.trim();
              const snippet = q ? snippetById.get(row.id) ?? "" : null;
              return (
                <li key={row.id} className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {q ? <HighlightText text={row.label} query={q} /> : row.label}
                  </p>
                  {q && snippet ? (
                    <p className="mt-2 rounded-md border border-amber-100 bg-amber-50/80 px-2 py-2 text-sm leading-relaxed text-slate-800">
                      <HighlightText text={snippet} query={q} />
                    </p>
                  ) : !q && row.notes ? (
                    <p className="mt-1 text-sm text-slate-600">{row.notes}</p>
                  ) : null}
                  {fullText && isOpen ? (
                    <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                      {q ? <HighlightText text={fullText} query={q} /> : fullText}
                    </pre>
                  ) : null}
                  {!fullText && row.data && typeof row.data === "object" && !Array.isArray(row.data) && Object.keys(row.data).length > 0 ? (
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-50 p-2 text-xs text-slate-700">
                      {formatDataPreview(row.data)}
                    </pre>
                  ) : null}
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    {fullText ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-slate-700 hover:underline"
                        onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                        disabled={pending}
                      >
                        {isOpen ? "Hide full text" : "Show full text"}
                      </button>
                    ) : null}
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
              );
            })
          )}
        </ul>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Add record</h3>
          <form onSubmit={onCreate} className="mt-3 space-y-3">
            <div>
              <FormLabel>Label</FormLabel>
              <input
                name="label"
                required
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Display name"
              />
            </div>
            <div>
              <FormLabel>Notes</FormLabel>
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Optional"
              />
            </div>
            <div>
              <FormLabel>Data (JSON object)</FormLabel>
              <textarea
                name="data"
                rows={4}
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
                <FormLabel>Label</FormLabel>
                <input
                  name="label"
                  required
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  defaultValue={editing.label}
                />
              </div>
              <div>
                <FormLabel>Notes</FormLabel>
                <textarea
                  name="notes"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                  defaultValue={editing.notes}
                />
              </div>
              <div>
                <FormLabel>Data (JSON object)</FormLabel>
                <textarea
                  name="data"
                  rows={4}
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
                  {pending ? "Saving…" : "Save"}
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
