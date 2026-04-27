import { NextResponse } from "next/server";
import { requireAuthenticatedSupabase } from "@/lib/api/require-session";
import { insertDatabaseEntry, listDatabaseEntries } from "@/lib/services/database-entries";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuthenticatedSupabase();
  if (!auth.ok) {
    return auth.response;
  }
  const { data, error } = await listDatabaseEntries(auth.supabase);
  if (error) {
    return NextResponse.json(
      { error: "query_failed", message: error },
      { status: 500 }
    );
  }
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedSupabase();
  if (!auth.ok) {
    return auth.response;
  }
  let body: { label?: unknown; notes?: unknown; data?: unknown };
  try {
    body = (await request.json()) as { label?: unknown; notes?: unknown; data?: unknown };
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }
  const label = typeof body.label === "string" ? body.label : "";
  const notes = typeof body.notes === "string" ? body.notes : "";
  const { data, error } = await insertDatabaseEntry(auth.supabase, { label, notes, data: body.data });
  if (error) {
    return NextResponse.json(
      { error: "insert_failed", message: error },
      { status: 400 }
    );
  }
  return NextResponse.json({ id: data?.id }, { status: 201 });
}
