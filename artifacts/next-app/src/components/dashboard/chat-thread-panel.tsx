"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sendChatMessage, deleteChatMessage } from "@/app/actions/chat";

type Msg = { id: string; body: string; author_name: string; user_id: string; created_at: string };

interface Props {
  initialMessages: Msg[];
  hasSupabase: boolean;
  currentUserId: string;
  currentUserName: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function groupByDate(messages: Msg[]) {
  const groups: { date: string; messages: Msg[] }[] = [];
  for (const m of messages) {
    const label = formatDate(m.created_at);
    const last = groups[groups.length - 1];
    if (last && last.date === label) last.messages.push(m);
    else groups.push({ date: label, messages: [m] });
  }
  return groups;
}

function mergeMessages(prev: Msg[], incoming: Msg[]): Msg[] {
  const ids = new Set(prev.map((m) => m.id));
  const next = [...prev];
  for (const m of incoming) {
    if (!ids.has(m.id)) { next.push(m); ids.add(m.id); }
  }
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatThreadPanel({ initialMessages, hasSupabase, currentUserId, currentUserName }: Props) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesRef = useRef<Msg[]>(initialMessages);

  // keep ref in sync so closures always see fresh messages
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const scrollToEnd = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "instant" });
  }, []);

  useEffect(() => { scrollToEnd(false); }, [scrollToEnd]);

  const addMessages = useCallback((incoming: Msg[], scroll = true) => {
    setMessages((prev) => {
      const merged = mergeMessages(prev, incoming);
      if (merged.length !== prev.length && scroll) setTimeout(() => scrollToEnd(), 60);
      return merged;
    });
  }, [scrollToEnd]);

  // ── Fetch all messages from Supabase ─────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const { data, error: qErr } = await supabase
      .from("chat_messages")
      .select("id, body, author_name, user_id, created_at")
      .order("created_at", { ascending: true })
      .limit(200);
    if (qErr) { console.error("[chat] poll error:", qErr.message); return; }
    if (data && data.length > 0) addMessages(data as Msg[], false);
  }, [addMessages]);

  // ── Supabase Realtime subscription (with auto-reconnect) ─────────────────
  useEffect(() => {
    if (!hasSupabase) return;
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    let channel = supabase
      .channel("icqa_chat_v4", { config: { broadcast: { self: false } } })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        (payload) => {
          addMessages([payload.new as Msg]);
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages" },
        (payload) => {
          const o = payload.old as { id?: string };
          if (o.id) setMessages((prev) => prev.filter((m) => m.id !== o.id));
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          // Fetch once on successful subscription to catch any missed messages
          void fetchMessages();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          setRealtimeConnected(false);
        }
      });

    return () => {
      setRealtimeConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [hasSupabase, addMessages, fetchMessages]);

  // ── Polling fallback — 2 s interval, always on ───────────────────────────
  // Works regardless of whether Realtime is enabled in Supabase.
  // Messages are deduped so there's no flicker or duplication.
  useEffect(() => {
    if (!hasSupabase) return;
    void fetchMessages(); // immediate first poll
    const id = setInterval(fetchMessages, 2000);
    return () => clearInterval(id);
  }, [hasSupabase, fetchMessages]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const onSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!hasSupabase) { setError("Supabase is not configured."); return; }
    const t = body.trim();
    if (!t) return;
    setError(null);
    setBody("");
    inputRef.current?.focus();

    startTransition(async () => {
      try {
        const res = await sendChatMessage(t, currentUserName, currentUserId);
        if (!res.ok) { setError(res.error); setBody(t); return; }
        addMessages([res.message]);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // Stale deployment — reload to pick up new JS bundles
        if (msg.includes("Server Action") || msg.includes("deployment")) {
          window.location.reload();
          return;
        }
        setError(msg || "Failed to send message.");
        setBody(t);
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
  };

  const onDelete = (id: string) => {
    if (!hasSupabase) return;
    startTransition(async () => {
      const res = await deleteChatMessage(id);
      if (!res.ok) { setError(res.error); return; }
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
  };

  const groups = groupByDate(messages);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
      style={{ height: "calc(100vh - 220px)", minHeight: "480px" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200/80 bg-white px-5 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-600 text-sm font-bold text-white">IC</div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">ICQA Team Chat</p>
          <p className="text-xs text-slate-500">Manager &amp; associate real-time messaging</p>
        </div>
        {/* Realtime indicator */}
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${realtimeConnected ? "bg-emerald-500" : "bg-amber-400"}`} />
          <span className="text-[10px] text-slate-400">{realtimeConnected ? "Live" : "Polling"}</span>
        </div>
      </div>

      {/* Error banner */}
      {error ? (
        <div className="shrink-0 border-b border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-700">{error}</div>
      ) : null}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">No messages yet. Say hello to start the thread.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date}>
              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium text-slate-400">{group.date}</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="space-y-2">
                {group.messages.map((m) => {
                  const isMine = m.user_id === currentUserId;
                  return (
                    <div key={m.id} className={`group flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                      {!isMine ? (
                        <div className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-600 uppercase">
                          {m.author_name.charAt(0)}
                        </div>
                      ) : null}
                      <div className={`flex max-w-[72%] flex-col ${isMine ? "items-end" : "items-start"}`}>
                        {!isMine ? (
                          <span className="mb-1 px-1 text-xs font-semibold text-slate-500">{m.author_name}</span>
                        ) : null}
                        <div className={`relative rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                          isMine ? "rounded-br-sm bg-sky-600 text-white" : "rounded-bl-sm bg-slate-100 text-slate-900"
                        }`}>
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <button
                            type="button"
                            onClick={() => onDelete(m.id)}
                            disabled={pending}
                            className={`absolute -top-2 ${isMine ? "left-0 -translate-x-full pl-1" : "right-0 translate-x-full pr-1"} hidden rounded px-1 py-0.5 text-[10px] font-medium text-slate-400 hover:text-rose-500 group-hover:block`}
                          >✕</button>
                        </div>
                        <time suppressHydrationWarning className="mt-1 px-1 text-[10px] text-slate-400">{formatTime(m.created_at)}</time>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <form onSubmit={onSend} className="shrink-0 border-t border-slate-200/80 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={hasSupabase ? "Type a message… (Enter to send)" : "Supabase not configured"}
            disabled={!hasSupabase || pending}
            className="flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-500/20 disabled:opacity-60"
            style={{ maxHeight: "120px", overflowY: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            type="submit"
            disabled={!hasSupabase || pending || !body.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50"
            aria-label="Send message"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 -translate-x-px rotate-45">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-slate-400">
          Sending as <span className="font-medium">{currentUserName}</span> · Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}
