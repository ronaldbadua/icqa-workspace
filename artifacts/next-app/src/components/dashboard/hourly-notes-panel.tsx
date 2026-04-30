"use client";

import { useMemo, useState, useTransition, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { upsertHourlyNote, deleteHourlyNote } from "@/app/actions/hourly-notes";
import type { HourlyNoteStatus } from "@/lib/supabase/database.types";
import { HOURLY_NOTES_HOUR_END, HOURLY_NOTES_HOUR_START, STAND_UP_2_HOUR } from "@/lib/constants";
import { buildHourlySlots, summarizeHourlyStatus, type HourlySlot } from "@/lib/hourly-notes-logic";
import { ConfigBanner } from "@/components/dashboard/config-banner";
import { FormLabel, HourlyRowStatusBadge, StatusPill } from "@/components/dashboard/status-pill";

function formatHourLabel(h: number): string {
  if (h === 6 || h === STAND_UP_2_HOUR) return "Stand Up";
  const d = new Date(2000, 0, 1, h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

interface HourlyNotesPanelProps {
  initialDate: string;
  rows: {
    id: string;
    hour: number;
    status: HourlyNoteStatus;
    content: string;
    author_name: string;
    manager_comment: string;
  }[];
  hasSupabase: boolean;
}

type FormState = { content: string; managerComment: string; status: HourlyNoteStatus };

function slotToForm(slot: HourlySlot): FormState {
  return {
    content: slot.content,
    managerComment: slot.manager_comment,
    status: slot.status,
  };
}

/** All regular hours start expanded; Stand Up rows (h=6 and STAND_UP_2_HOUR) start collapsed. */
function buildDefaultExpanded(): Set<number> {
  const s = new Set<number>();
  for (let h = 7; h <= HOURLY_NOTES_HOUR_END; h++) s.add(h);
  return s;
}

export function HourlyNotesPanel({ initialDate, rows, hasSupabase }: HourlyNotesPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(buildDefaultExpanded);
  const [formByHour, setFormByHour] = useState<Record<number, FormState>>({});
  const [savedHours, setSavedHours] = useState<Set<number>>(new Set());

  const dateValue = searchParams.get("date") ?? initialDate;

  const slots = useMemo(
    () => buildHourlySlots(dateValue, rows, HOURLY_NOTES_HOUR_START, HOURLY_NOTES_HOUR_END),
    [dateValue, rows]
  );
  const summary = useMemo(() => summarizeHourlyStatus(slots), [slots]);

  const navigateToDate = useCallback(
    (d: string) => {
      if (!d) return;
      setError(null);
      setFormByHour({});
      setExpanded(buildDefaultExpanded());
      setSavedHours(new Set());
      router.push(`/hourly-notes?date=${encodeURIComponent(d)}`);
    },
    [router]
  );

  const ensureForm = (slot: HourlySlot) => {
    if (formByHour[slot.hour]) return;
    setFormByHour((prev) => ({ ...prev, [slot.hour]: slotToForm(slot) }));
  };

  // Pre-initialize form state for every slot so always-rendered form inputs
  // display the correct persisted values even before the user interacts.
  useEffect(() => {
    setFormByHour((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const slot of slots) {
        if (!next[slot.hour]) {
          next[slot.hour] = slotToForm(slot);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [slots]);

  const getForm = (slot: HourlySlot): FormState =>
    formByHour[slot.hour] ?? slotToForm(slot);

  const flashSaved = (hour: number) => {
    setSavedHours((prev) => new Set(prev).add(hour));
    setTimeout(() => {
      setSavedHours((prev) => {
        const next = new Set(prev);
        next.delete(hour);
        return next;
      });
    }, 2500);
  };

  const saveSlot = (slot: HourlySlot) => {
    const f = getForm(slot);
    if (!hasSupabase) {
      setError("Configure Supabase to save notes.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await upsertHourlyNote(dateValue, slot.hour, {
        content: f.content,
        author_name: slot.author_name,
        status: f.status,
        manager_comment: f.managerComment,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      flashSaved(slot.hour);
      router.refresh();
    });
  };

  const clearSlot = (hour: number) => {
    if (!hasSupabase) {
      setError("Configure Supabase to delete saved rows.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteHourlyNote(dateValue, hour);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setFormByHour((prev) => {
        const next = { ...prev };
        delete next[hour];
        return next;
      });
      // Keep the row open after clearing so the user can re-enter data
      router.refresh();
    });
  };

  return (
    <div>
      {!hasSupabase ? <ConfigBanner /> : null}
      {error ? (
        <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <div className="border-b border-slate-200/80 px-5 py-4 md:flex md:items-start md:justify-between md:gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">Hourly Notes</h3>
            <p className="text-sm text-slate-500">Track concerns per hour with clear status highlights.</p>
          </div>
          <div className="mt-3 flex w-full max-w-sm flex-col gap-2 sm:mt-0 sm:flex-row sm:items-end sm:gap-2 md:max-w-none">
            <div className="w-full min-w-0 sm:w-44">
              <FormLabel>Date</FormLabel>
              <div className="flex rounded-lg border border-slate-200 bg-slate-50/80 focus-within:ring-2 focus-within:ring-sky-500/30">
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => navigateToDate(e.target.value)}
                  className="w-full rounded-lg bg-transparent px-3 py-2 text-sm text-slate-900 outline-none"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigateToDate(dateValue)}
              className="h-[42px] rounded-lg bg-sky-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700"
            >
              View
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <StatusPill label="No Actions Needed" value={summary.noActionNeeded} tone="info" />
            <StatusPill label="Resolved" value={summary.resolved} tone="success" />
            <StatusPill label="Pending" value={summary.pending} tone="warning" />
            <StatusPill label="Needs Attention" value={summary.needsAttention} tone="danger" />
            <StatusPill label="Total Logged" value={summary.totalLogged} tone="neutral" />
          </div>
        </div>

        <ul className="divide-y divide-slate-200/80 border-t border-slate-200/80">
          {slots.map((slot) => {
            const isStandUp = slot.hour === 6 || slot.hour === STAND_UP_2_HOUR;
            const isOpen = expanded.has(slot.hour);
            const isSaved = savedHours.has(slot.hour);
            const rowTone =
              slot.status === "resolved"
                ? "bg-emerald-50/50"
                : slot.status === "needs_attention"
                  ? "bg-rose-50/50"
                  : slot.status === "no_action_needed"
                    ? "bg-sky-50/50"
                    : "bg-amber-50/60";
            const f = getForm(slot);
            return (
              <li key={slot.hour} className={rowTone}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 py-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    {slot.hour === 6 || slot.hour === STAND_UP_2_HOUR ? (
                      <span className="text-[1.1rem] font-bold text-blue-600 leading-none">
                        {formatHourLabel(slot.hour)}
                      </span>
                    ) : (
                      <span className="min-w-[5.5rem] text-sm font-semibold text-slate-800">
                        {formatHourLabel(slot.hour)}
                      </span>
                    )}
                    <HourlyRowStatusBadge status={slot.status} />
                    {isSaved ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Saved ✓
                      </span>
                    ) : null}
                  </div>
                  {/* Expand / Collapse toggle */}
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 active:scale-95"
                    onClick={() => {
                      setError(null);
                      setExpanded((e) => {
                        const next = new Set(e);
                        if (isOpen) next.delete(slot.hour);
                        else next.add(slot.hour);
                        return next;
                      });
                    }}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? "Collapse section" : "Expand section"}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-3.5 w-3.5 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
                      aria-hidden
                    >
                      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                    </svg>
                    {isOpen ? "Collapse" : "Expand"}
                  </button>
                </div>

                {/* Animated accordion body — always mounted for smooth transition */}
                <div
                  className="overflow-hidden"
                  style={{
                    maxHeight: isOpen ? "800px" : "0px",
                    opacity: isOpen ? 1 : 0,
                    transition: "max-height 0.35s ease-in-out, opacity 0.25s ease-in-out",
                  }}
                >
                  <div className="border-t border-slate-200/60 bg-white/90 px-5 py-4 space-y-3">
                    <div>
                      <FormLabel>Status</FormLabel>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            { value: "no_action_needed", label: "No Actions Needed", active: "bg-sky-100 text-sky-800 ring-2 ring-sky-400",             inactive: "bg-white text-sky-700 border border-sky-200 hover:bg-sky-50" },
                            { value: "resolved",         label: "Resolved",          active: "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-400",  inactive: "bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50" },
                            { value: "pending",          label: "Pending",           active: "bg-amber-100 text-amber-800 ring-2 ring-amber-400",        inactive: "bg-white text-amber-700 border border-amber-200 hover:bg-amber-50" },
                            { value: "needs_attention",  label: "Needs Attention",   active: "bg-rose-100 text-rose-700 ring-2 ring-rose-400",           inactive: "bg-white text-rose-600 border border-rose-200 hover:bg-rose-50" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              ensureForm(slot);
                              setFormByHour((prev) => ({
                                ...prev,
                                [slot.hour]: { ...(prev[slot.hour] ?? slotToForm(slot)), status: opt.value },
                              }));
                            }}
                            className={[
                              "rounded-lg px-4 py-2 text-sm font-semibold transition",
                              f.status === opt.value ? opt.active : opt.inactive,
                            ].join(" ")}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <FormLabel>Feedback or concern</FormLabel>
                      <textarea
                        rows={6}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 resize-y"
                        value={f.content}
                        onChange={(e) => {
                          ensureForm(slot);
                          setFormByHour((prev) => ({
                            ...prev,
                            [slot.hour]: { ...(prev[slot.hour] ?? slotToForm(slot)), content: e.target.value },
                          }));
                        }}
                        placeholder="Capture hourly associate feedback, concerns, and follow-ups…"
                      />
                    </div>

                    <div>
                      <FormLabel>Manager Comment</FormLabel>
                      <textarea
                        rows={4}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 resize-y"
                        value={f.managerComment}
                        onChange={(e) => {
                          ensureForm(slot);
                          setFormByHour((prev) => ({
                            ...prev,
                            [slot.hour]: { ...(prev[slot.hour] ?? slotToForm(slot)), managerComment: e.target.value },
                          }));
                        }}
                        placeholder="Manager response or comment on this hour's feedback…"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      {slot.hasPersistedRow ? (
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          onClick={() => clearSlot(slot.hour)}
                          disabled={pending}
                        >
                          Clear saved note
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={[
                          "rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60",
                          isSaved ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sky-600 hover:bg-sky-700",
                        ].join(" ")}
                        onClick={() => saveSlot(slot)}
                        disabled={pending}
                      >
                        {pending ? "Saving…" : isSaved ? "Saved ✓" : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
