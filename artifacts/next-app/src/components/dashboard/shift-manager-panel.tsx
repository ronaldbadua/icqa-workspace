"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAssociate,
  autoAssignMonthly,
  deleteAssociate,
  updateAssociate,
  upsertAssignment,
  upsertPoolingRule,
} from "@/app/actions/scheduling";
import { saveAssociateLogin } from "@/app/actions/associate-table";
import type { AssociateRow, MonthlyAssignmentRow, PoolingRuleRow } from "@/lib/data/queries";
import type { AssignmentRole, ShiftType } from "@/lib/supabase/database.types";
import { addMonths, parseYm, toYm } from "@/lib/week";
import {
  canAssignPooling,
  canAssignShift,
  defaultSlotTypeForDate,
  SLOT_TYPES,
  weekdayFromYmd,
} from "@/lib/shift-scheduling";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel } from "@/components/dashboard/status-pill";

type TabId = "shift" | "associates" | "pooling";
const POOLING_SHIFT_TYPES: ShiftType[] = ["FHD", "BHD", "Part Time"];

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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const onAutoAssign = () => {
    if (!hasSupabase) { setError("Configure Supabase to auto-assign."); return; }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await autoAssignMonthly(ym);
      if (!res.ok) { setError(res.error); return; }
      setSuccess(`Schedule generated for ${ym}.`);
      router.refresh();
    });
  };

  const leftTabs: { id: TabId; label: string }[] = [
    { id: "shift", label: "Shift Scheduling" },
    { id: "pooling", label: "Pooling" },
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

          {tab !== "associates" ? (
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
              onClick={() => onAutoAssign()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-60"
            >
              {pending ? "Generating…" : "Auto Assign Monthly"}
            </button>
          ) : null}
        </div>
      </div>


      {tab === "shift" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Monthly Schedule</h3>
            <p className="text-xs text-slate-500">One associate per day, pulled from Pooling rules. Saved to your database — navigate months freely.</p>
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
                  if (!cell) return <div key={`e-${wi}-${ci}`} className="min-h-[120px] rounded-lg bg-slate-50/50" />;
                  const date = cell.date;
                  const mainRow = byAssign.get(`${date}::main`);
                  const slot = mainRow?.slot_type ?? defaultSlotTypeForDate(date);
                  const mainId = mainRow?.associate_id ?? "";
                  const mainOpts = eligibleOptions(date, slot, "main", []);

                  return (
                    <div key={date} className="min-h-[120px] rounded-lg border border-slate-200/80 bg-slate-50/40 p-2 text-left">
                      <p className="text-lg font-bold text-slate-800 leading-none">{parseInt(date.split("-")[2], 10)}</p>
                      <div className="mt-1">
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[0.7rem] text-slate-800 focus:outline-none"
                          value={mainId}
                          disabled={pending || slot === "Vacation"}
                          onChange={(e) => onSlotOrAssign(date, "main", slot, e.target.value || null)}
                        >
                          <option value="">—</option>
                          {mainOpts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
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
              const name = String(fd.get("name") || "");
              const shift_type = String(fd.get("shift_type") || "FHD") as ShiftType;
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const res = await addAssociate(name, shift_type);
                if (!res.ok) { setError(res.error); return; }
                (e.target as HTMLFormElement).reset();
                setSuccess("Associate added.");
                router.refresh();
              });
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <FormLabel>Name</FormLabel>
              <input
                name="name"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Enter associate name"
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
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Log In</th>
                  <th className="px-4 py-2">Shift type</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {associates.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-400">
                      No associates yet. Add one above.
                    </td>
                  </tr>
                ) : null}
                {associates.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">
                      <input
                        defaultValue={a.name}
                        id={`name-${a.id}`}
                        className="w-full max-w-xs rounded border border-slate-200 px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        id={`login-${a.id}`}
                        type="text"
                        defaultValue={loginMap[a.id] ?? ""}
                        placeholder="Enter login"
                        className="w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        id={`shift-${a.id}`}
                        defaultValue={a.shift_type}
                        className="rounded border border-slate-200 px-2 py-1"
                      >
                        {SLOT_TYPES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="checkbox" defaultChecked={a.is_active} id={`active-${a.id}`} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        className="text-rose-600 hover:underline"
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
                      <button
                        type="button"
                        className="ml-2 text-sky-700 hover:underline"
                        disabled={pending}
                        onClick={() => {
                          const name = (document.getElementById(`name-${a.id}`) as HTMLInputElement).value;
                          const login = (document.getElementById(`login-${a.id}`) as HTMLInputElement).value;
                          const shift_type = (document.getElementById(`shift-${a.id}`) as HTMLSelectElement).value as ShiftType;
                          const is_active = (document.getElementById(`active-${a.id}`) as HTMLInputElement).checked;
                          setError(null);
                          startTransition(async () => {
                            const [assocRes, loginRes] = await Promise.all([
                              updateAssociate({ id: a.id, name, shift_type, is_active }),
                              saveAssociateLogin(a.id, login),
                            ]);
                            if (!assocRes.ok) setError(assocRes.error);
                            else if (!loginRes.ok) setError(loginRes.error);
                            else router.refresh();
                          });
                        }}
                      >
                        Save
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "pooling" ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pooling rules</h3>
                <p className="text-xs text-slate-500">Set shift type and available workdays for pooling assignments.</p>
              </div>
              <button
                type="button"
                disabled={pending}
                className="rounded-lg bg-sky-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                onClick={() => {
                  setError(null);
                  setSuccess(null);
                  startTransition(async () => {
                    for (const a of associates) {
                      const shift_type = (document.getElementById(`pool-shift-${a.id}`) as HTMLSelectElement).value as ShiftType;
                      const assocRes = await updateAssociate({
                        id: a.id,
                        name: a.name,
                        shift_type,
                        is_active: a.is_active,
                      });
                      if (!assocRes.ok) { setError(assocRes.error); return; }
                      const ruleRes = await upsertPoolingRule({
                        associate_id: a.id,
                        allow_sunday: (document.getElementById(`sun-${a.id}`) as HTMLInputElement).checked,
                        allow_monday: (document.getElementById(`mon-${a.id}`) as HTMLInputElement).checked,
                        allow_tuesday: (document.getElementById(`tue-${a.id}`) as HTMLInputElement).checked,
                        allow_wednesday: (document.getElementById(`wed-${a.id}`) as HTMLInputElement).checked,
                        allow_thursday: (document.getElementById(`thu-${a.id}`) as HTMLInputElement).checked,
                        allow_friday: (document.getElementById(`fri-${a.id}`) as HTMLInputElement).checked,
                        allow_saturday: (document.getElementById(`sat-${a.id}`) as HTMLInputElement).checked,
                      });
                      if (!ruleRes.ok) { setError(ruleRes.error); return; }
                    }
                    setSuccess("All pooling rules saved.");
                    router.refresh();
                  });
                }}
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Associate</th>
                    <th className="px-4 py-2">Shift type</th>
                    <th className="px-4 py-2">Sunday</th>
                    <th className="px-4 py-2">Monday</th>
                    <th className="px-4 py-2">Tuesday</th>
                    <th className="px-4 py-2">Wednesday</th>
                    <th className="px-4 py-2">Thursday</th>
                    <th className="px-4 py-2">Friday</th>
                    <th className="px-4 py-2">Saturday</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80">
                  {associates.map((a) => {
                    const r = ruleByAssoc.get(a.id);
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-medium text-slate-800">{a.name}</td>
                        <td className="px-4 py-2">
                          <select id={`pool-shift-${a.id}`} defaultValue={a.shift_type} className="rounded border border-slate-200 px-2 py-1">
                            {POOLING_SHIFT_TYPES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_sunday} id={`sun-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_monday} id={`mon-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_tuesday} id={`tue-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_wednesday} id={`wed-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_thursday} id={`thu-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_friday} id={`fri-${a.id}`} />
                        </td>
                        <td className="px-4 py-2">
                          <input type="checkbox" className="w-10 h-10 cursor-pointer accent-sky-600" defaultChecked={r?.allow_saturday} id={`sat-${a.id}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : null}

    </div>
  );
}
