"use client";
import { useVersionCheck } from "@/hooks/useVersionCheck";

export function VersionGuard() {
  useVersionCheck(15_000);
  return null;
}
