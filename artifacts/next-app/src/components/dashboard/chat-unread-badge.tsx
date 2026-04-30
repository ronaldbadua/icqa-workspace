"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { markChatAsRead } from "@/app/actions/chat";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Props {
  userId: string;
  initialCount: number;
}

async function fetchUnreadCount(userId: string): Promise<number> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return 0;
  try {
    const { data: readData } = await supabase
      .from("chat_reads")
      .select("last_read_at")
      .eq("user_id", userId)
      .maybeSingle();
    const lastReadAt = readData?.last_read_at ?? "1970-01-01T00:00:00Z";
    const { count } = await supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .gt("created_at", lastReadAt)
      .neq("user_id", userId);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export function ChatUnreadBadge({ userId, initialCount }: Props) {
  const pathname = usePathname();
  const [count, setCount] = useState(initialCount);
  const isOnChatRef = useRef(false);

  // Track whether user is currently on the chat page
  const isOnChat = pathname === "/chat" || pathname.startsWith("/chat/");
  useEffect(() => {
    isOnChatRef.current = isOnChat;
  }, [isOnChat]);

  // When user navigates to /chat: clear badge + mark as read
  useEffect(() => {
    if (isOnChat) {
      setCount(0);
      void markChatAsRead(userId);
    }
  }, [isOnChat, userId]);

  // On mount: refresh the count from Supabase
  const refresh = useCallback(async () => {
    if (isOnChatRef.current) { setCount(0); return; }
    const n = await fetchUnreadCount(userId);
    if (!isOnChatRef.current) setCount(n);
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Realtime subscription: increment when someone else sends a message
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    let channel: RealtimeChannel | null = null;
    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = () => {
      if (destroyed) return;
      channel = supabase
        .channel(`icqa_unread_${userId}_${Date.now()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "chat_messages" },
          (payload) => {
            const msg = payload.new as { user_id: string };
            // Only count messages from OTHER users, and only when not viewing chat
            if (msg.user_id !== userId && !isOnChatRef.current) {
              setCount((c) => c + 1);
            }
          }
        )
        .subscribe((status) => {
          if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            if (!destroyed) {
              reconnectTimer = setTimeout(() => {
                if (channel) void supabase.removeChannel(channel);
                subscribe();
              }, 4000);
            }
          }
        });
    };

    subscribe();
    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Polling fallback: re-sync every 8 s so the count is always accurate
  useEffect(() => {
    const id = setInterval(() => { void refresh(); }, 8000);
    return () => clearInterval(id);
  }, [refresh]);

  if (count <= 0) return null;

  return (
    <span
      className="ml-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
      aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
