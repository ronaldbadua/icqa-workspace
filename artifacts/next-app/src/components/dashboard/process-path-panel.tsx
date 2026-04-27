"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProcessItem, deleteProcessItem, updateProcessItem } from "@/app/actions/process-path";
import type { ProcessRow } from "@/lib/data/queries";
import type { ProcessStage } from "@/lib/supabase/database.types";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel } from "@/components/dashboard/status-pill";

const stages: { id: ProcessStage; label: string; description: string }[] = [
  { id: "pending", label: "Pending", description: "Not started" },
  { id: "in_progress", label: "In progress", description: "Active" },
  { id: "done", label: "Done", description: "Completed" },
];

function stageClass(s: ProcessStage) {
  if (s === "done") return "border-emerald-200 bg-emerald-50/50";
  if (s === "in_progress") return "border-amber-200 bg-amber-50/50";
  return "border-slate-200 bg-slate-50/50";
}

export function ProcessPathPanel({
  items,
  hasSupabase,
  queryError,
}: {
  items: ProcessRow[];
  hasSupabase: boolean;
  queryError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProcessRow | null>(null);

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hasSupabase) {
      setError("Configure Supabase to create items.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "");
    const detail = String(fd.get("detail") || "");
    const stage = String(fd.get("stage") || "pending") as ProcessStage;
    setError(null);
    startTransition(async () => {
      const res = await createProcessItem({ title, detail, stage });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      (e.target as HTMLFormElement).reset();
      router.refresh();
    });
  };

  const onUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    if (!hasSupabase) {
      setError("Configure Supabase to update items.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") || "");
    const detail = String(fd.get("detail") || "");
    const stage = String(fd.get("stage") || "pending") as ProcessStage;
    setError(null);
    startTransition(async () => {
      const res = await updateProcessItem(editing.id, { title, detail, stage });
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
      setError("Configure Supabase to delete items.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteProcessItem(id);
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

      <div className="grid gap-4 lg:grid-cols-3">
        {stages.map((col) => {
          const list = items.filter((i) => i.stage === col.id);
          return (
            <div key={col.id} className="min-w-0">
              <div className="mb-2">
                <p className="text-sm font-bold text-slate-900">{col.label}</p>
                <p className="text-xs text-slate-500">{col.description}</p>
              </div>
              <div className="space-y-2">
                {list.length === 0 ? (
                  <p className="text-sm text-slate-500">No items</p>
                ) : (
                  list.map((it) => (
                    <div
                      key={it.id}
                      className={[
                        "rounded-xl border p-3 shadow-sm",
                        stageClass(it.stage),
                      ].join(" ")}
                    >
                      <p className="text-sm font-semibold text-slate-900">{it.title}</p>
                      {it.detail ? <p className="mt-1 text-sm text-slate-600">{it.detail}</p> : null}
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          className="text-sm font-medium text-sky-700 hover:underline"
                          onClick={() => setEditing(it)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-sm font-medium text-rose-600 hover:underline"
                          onClick={() => onDelete(it.id)}
                          disabled={pending}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900">Add process item</h3>
          <form onSubmit={onCreate} className="mt-3 space-y-3">
            <div>
              <FormLabel>Title</FormLabel>
              <input name="title" required className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </div>
            <div>
              <FormLabel>Detail</FormLabel>
              <textarea name="detail" rows={3} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
            </div>
            <div>
              <FormLabel>Stage</FormLabel>
              <select name="stage" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" defaultValue="pending">
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                disabled={pending}
              >
                Add
              </button>
            </div>
          </form>
        </div>

        {editing ? (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900">Edit process item</h3>
            <form key={editing.id} onSubmit={onUpdate} className="mt-3 space-y-3">
              <div>
                <FormLabel>Title</FormLabel>
                <input name="title" required className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" defaultValue={editing.title} />
              </div>
              <div>
                <FormLabel>Detail</FormLabel>
                <textarea name="detail" rows={3} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" defaultValue={editing.detail} />
              </div>
              <div>
                <FormLabel>Stage</FormLabel>
                <select name="stage" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" defaultValue={editing.stage}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                  disabled={pending}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
