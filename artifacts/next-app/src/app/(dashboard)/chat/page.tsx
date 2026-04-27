import { PageHero } from "@/components/dashboard/page-hero";
import { ChatThreadPanel } from "@/components/dashboard/chat-thread-panel";
import { getChatMessages, isSupabaseConfigured } from "@/lib/data/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function DbSetupBanner({ message }: { message: string }) {
  const isMissingTable =
    message.includes("chat_messages") || message.includes("schema cache");
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold mb-1">Database setup required</p>
      {isMissingTable ? (
        <>
          <p className="mb-2">
            The <strong>chat_messages</strong> table does not exist yet. Open your{" "}
            <strong>Supabase project → SQL Editor</strong>, paste and run the SQL below, then
            refresh this page:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-amber-100 px-4 py-3 font-mono text-xs leading-relaxed text-amber-900">
{`CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  body        TEXT        NOT NULL,
  author_name TEXT        NOT NULL DEFAULT '',
  user_id     UUID        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages DISABLE ROW LEVEL SECURITY;

-- Enable real-time delivery for this table
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;`}
          </pre>
        </>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
}

export default async function ChatPage() {
  const supabase = await createServerSupabaseClient();
  const userRes = supabase ? await supabase.auth.getUser() : null;
  const currentUserId = userRes?.data.user?.id ?? "";
  const currentUserEmail = userRes?.data.user?.email ?? "ICQA Team";

  const { messages, error } = await getChatMessages();
  const hasConfig = isSupabaseConfigured();
  const dbError = error && error !== "missing_config" ? error : null;
  const hasSupabase = hasConfig && !dbError;

  return (
    <>
      <PageHero kicker="ICQA Team collaboration" title="ICQA Dashboard" pill="Chat Thread" />
      {dbError ? <DbSetupBanner message={dbError} /> : null}
      <ChatThreadPanel
        initialMessages={messages}
        hasSupabase={hasSupabase}
        currentUserId={currentUserId}
        currentUserName={currentUserEmail}
      />
    </>
  );
}
