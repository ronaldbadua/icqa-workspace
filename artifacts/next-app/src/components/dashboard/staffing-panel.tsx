"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  createStaffingRecord,
  updateStaffingRecord,
  deleteStaffingRecord,
  type StaffingRecord,
  type StaffingInput,
} from "@/app/actions/staffing";

const SHIFT_TYPES = ["Day", "Night", "Overnight"] as const;
const ROLES = ["Counter", "Lead", "Manager", "Support"] as const;
const STATUSES = ["Active", "Called Out", "On Leave", "Training"] as const;

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800",
  "Called Out": "bg-rose-100 text-rose-800",
  "On Leave": "bg-amber-100 text-amber-800",
  Training: "bg-sky-100 text-sky-700",
};

const SETUP_SQL = `-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.staffing_records (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staffing_date date NOT NULL,
  associate_name text NOT NULL DEFAULT '', -- stores associate login (column name unchanged)
  shift_type text NOT NULL DEFAULT 'Day',
  role text NOT NULL DEFAULT 'Counter',
  status text NOT NULL DEFAULT 'Active',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_staffing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS staffing_records_updated_at ON public.staffing_records;
CREATE TRIGGER staffing_records_updated_at
  BEFORE UPDATE ON public.staffing_records
  FOR EACH ROW EXECUTE PROCEDURE public.set_staffing_updated_at();

ALTER TABLE public.staffing_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staffing_allow_all_authenticated ON public.staffing_records;
CREATE POLICY staffing_allow_all_authenticated ON public.staffing_records
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS staffing_allow_service_role ON public.staffing_records;
CREATE POLICY staffing_allow_service_role ON public.staffing_records
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';`;

const BLANK_INPUT = (): StaffingInput => ({
  staffing_date: "",
  associate_login: "",
  shift_type: "Day",
  role: "Counter",
  status: "Active",
  notes: "",
});

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"}`}>
      {status}
    </span>
  );
}

export function StaffingPanel({
  records,
  selectedDate,
  hasSupabase,
  queryError,
  isSchemaError,
}: {
  records: StaffingRecord[];
  selectedDate: string;
  hasSupabase: boolean;
  queryError: string | null;
  isSchemaError: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newInput, setNewInput] = useState<StaffingInput>(BLANK_INPUT());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<Partial<StaffingInput>>({});
  const [copied, setCopied] = useState(false);

  const active = records.filter((r) => r.status === "Active").length;
  const calledOut = records.filter((r) => r.status === "Called Out").length;
  const onLeave = records.filter((r) => r.status === "On Leave").length;
  const training = records.filter((r) => r.status === "Training").length;

  const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    router.push(`/staffing?date=${e.target.value}`);
  };

  const copySQL = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleAdd = useCallback(() => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await createStaffingRecord({ ...newInput, staffing_date: selectedDate });
      if (!res.ok) { setError(res.error); return; }
      setNewInput(BLANK_INPUT());
      setShowAdd(false);
      setSuccess("Record added.");
      setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    });
  }, [newInput, selectedDate, router]);

  const handleDelete = useCallback((id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await deleteStaffingRecord(id);
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  }, [router]);

  const handleEditSave = useCallback((id: string) => {
    setError(null);
    startTransition(async () => {
      const res = await updateStaffingRecord(id, editInput);
      if (!res.ok) { setError(res.error); return; }
      setEditingId(null);
      setEditInput({});
      setSuccess("Record updated.");
      setTimeout(() => setSuccess(null), 3000);
      router.refresh();
    });
  }, [editInput, router]);

  const startEdit = (r: StaffingRecord) => {
    setEditingId(r.id);
    setEditInput({
      associate_login: r.associate_login,
      shift_type: r.shift_type,
      role: r.role,
      status: r.status,
      notes: r.notes,
    });
  };

  return (
    <div className="space-y-5">
      {/* Schema setup banner */}
      {isSchemaError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-1 font-semibold text-amber-900">Database table setup required</p>
          <p className="mb-3 text-sm text-amber-800">
            The <code className="rounded bg-amber-100 px-1 text-xs">staffing_records</code> table doesn&apos;t exist yet.
            Copy the SQL below and run it in your{" "}
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline">Supabase SQL Editor</a>.
          </p>
          <pre className="mb-3 max-h-48 overflow-auto rounded-lg bg-amber-100 p-3 text-xs text-amber-900 whitespace-pre-wrap">{SETUP_SQL}</pre>
          <button type="button" onClick={copySQL} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700">
            {copied ? "Copied!" : "Copy SQL"}
          </button>
        </div>
      )}

      {!hasSupabase && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Supabase is not configured. Please add your environment variables.
        </p>
      )}
      {queryError && !isSchemaError && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{queryError}</p>
      )}
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
      )}
      {success && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p>
      )}

      {/* Date selector + Add button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-700">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={onDateChange}
            className="rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
        </div>
        <button
          type="button"
          onClick={() => { setShowAdd(true); setError(null); }}
          disabled={pending || !hasSupabase}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-50 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Associate
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Active", value: active, color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
          { label: "Called Out", value: calledOut, color: "bg-rose-50 border-rose-200 text-rose-700" },
          { label: "On Leave", value: onLeave, color: "bg-amber-50 border-amber-200 text-amber-700" },
          { label: "Training", value: training, color: "bg-sky-50 border-sky-200 text-sky-700" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`rounded-xl border-2 p-4 ${color}`}>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-xl border-2 border-sky-200 bg-sky-50 p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-sky-900">New Staffing Record</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Associate Login *</label>
              <input
                type="text"
                placeholder="Associate login"
                value={newInput.associate_login}
                onChange={(e) => setNewInput((p) => ({ ...p, associate_login: e.target.value }))}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Shift</label>
              <select
                value={newInput.shift_type}
                onChange={(e) => setNewInput((p) => ({ ...p, shift_type: e.target.value }))}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              >
                {SHIFT_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Role</label>
              <select
                value={newInput.role}
                onChange={(e) => setNewInput((p) => ({ ...p, role: e.target.value }))}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">Status</label>
              <select
                value={newInput.status}
                onChange={(e) => setNewInput((p) => ({ ...p, status: e.target.value }))}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              >
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-700">Notes</label>
              <input
                type="text"
                placeholder="Optional notes"
                value={newInput.notes}
                onChange={(e) => setNewInput((p) => ({ ...p, notes: e.target.value }))}
                className="w-full rounded-lg border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={handleAdd} disabled={pending || !newInput.associate_login.trim()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setNewInput(BLANK_INPUT()); }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Staffing table */}
      <div className="overflow-hidden rounded-xl border-2 border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-slate-700">
            Staffing — {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{records.length} associate{records.length !== 1 ? "s" : ""} logged</p>
        </div>

        {records.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-slate-500">No staffing records for this date.</p>
            <p className="mt-1 text-xs text-slate-400">Click &quot;Add Associate&quot; to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Associate Login</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Shift</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Notes</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    {editingId === r.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={editInput.associate_login ?? ""}
                            onChange={(e) => setEditInput((p) => ({ ...p, associate_login: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select value={editInput.shift_type ?? "Day"}
                            onChange={(e) => setEditInput((p) => ({ ...p, shift_type: e.target.value }))}
                            className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none">
                            {SHIFT_TYPES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editInput.role ?? "Counter"}
                            onChange={(e) => setEditInput((p) => ({ ...p, role: e.target.value }))}
                            className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none">
                            {ROLES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select value={editInput.status ?? "Active"}
                            onChange={(e) => setEditInput((p) => ({ ...p, status: e.target.value }))}
                            className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none">
                            {STATUSES.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="text" value={editInput.notes ?? ""}
                            onChange={(e) => setEditInput((p) => ({ ...p, notes: e.target.value }))}
                            className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none" />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button type="button" onClick={() => handleEditSave(r.id)} disabled={pending}
                            className="mr-2 text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50">
                            Save
                          </button>
                          <button type="button" onClick={() => { setEditingId(null); setEditInput({}); }}
                            className="text-xs font-semibold text-slate-400 hover:underline">
                            Cancel
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.associate_login}</td>
                        <td className="px-4 py-3 text-slate-600">{r.shift_type}</td>
                        <td className="px-4 py-3 text-slate-600">{r.role}</td>
                        <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                        <td className="px-4 py-3 text-slate-500 max-w-[200px] truncate">{r.notes || "—"}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button type="button" onClick={() => startEdit(r)}
                            className="mr-3 text-xs font-semibold text-sky-600 hover:underline">
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(r.id)} disabled={pending}
                            className="text-xs font-semibold text-rose-500 hover:underline disabled:opacity-50">
                            Remove
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Total row */}
      {records.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
            <span className="font-semibold text-slate-900">{records.length}</span>
            <span className="ml-1.5 text-slate-500">Total Associates</span>
          </div>
          {SHIFT_TYPES.map((s) => {
            const count = records.filter((r) => r.shift_type === s).length;
            if (!count) return null;
            return (
              <div key={s} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm">
                <span className="font-semibold text-slate-900">{count}</span>
                <span className="ml-1.5 text-slate-500">{s} Shift</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
