import { NextResponse } from "next/server";
import { requireAuthenticatedSupabase } from "@/lib/api/require-session";
import {
  deleteDatabaseEntry,
  getDatabaseEntryById,
  updateDatabaseEntry,
} from "@/lib/services/database-entries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAuthenticatedSupabase();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "bad_request", message: "Missing id." }, { status: 400 });
  }
  const { data, error } = await getDatabaseEntryById(auth.supabase, id);
  if (error) {
    return NextResponse.json(
      { error: "query_failed", message: error },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json({ error: "not_found", message: "Entry not found." }, { status: 404 });
  }
  return NextResponse.json({ item: data });
}

export async function PATCH(request: Request, context: Ctx) {
  const auth = await requireAuthenticatedSupabase();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "bad_request", message: "Missing id." }, { status: 400 });
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
  const { error } = await updateDatabaseEntry(auth.supabase, id, { label, notes, data: body.data });
  if (error) {
    return NextResponse.json(
      { error: "update_failed", message: error },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAuthenticatedSupabase();
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "bad_request", message: "Missing id." }, { status: 400 });
  }
  const { error } = await deleteDatabaseEntry(auth.supabase, id);
  if (error) {
    return NextResponse.json(
      { error: "delete_failed", message: error },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
