import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AuthResult =
  | { ok: true; supabase: SupabaseClient<Database>; user: User }
  | { ok: false; response: NextResponse };

export async function requireAuthenticatedSupabase(): Promise<AuthResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "not_configured", message: "Supabase is not configured on the server." },
        { status: 503 }
      ),
    };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized", message: "Sign in required." }, { status: 401 }),
    };
  }
  return { ok: true, supabase, user };
}
