"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/actions/auth";

const items = [
  { href: "/hourly-notes", label: "Hourly Notes" },
  { href: "/chat", label: "Chat Thread" },
  { href: "/scheduling", label: "Scheduling" },
  { href: "/associate-table", label: "Associate Table" },
  { href: "/process-path", label: "Process Path" },
  { href: "/database", label: "Database" },
  { href: "/staffing", label: "Staffing" },
];

const HIDE_DELAY_MS = 1500;
const SIDEBAR_WIDTH = 280;
const TAB_WIDTH = 32;
const TRANSLATE_AMOUNT = SIDEBAR_WIDTH - TAB_WIDTH;

interface SidebarProps {
  email?: string | null;
}

export function Sidebar({ email }: SidebarProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  }, [clearTimer]);

  const handleMouseEnter = useCallback(() => {
    clearTimer();
    setOpen(true);
  }, [clearTimer]);

  const handleMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  const toggle = useCallback(() => {
    clearTimer();
    setOpen((v) => !v);
  }, [clearTimer]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{
        width: open ? `${SIDEBAR_WIDTH}px` : `${TAB_WIDTH}px`,
        minHeight: "100svh",
        transition: "width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <aside
        className="absolute inset-y-0 left-0 flex flex-col border-r border-slate-800/60 bg-[#0f172a] text-slate-100"
        style={{
          width: `${SIDEBAR_WIDTH}px`,
          transform: open
            ? "translateX(0)"
            : `translateX(-${TRANSLATE_AMOUNT}px)`,
          transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        aria-label="Primary"
      >
        <div
          className="flex flex-1 flex-col"
          style={{
            opacity: open ? 1 : 0,
            transition: "opacity 0.2s ease",
            pointerEvents: open ? "auto" : "none",
          }}
        >
          {/* User bar at the top */}
          <div className="border-b border-slate-700/80 px-4 py-3 flex items-center justify-between gap-2">
            <p className="truncate text-xs text-slate-400">
              {email ? (
                <>Signed in as <span className="font-semibold text-slate-200">{email}</span></>
              ) : (
                <span className="text-slate-500">Not signed in</span>
              )}
            </p>
            <form action={signOut}>
              <button
                type="submit"
                className="flex-shrink-0 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="border-b border-slate-700/80 px-6 py-7">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-slate-400">
              ICQA WORKSPACE
            </p>
            <h1 className="mt-1 text-lg font-bold leading-tight text-white">
              Personalize Dashboard
            </h1>
            <p className="mt-2 text-sm leading-snug text-slate-400">
              Shared workspace for manager and associate collaboration.
            </p>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-5">
            {items.map((item) => {
              const active =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "group flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
                  ].join(" ")}
                >
                  <span>{item.label}</span>
                  {active ? (
                    <span className="text-white/90" aria-hidden>
                      →
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-slate-700/80 px-6 py-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Shared Workspace
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white"
                aria-hidden
              >
                IC
              </div>
              <div>
                <p className="text-sm font-semibold text-white">ICQA Team</p>
                <p className="text-xs text-slate-400">
                  Manager &amp; Associate
                </p>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={toggle}
          className="absolute top-1/2 right-0 -translate-y-1/2 z-20 flex h-16 w-8 items-center justify-center rounded-r-lg bg-sky-600 text-white shadow-md transition-colors hover:bg-sky-500 focus:outline-none"
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          <span
            className="text-base font-bold leading-none select-none"
            style={{
              display: "inline-block",
              transform: open ? "rotate(0deg)" : "rotate(180deg)",
              transition: "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          >
            ‹
          </span>
        </button>
      </aside>
    </div>
  );
}
