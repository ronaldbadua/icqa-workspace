"use client";

import { useEffect, useRef } from "react";

/**
 * Polls /_appversion every `intervalMs` milliseconds.
 * NOTE: /api/* is handled by the Express API server, so we use a different path.
 * If the server-reported version changes from what was seen on first load
 * the page reloads automatically so all users always run the latest JS.
 */
export function useVersionCheck(intervalMs = 15_000) {
  const currentVersion = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/appversion", { cache: "no-store" });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v: string };
        if (cancelled) return;
        if (currentVersion.current === null) {
          currentVersion.current = v;
        } else if (currentVersion.current !== v) {
          window.location.reload();
        }
      } catch {
        // Network hiccup — try again next interval
      }
    };

    void check();
    const id = setInterval(check, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [intervalMs]);
}
