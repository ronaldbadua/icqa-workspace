"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";

type Msg = { id: string; body: string; author_name: string; user_id: string; created_at: string };
type SendResult = { ok: true; message: Msg } | { ok: false; error: string };
type ActionResult = { ok: true } | { ok: false; error: string };

async function getClient() {
  return createAdminSupabaseClient() ?? await createServerSupabaseClient();
}

export async function sendChatMessage(
  body: string,
  authorName: string,
  userId: string
): Promise<SendResult> {
  const supabase = await getClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Message cannot be empty." };

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({ body: text, author_name: authorName.trim() || "ICQA Team", user_id: userId })
    .select("id, body, author_name, user_id, created_at")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true, message: data as Msg };
}

export async function markChatAsRead(userId: string): Promise<ActionResult> {
  if (!userId) return { ok: false, error: "No user." };
  const supabase = await getClient();
  if (!supabase) return { ok: false, error: "Supabase not configured." };
  const { error } = await supabase
    .from("chat_reads")
    .upsert({ user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteChatMessage(id: string): Promise<ActionResult> {
  const supabase = await getClient();
  if (!supabase) return { ok: false, error: "Supabase is not configured on the server." };
  const { error } = await supabase.from("chat_messages").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true };
}
