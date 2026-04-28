"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDatabaseEntryAction,
  deleteDatabaseEntryAction,
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
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((row) => {
      const label = row.label.toLowerCase();
      const notes = row.notes.toLowerCase();
      const data = formatDataPreview(row.data).toLowerCase();
      return label.includes(q) || notes.includes(q) || data.includes(q);
    });
  }, [entries, searchQuery]);

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

  return (
    <div>
      <p className="mb-4 text-sm text-slate-600">
        Use labels and notes for now; the <span className="font-medium">data</span> field stores JSON for future
        fields and automations. REST: <code className="rounded bg-slate-100 px-1 text-xs">/api/database/entries</code>
        .
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

      <div className="mb-6 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">Records</h3>
          <p className="text-xs text-slate-500">Most recently updated first. Search matches label, notes, and JSON data.</p>
          <div className="mt-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              placeholder="Type a query (example: audit, section 3, compliance)"
              aria-label="Search database records"
            />
            <p className="mt-1 text-xs text-slate-500">
              {searchQuery.trim()
                ? `Showing ${filteredEntries.length} of ${entries.length} records.`
                : `Showing all ${entries.length} records.`}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-slate-100">
          {entries.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">No database records yet. Add one below.</li>
          ) : filteredEntries.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">No records match your query. Try a different keyword.</li>
          ) : (
            filteredEntries.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                {row.notes ? <p className="mt-1 text-sm text-slate-600">{row.notes}</p> : null}
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
