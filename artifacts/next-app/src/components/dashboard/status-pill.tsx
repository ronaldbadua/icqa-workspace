import type { ReactNode } from "react";

const variants: Record<"success" | "warning" | "danger" | "neutral" | "info", string> = {
  success: "bg-emerald-100 text-emerald-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-rose-100 text-rose-700",
  neutral: "bg-slate-200 text-slate-800",
  info: "bg-sky-100 text-sky-800",
};

export function StatusPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: keyof typeof variants;
}) {
  return (
    <div
      className={`inline-flex min-w-[8rem] flex-1 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium ${variants[tone]}`}
    >
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export function HourlyRowStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    resolved: { label: "Resolved", className: "bg-emerald-100 text-emerald-800" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-800" },
    needs_attention: { label: "Needs attention", className: "bg-rose-100 text-rose-700" },
    no_action_needed: { label: "No action needed", className: "bg-sky-100 text-sky-700" },
  };
  const c = map[status] ?? map.pending;
  return <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${c.className}`}>{c.label}</span>;
}

export function FormLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-slate-500">{children}</label>;
}
