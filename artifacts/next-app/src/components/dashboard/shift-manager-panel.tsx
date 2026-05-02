"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAssociate,
  autoAssignAfmBoth,
  autoAssignMonthly,
  autoAssignPsBoth,
  deleteAssociate,
  updateAssociate,
  updateAssociateRole,
  upsertAssignment,
} from "@/app/actions/scheduling";
import { saveAssociateLogin } from "@/app/actions/associate-table";
import type { AssociateRow, MonthlyAssignmentRow, PoolingRuleRow } from "@/lib/data/queries";
import type { AssignmentRole, ShiftType } from "@/lib/supabase/database.types";
import { addMonths, parseYm, toYm } from "@/lib/week";
import {
  canAssignPooling,
  canAssignRole,
  canAssignShift,
  defaultSlotTypeForDate,
  SLOT_TYPES,
  weekdayFromYmd,
} from "@/lib/shift-scheduling";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel } from "@/components/dashboard/status-pill";

type TabId = "shift" | "ps" | "associates";

function buildWeeks(days: { date: string; weekday: number; label: string }[]) {
  if (!days.length) return [] as ({ date: string; weekday: number; label: string } | null)[][];
  const cells: ({ date: string; weekday: number; label: string } | null)[] = [...Array(days[0].weekday).fill(null)];
  for (const d of days) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: ({ date: string; weekday: number; label: string } | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function assignmentMap(rows: MonthlyAssignmentRow[]) {
  const m = new Map<string, MonthlyAssignmentRow>();
  for (const r of rows) {
    m.set(`${r.assignment_date}::${r.role}`, r);
  }
  return m;
}


export function ShiftManagerPanel({
  ym,
  associates,
  rules,
  assignments,
  monthDays,
  loginMap = {},
  hasSupabase,
  queryError,
}: {
  ym: string;
  associates: AssociateRow[];
  loginMap?: Record<string, string>;
  rules: PoolingRuleRow[];
  assignments: MonthlyAssignmentRow[];
  monthDays: { date: string; weekday: number; label: string }[];
  hasSupabase: boolean;
  queryError: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("shift");
  const [pending, startTransition] = useTransition();
  const [rolePending, startRoleTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Reactive AFM / PS state — initialised from server data
  const [afmMap, setAfmMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(associates.map((a) => [a.id, a.is_afm ?? false]))
  );
  const [psMap, setPsMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(associates.map((a) => [a.id, a.is_ps ?? false]))
  );

  // Controlled state for associates list fields
  const [loginEdits, setLoginEdits] = useState<Record<string, string>>(
    () => Object.fromEntries(associates.map((a) => [a.id, loginMap[a.id] ?? ""]))
  );
  const [shiftEdits, setShiftEdits] = useState<Record<string, ShiftType>>(
    () => Object.fromEntries(associates.map((a) => [a.id, a.shift_type]))
  );
  const [activeEdits, setActiveEdits] = useState<Record<string, boolean>>(
    () => Object.fromEntries(associates.map((a) => [a.id, a.is_active]))
  );

  const [savePending, startSaveTransition] = useTransition();

  const toggleAfm = (id: string) => {
    const next = !afmMap[id];
    setAfmMap((prev) => ({ ...prev, [id]: next }));
    if (!hasSupabase) return;
    startRoleTransition(async () => {
      const res = await updateAssociateRole({ id, is_afm: next, is_ps: psMap[id] ?? false });
      if (!res.ok) setError(res.error);
    });
  };

  const togglePs = (id: string) => {
    const next = !psMap[id];
    setPsMap((prev) => ({ ...prev, [id]: next }));
    if (!hasSupabase) return;
    startRoleTransition(async () => {
      const res = await updateAssociateRole({ id, is_afm: afmMap[id] ?? false, is_ps: next });
      if (!res.ok) setError(res.error);
    });
  };

  const byAssign = useMemo(() => assignmentMap(assignments), [assignments]);
  const ruleByAssoc = useMemo(() => new Map(rules.map((r) => [r.associate_id, r])), [rules]);
  const weeks = useMemo(() => buildWeeks(monthDays), [monthDays]);

  const shiftMonth = (dir: -1 | 1) => {
    const d = addMonths(parseYm(ym), dir);
    router.push(`/scheduling?month=${encodeURIComponent(toYm(d))}`);
  };

  const eligibleOptions = (date: string, slot: ShiftType, role: AssignmentRole, exclude: string[]) => {
    const wd = weekdayFromYmd(date);
    return associates.filter((a) => {
      if (exclude.includes(a.id)) return false;
      const rule = ruleByAssoc.get(a.id);
      if (role === "pooling") {
        return canAssignPooling(a, rule, slot, wd);
      }
      return a.is_active && canAssignShift(a.shift_type, slot, wd);
    });
  };

  const onSlotOrAssign = (date: string, role: AssignmentRole, slot: ShiftType, associateId: string | null) => {
    if (!hasSupabase) { setError("Configure Supabase to save."); return; }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await upsertAssignment({ assignment_date: date, role, slot_type: slot, associate_id: associateId });
      if (!res.ok) { setError(res.error); return; }
      router.refresh();
    });
  };

  const onAutoAssign = (role: "afm" | "afm_support" | "ps" | "afm_both") => {
    if (!hasSupabase) { setError("Configure Supabase to auto-assign."); return; }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      if (role === "afm_both") {
        const r = await autoAssignAfmBoth(ym);
        if (!r.ok) { setError(r.error); return; }
        setSuccess(`AFM & AFM Support schedules generated for ${ym}.`);
      } else {
        const res = await autoAssignMonthly(ym, role);
        if (!res.ok) { setError(res.error); return; }
        setSuccess(`${role === "afm_support" ? "AFM Support" : role.toUpperCase()} schedule generated for ${ym}.`);
      }
      router.refresh();
    });
  };

  const leftTabs: { id: TabId; label: string }[] = [
    { id: "shift", label: "Scheduling AFM" },
    { id: "ps", label: "Scheduling PS" },
  ];

  return (
    <div>
      {!hasSupabase ? <ConfigBanner /> : null}
      {queryError ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {queryError}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
          {success}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200/80 bg-white p-1 shadow-sm">
          {leftTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setError(null); setSuccess(null); }}
              className={[
                "rounded-lg px-3 py-2 text-sm font-semibold transition",
                tab === t.id ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => { setTab(tab === "associates" ? "shift" : "associates"); setError(null); setSuccess(null); }}
            className={[
              "rounded-lg border px-3 py-2 text-sm font-semibold transition",
              tab === "associates"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            ].join(" ")}
          >
            Associates List
          </button>

          {tab === "shift" || tab === "ps" ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => shiftMonth(-1)}
              >
                ←
              </button>
              <span className="text-sm font-semibold text-slate-800">
                {parseYm(ym).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => shiftMonth(1)}
              >
                →
              </button>
            </>
          ) : null}

          {tab === "shift" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onAutoAssign("afm_both")}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-60"
            >
              {pending ? "Generating…" : "Auto Assign Monthly"}
            </button>
          ) : null}
          {tab === "ps" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!hasSupabase) { setError("Configure Supabase to auto-assign."); return; }
                setError(null); setSuccess(null);
                startTransition(async () => {
                  const r = await autoAssignPsBoth(ym);
                  if (!r.ok) { setError(r.error); return; }
                  setSuccess(`PS & PS Support schedules generated for ${ym}.`);
                  router.refresh();
                });
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-60"
            >
              {pending ? "Generating…" : "Auto Assign Monthly"}
            </button>
          ) : null}
        </div>
      </div>


      {/* ── Scheduling AFM (combined AFM + AFM Support) ─────────────── */}
      {tab === "shift" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">AFM Monthly Schedule</h3>
            <p className="text-xs text-slate-500">AFM and AFM Support — fair rotation from the same pool, never the same person on the same day.</p>
          </div>
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[720px] grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid min-w-[720px] grid-cols-7 gap-1">
                {week.map((cell, ci) => {
                  if (!cell) return <div key={`e-${wi}-${ci}`} className="min-h-[160px] rounded-lg bg-slate-50/50" />;
                  const date = cell.date;
                  const slot = defaultSlotTypeForDate(date);
                  const wd = weekdayFromYmd(date);

                  const afmRow = byAssign.get(`${date}::afm`);
                  const afmId  = afmRow?.associate_id ?? "";
                  const supRow = byAssign.get(`${date}::afm_support`);
                  const supId  = supRow?.associate_id ?? "";

                  const afmOpts = associates.filter((a) => {
                    if (!(a as unknown as { is_afm?: boolean }).is_afm) return false;
                    return canAssignRole(a, wd);
                  });
                  const supOpts = associates.filter((a) => {
                    if (!(a as unknown as { is_afm?: boolean }).is_afm) return false;
                    return canAssignRole(a, wd);
                  });

                  return (
                    <div key={date} className="min-h-[160px] rounded-lg border border-slate-200/80 bg-slate-50/40 p-2 text-left">
                      <p className="text-lg font-bold text-slate-800 leading-none">{parseInt(date.split("-")[2], 10)}</p>

                      {/* AFM row */}
                      <div className="mt-1 flex items-center gap-1">
                        <span className="shrink-0 rounded bg-sky-100 px-1 py-0.5 text-[1.3rem] font-bold uppercase text-sky-700">AFM</span>
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[1.5rem] text-sky-800 focus:outline-none"
                          value={afmId}
                          disabled={pending}
                          onChange={(e) => onSlotOrAssign(date, "afm", slot, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {afmOpts.map((a) => (
                            <option key={a.id} value={a.id}>{loginMap[a.id] || a.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* SUP row */}
                      <div className="mt-1 flex items-center gap-1">
                        <span className="shrink-0 rounded bg-sky-200 px-1 py-0.5 text-[1.3rem] font-bold uppercase text-sky-800">SUP</span>
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[1.5rem] text-sky-900 focus:outline-none"
                          value={supId}
                          disabled={pending}
                          onChange={(e) => onSlotOrAssign(date, "afm_support", slot, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {supOpts.map((a) => (
                            <option key={a.id} value={a.id}>{loginMap[a.id] || a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Scheduling PS (combined PS + PS Support) ──────────────── */}
      {tab === "ps" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">PS Monthly Schedule</h3>
            <p className="text-xs text-slate-500">PS and PS Support — fair rotation from the same pool, never the same person on the same day.</p>
          </div>
          <div className="overflow-x-auto p-3">
            <div className="grid min-w-[720px] grid-cols-7 gap-1 text-center text-[0.65rem] font-semibold uppercase text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="py-1">{d}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid min-w-[720px] grid-cols-7 gap-1">
                {week.map((cell, ci) => {
                  if (!cell) return <div key={`e-${wi}-${ci}`} className="min-h-[160px] rounded-lg bg-slate-50/50" />;
                  const date = cell.date;
                  const slot = defaultSlotTypeForDate(date);
                  const wd = weekdayFromYmd(date);

                  const psRow  = byAssign.get(`${date}::ps`);
                  const psId   = psRow?.associate_id ?? "";
                  const supRow = byAssign.get(`${date}::ps_support`);
                  const supId  = supRow?.associate_id ?? "";

                  const psOpts = associates.filter((a) => {
                    if (!(a as unknown as { is_ps?: boolean }).is_ps) return false;
                    return canAssignRole(a, wd);
                  });
                  const supOpts = associates.filter((a) => {
                    if (!(a as unknown as { is_ps?: boolean }).is_ps) return false;
                    return canAssignRole(a, wd);
                  });

                  return (
                    <div key={date} className="min-h-[160px] rounded-lg border border-slate-200/80 bg-slate-50/40 p-2 text-left">
                      <p className="text-lg font-bold text-slate-800 leading-none">{parseInt(date.split("-")[2], 10)}</p>

                      {/* PS row */}
                      <div className="mt-1 flex items-center gap-1">
                        <span className="shrink-0 rounded bg-emerald-100 px-1 py-0.5 text-[1.3rem] font-bold uppercase text-emerald-700">PS</span>
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[1.5rem] text-emerald-800 focus:outline-none"
                          value={psId}
                          disabled={pending}
                          onChange={(e) => onSlotOrAssign(date, "ps", slot, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {psOpts.map((a) => (
                            <option key={a.id} value={a.id}>{loginMap[a.id] || a.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* PS Support row */}
                      <div className="mt-1 flex items-center gap-1">
                        <span className="shrink-0 rounded bg-emerald-200 px-1 py-0.5 text-[1.3rem] font-bold uppercase text-emerald-800">SUP</span>
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[1.5rem] text-emerald-900 focus:outline-none"
                          value={supId}
                          disabled={pending}
                          onChange={(e) => onSlotOrAssign(date, "ps_support", slot, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {supOpts.map((a) => (
                            <option key={a.id} value={a.id}>{loginMap[a.id] || a.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "associates" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Associates List</h3>
            <p className="text-xs text-slate-500">
              Add names and configure each associate&rsquo;s shift type and pooling eligibility. All changes save permanently to your database.
            </p>
          </div>

          <form
            className="flex flex-wrap items-end gap-2 border-b border-slate-200/60 bg-slate-50/60 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const login = String(fd.get("login") || "").trim();
              const shift_type = String(fd.get("shift_type") || "FHD") as ShiftType;
              if (!login) { setError("Login is required."); return; }
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const res = await addAssociate(login, shift_type);
                if (!res.ok) { setError(res.error); return; }
                (e.target as HTMLFormElement).reset();
                setSuccess("Associate added.");
                router.refresh();
              });
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <FormLabel>Login</FormLabel>
              <input
                name="login"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Enter associate login"
              />
            </div>
            <div className="w-36">
              <FormLabel>Shift type</FormLabel>
              <select name="shift_type" className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" defaultValue="FHD">
                {SLOT_TYPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={pending} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              + Add
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Log In</th>
                  <th className="px-4 py-2 text-center">AFM</th>
                  <th className="px-4 py-2 text-center">PS</th>
                  <th className="px-4 py-2">Shift Type</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {associates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                      No associates yet. Add one above.
                    </td>
                  </tr>
                ) : null}
                {associates.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={loginEdits[a.id] ?? ""}
                        onChange={(e) => setLoginEdits((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        placeholder="Enter login"
                        className="w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none"
                      />
                    </td>
                    {/* AFM checkbox */}
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        aria-label="Toggle AFM"
                        disabled={rolePending}
                        onClick={() => toggleAfm(a.id)}
                        className={[
                          "mx-auto flex h-6 w-6 items-center justify-center rounded border-2 transition-all",
                          afmMap[a.id]
                            ? "border-sky-600 bg-sky-600 text-white"
                            : "border-slate-300 bg-white text-transparent hover:border-sky-400",
                        ].join(" ")}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </td>
                    {/* PS checkbox */}
                    <td className="px-4 py-2 text-center">
                      <button
                        type="button"
                        aria-label="Toggle PS"
                        disabled={rolePending}
                        onClick={() => togglePs(a.id)}
                        className={[
                          "mx-auto flex h-6 w-6 items-center justify-center rounded border-2 transition-all",
                          psMap[a.id]
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 bg-white text-transparent hover:border-emerald-400",
                        ].join(" ")}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={shiftEdits[a.id] ?? a.shift_type}
                        onChange={(e) => setShiftEdits((prev) => ({ ...prev, [a.id]: e.target.value as ShiftType }))}
                        className="rounded border border-slate-200 px-2 py-1 text-sm"
                      >
                        {SLOT_TYPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={activeEdits[a.id] ?? a.is_active}
                        onChange={(e) => setActiveEdits((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-rose-600 hover:underline text-sm"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setSuccess(null);
                          startTransition(async () => {
                            const res = await deleteAssociate(a.id);
                            if (!res.ok) setError(res.error);
                            else router.refresh();
                          });
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Centralized Save button */}
          {associates.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-200/60 bg-slate-50/60 px-4 py-3">
              <p className="text-xs text-slate-400">Changes update instantly · Click Save to sync all to Supabase</p>
              <button
                type="button"
                disabled={savePending || !hasSupabase}
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  startSaveTransition(async () => {
                    const results = await Promise.all(
                      associates.map((a) =>
                        Promise.all([
                          updateAssociate({
                            id: a.id,
                            name: a.name,
                            shift_type: shiftEdits[a.id] ?? a.shift_type,
                            is_active: activeEdits[a.id] ?? a.is_active,
                          }),
                          saveAssociateLogin(a.id, loginEdits[a.id] ?? ""),
                        ])
                      )
                    );
                    const firstErr = results.flat().find((r) => !r.ok);
                    if (firstErr && !firstErr.ok) { setError(firstErr.error); return; }
                    setSuccess("All changes saved.");
                    setTimeout(() => setSuccess(null), 3000);
                    router.refresh();
                  });
                }}
                className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 active:scale-95 disabled:opacity-50 transition-all"
              >
                {savePending ? "Saving…" : "Save All"}
              </button>
            </div>
          )}
        </div>
      ) : null}


    </div>
  );
}
