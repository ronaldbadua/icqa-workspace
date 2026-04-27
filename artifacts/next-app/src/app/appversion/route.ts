import { NextResponse } from "next/server";

// Changes every time Next.js restarts / a new build deploys.
// Using process.env.BUILD_TIMESTAMP lets you inject a build-time value;
// falling back to startup time is enough for the stale-cache detector.
const BUILD_ID = process.env.BUILD_TIMESTAMP ?? Date.now().toString();

export function GET() {
  return NextResponse.json(
    { v: BUILD_ID },
    { headers: { "Cache-Control": "no-store" } }
  );
}
