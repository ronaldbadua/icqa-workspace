"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAssociate,
  autoAssignMonthly,
  deleteAssociate,
  updateAssociate,
  upsertAssignment,
  upsertPoolingRules,
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

/** Label from `associate_p_scores.login` (DB `associates.name` mirrors login for compatibility). */
function associateLoginLabel(loginMap: Record<string, string>, associateId: string) {
  const v = (loginMap[associateId] ?? "").trim();
  return v.length > 0 ? v : "—";
}

type AssocRowDraft = { login: string; shift_type: ShiftType; is_active: boolean };

type PoolRowDraft = {
  shift_type: ShiftType;
  allow_sunday: boolean;
  allow_monday: boolean;
  allow_tuesday: boolean;
  allow_wednesday: boolean;
  allow_thursday: boolean;
  allow_friday: boolean;
  allow_saturday: boolean;
};

function buildAssocDraftMap(
  associates: AssociateRow[],
  loginMap: Record<string, string>
): Record<string, AssocRowDraft> {
  return Object.fromEntries(
    associates.map((a) => [
      a.id,
      {
        login: loginMap[a.id] ?? "",
        shift_type: a.shift_type,
        is_active: a.is_active,
      },
    ])
  );
}

function buildPoolDraftMap(
  associates: AssociateRow[],
  ruleByAssoc: Map<string, PoolingRuleRow>
): Record<string, PoolRowDraft> {
  return Object.fromEntries(
    associates.map((a) => {
      const r = ruleByAssoc.get(a.id);
      return [
        a.id,
        {
          shift_type: a.shift_type,
          allow_sunday: Boolean(r?.allow_sunday),
          allow_monday: Boolean(r?.allow_monday),
          allow_tuesday: Boolean(r?.allow_tuesday),
          allow_wednesday: Boolean(r?.allow_wednesday),
          allow_thursday: Boolean(r?.allow_thursday),
          allow_friday: Boolean(r?.allow_friday),
          allow_saturday: Boolean(r?.allow_saturday),
        },
      ];
    })
  );
}

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

  const loginMapKey = useMemo(() => JSON.stringify(loginMap), [loginMap]);
  const [newLogin, setNewLogin] = useState("");
  const [newShiftType, setNewShiftType] = useState<ShiftType>("FHD");
  const [assocDrafts, setAssocDrafts] = useState<Record<string, AssocRowDraft>>(() =>
    buildAssocDraftMap(associates, loginMap)
  );
  const [poolDrafts, setPoolDrafts] = useState<Record<string, PoolRowDraft>>(() =>
    buildPoolDraftMap(associates, new Map(rules.map((r) => [r.associate_id, r])))
  );

  const serverMainByDate = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const d of monthDays) {
      const row = byAssign.get(`${d.date}::main`);
      m[d.date] = row?.associate_id ?? null;
    }
    return m;
  }, [monthDays, byAssign]);

  const [mainAssignDraft, setMainAssignDraft] = useState<Record<string, string | null>>({});

  useEffect(() => {
    setAssocDrafts(buildAssocDraftMap(associates, loginMap));
  }, [associates, loginMapKey]);

  const rulesFingerprint = useMemo(
    () =>
      rules
        .map((r) =>
          [
            r.associate_id,
            r.allow_sunday,
            r.allow_monday,
            r.allow_tuesday,
            r.allow_wednesday,
            r.allow_thursday,
            r.allow_friday,
            r.allow_saturday,
          ].join(",")
        )
        .join("|"),
    [rules]
  );

  useEffect(() => {
    const rb = new Map(rules.map((r) => [r.associate_id, r]));
    setPoolDrafts(buildPoolDraftMap(associates, rb));
  }, [associates, rulesFingerprint]);

  useEffect(() => {
    setMainAssignDraft({ ...serverMainByDate });
  }, [serverMainByDate]);

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

  const saveMainAssignments = () => {
    if (!hasSupabase) {
      setError("Configure Supabase to save.");
      return;
    }
    setError(null);
    setSuccess(null);
    const norm = (x: string | null | undefined) => (x && String(x).length > 0 ? x : null);
    startTransition(async () => {
      let changed = false;
      for (const d of monthDays) {
        const date = d.date;
        const serverId = norm(serverMainByDate[date]);
        const rawDraft = mainAssignDraft[date];
        const draftId = rawDraft === undefined ? serverId : norm(rawDraft);
        if (draftId === serverId) continue;
        const mainRow = byAssign.get(`${date}::main`);
        const slot = mainRow?.slot_type ?? defaultSlotTypeForDate(date);
        if (slot === "Vacation") continue;
        const res = await upsertAssignment({
          assignment_date: date,
          role: "main",
          slot_type: slot,
          associate_id: draftId,
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        changed = true;
      }
      if (!changed) {
        setSuccess("No schedule changes to save.");
        return;
      }
      setSuccess("Schedule changes saved.");
      router.refresh();
    });
  };

  const saveAssocDrafts = () => {
    if (!hasSupabase) {
      setError("Configure Supabase to save.");
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      let changed = false;
      for (const a of associates) {
        const d = assocDrafts[a.id];
        if (!d) continue;
        const serverLogin = loginMap[a.id] ?? "";
        if (d.login === serverLogin && d.shift_type === a.shift_type && d.is_active === a.is_active) continue;
        const loginForDb = d.login.trim() || (loginMap[a.id] ?? "").trim();
        if (!loginForDb) {
          setError("Associate login is required for every row before saving.");
          return;
        }
        const [assocRes, loginRes] = await Promise.all([
          updateAssociate({
            id: a.id,
            login: loginForDb,
            shift_type: d.shift_type,
            is_active: d.is_active,
          }),
          saveAssociateLogin(a.id, d.login),
        ]);
        if (!assocRes.ok) {
          setError(assocRes.error);
          return;
        }
        if (!loginRes.ok) {
          setError(loginRes.error);
          return;
        }
        changed = true;
      }
      if (!changed) {
        setSuccess("No associate changes to save.");
        return;
      }
      setSuccess("Associate changes saved.");
      router.refresh();
    });
  };

  const savePoolDrafts = () => {
    if (!hasSupabase) {
      setError("Configure Supabase to save.");
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const serverPool = buildPoolDraftMap(associates, ruleByAssoc);
      let poolDirty = false;
      for (const a of associates) {
        const d = poolDrafts[a.id];
        const s = serverPool[a.id];
        if (!d || !s) continue;
        if (JSON.stringify(d) !== JSON.stringify(s)) poolDirty = true;
      }
      if (!poolDirty) {
        setSuccess("No pooling changes to save.");
        return;
      }
      for (const a of associates) {
        const d = poolDrafts[a.id];
        if (!d) continue;
        const loginTrim = (loginMap[a.id] ?? "").trim() || "Associate";
        const assocRes = await updateAssociate({
          id: a.id,
          login: loginTrim,
          shift_type: d.shift_type,
          is_active: a.is_active,
        });
        if (!assocRes.ok) {
          setError(assocRes.error);
          return;
        }
      }
      const rulesPayload = associates.map((a) => {
        const d = poolDrafts[a.id]!;
        return {
          associate_id: a.id,
          allow_sunday: d.allow_sunday,
          allow_monday: d.allow_monday,
          allow_tuesday: d.allow_tuesday,
          allow_wednesday: d.allow_wednesday,
          allow_thursday: d.allow_thursday,
          allow_friday: d.allow_friday,
          allow_saturday: d.allow_saturday,
        };
      });
      const ruleRes = await upsertPoolingRules(rulesPayload);
      if (!ruleRes.ok) {
        setError(ruleRes.error);
        return;
      }
      setSuccess("Pooling rules saved.");
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
            <p className="text-xs text-slate-500">
              Pick assignees per day below, then use <strong>Save schedule</strong> at the bottom to sync to Supabase (no refresh while editing).
            </p>
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
                  const draftVal = mainAssignDraft[date];
                  const selectValue =
                    draftVal === undefined ? (serverMainByDate[date] ?? "") : draftVal ?? "";
                  const mainOpts = eligibleOptions(date, slot, "main", []);

                  return (
                    <div key={date} className="min-h-[120px] rounded-lg border border-slate-200/80 bg-slate-50/40 p-2 text-left">
                      <p className="text-lg font-bold text-slate-800 leading-none">{parseInt(date.split("-")[2], 10)}</p>
                      <div className="mt-1">
                        <select
                          className="w-full appearance-none cursor-pointer bg-transparent px-0 py-0.5 text-[0.7rem] text-slate-800 focus:outline-none"
                          value={selectValue}
                          disabled={pending || slot === "Vacation"}
                          onChange={(e) => {
                            const v = e.target.value;
                            setMainAssignDraft((prev) => ({
                              ...prev,
                              [date]: v.length > 0 ? v : null,
                            }));
                          }}
                        >
                          <option value="">—</option>
                          {mainOpts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {associateLoginLabel(loginMap, a.id)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3">
            <button
              type="button"
              disabled={pending || !hasSupabase}
              onClick={() => saveMainAssignments()}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "associates" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <div className="border-b border-slate-200/80 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-900">Associates List</h3>
            <p className="text-xs text-slate-500">
              Edit rows below (all changes stay local), then click <strong>Save changes</strong> to sync. Use + Add to create a
              new associate immediately.
            </p>
          </div>

          <form
            className="flex flex-wrap items-end gap-2 border-b border-slate-200/60 bg-slate-50/60 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              const login = newLogin.trim();
              if (!login) {
                setError("Associate login is required.");
                return;
              }
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const res = await addAssociate(login, newShiftType);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setNewLogin("");
                setNewShiftType("FHD");
                setSuccess("Associate added.");
                router.refresh();
              });
            }}
          >
            <div className="min-w-[12rem] flex-1">
              <FormLabel>Associate Login</FormLabel>
              <input
                value={newLogin}
                onChange={(e) => setNewLogin(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                placeholder="Enter associate login"
              />
            </div>
            <div className="w-36">
              <FormLabel>Shift type</FormLabel>
              <select
                value={newShiftType}
                onChange={(e) => setNewShiftType(e.target.value as ShiftType)}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              >
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
                  <th className="px-4 py-2">Associate Login</th>
                  <th className="px-4 py-2">Shift type</th>
                  <th className="px-4 py-2">Active</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80">
                {associates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                      No associates yet. Add one above.
                    </td>
                  </tr>
                ) : null}
                {associates.map((a) => {
                  const base: AssocRowDraft = {
                    login: loginMap[a.id] ?? "",
                    shift_type: a.shift_type,
                    is_active: a.is_active,
                  };
                  const d = assocDrafts[a.id] ?? base;
                  return (
                    <tr key={a.id}>
                      <td className="px-4 py-2">
                        <input
                          type="text"
                          value={d.login}
                          onChange={(e) =>
                            setAssocDrafts((prev) => ({
                              ...prev,
                              [a.id]: { ...(prev[a.id] ?? base), login: e.target.value },
                            }))
                          }
                          placeholder="Associate login"
                          className="w-full max-w-xs rounded border border-slate-200 px-2 py-1 text-sm focus:border-sky-400 focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={d.shift_type}
                          onChange={(e) =>
                            setAssocDrafts((prev) => ({
                              ...prev,
                              [a.id]: { ...(prev[a.id] ?? base), shift_type: e.target.value as ShiftType },
                            }))
                          }
                          className="rounded border border-slate-200 px-2 py-1"
                        >
                          {SLOT_TYPES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={d.is_active}
                          onChange={(e) =>
                            setAssocDrafts((prev) => ({
                              ...prev,
                              [a.id]: { ...(prev[a.id] ?? base), is_active: e.target.checked },
                            }))
                          }
                        />
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
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3">
            <button
              type="button"
              disabled={pending || !hasSupabase || associates.length === 0}
              onClick={() => saveAssocDrafts()}
              className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "pooling" ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            <div className="border-b border-slate-200/80 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-900">Pooling rules</h3>
              <p className="text-xs text-slate-500">
                Adjust shift type and workdays below, then click <strong>Save pooling rules</strong> at the bottom to sync.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Associate Login</th>
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
                    const base: PoolRowDraft = {
                      shift_type: a.shift_type,
                      allow_sunday: Boolean(r?.allow_sunday),
                      allow_monday: Boolean(r?.allow_monday),
                      allow_tuesday: Boolean(r?.allow_tuesday),
                      allow_wednesday: Boolean(r?.allow_wednesday),
                      allow_thursday: Boolean(r?.allow_thursday),
                      allow_friday: Boolean(r?.allow_friday),
                      allow_saturday: Boolean(r?.allow_saturday),
                    };
                    const d = poolDrafts[a.id] ?? base;
                    const patch = (patch: Partial<PoolRowDraft>) =>
                      setPoolDrafts((prev) => ({
                        ...prev,
                        [a.id]: { ...(prev[a.id] ?? base), ...patch },
                      }));
                    return (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-medium text-slate-800">{associateLoginLabel(loginMap, a.id)}</td>
                        <td className="px-4 py-2">
                          <select
                            value={POOLING_SHIFT_TYPES.includes(d.shift_type) ? d.shift_type : "FHD"}
                            onChange={(e) => patch({ shift_type: e.target.value as ShiftType })}
                            className="rounded border border-slate-200 px-2 py-1"
                          >
                            {POOLING_SHIFT_TYPES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_sunday}
                            onChange={(e) => patch({ allow_sunday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_monday}
                            onChange={(e) => patch({ allow_monday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_tuesday}
                            onChange={(e) => patch({ allow_tuesday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_wednesday}
                            onChange={(e) => patch({ allow_wednesday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_thursday}
                            onChange={(e) => patch({ allow_thursday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_friday}
                            onChange={(e) => patch({ allow_friday: e.target.checked })}
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            className="h-10 w-10 cursor-pointer accent-sky-600"
                            checked={d.allow_saturday}
                            onChange={(e) => patch({ allow_saturday: e.target.checked })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3">
              <button
                type="button"
                disabled={pending || !hasSupabase || associates.length === 0}
                onClick={() => savePoolDrafts()}
                className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save pooling rules"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
