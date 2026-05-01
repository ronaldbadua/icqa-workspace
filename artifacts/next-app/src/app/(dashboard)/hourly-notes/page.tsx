import { Suspense } from "react";
import { PageHero } from "@/components/dashboard/page-hero";
import { HourlyNotesPanel } from "@/components/dashboard/hourly-notes-panel";
import { ChatThreadPanel } from "@/components/dashboard/chat-thread-panel";
import { toDateStringLocal } from "@/lib/hourly-notes-logic";
import {
  getAssociateLoginsForWorkspace,
  getHourlyNotesForDate,
  getChatMessages,
  isSupabaseConfigured,
} from "@/lib/data/queries";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function defaultDate() {
  return toDateStringLocal(new Date());
}

function PanelFallback() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">Loading hourly notes…</p>
    </div>
  );
}

function DbSetupBanner({ message }: { message: string }) {
  const isSchemaCache = message.includes("schema cache") || message.includes("hourly_notes");
  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold mb-1">Database setup required</p>
      {isSchemaCache ? (
        <>
          <p className="mb-2">
            The <strong>hourly_notes</strong> table does not exist yet in your database. Open your{" "}
            <strong>Supabase project → SQL Editor</strong>, paste and run the SQL below, then refresh this page:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-amber-100 px-4 py-3 font-mono text-xs leading-relaxed text-amber-900">
{`CREATE TABLE IF NOT EXISTS hourly_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_date DATE NOT NULL,
  hour INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT 'ICQA Team',
  manager_comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (note_date, hour)
);

NOTIFY pgrst, 'reload schema';`}
          </pre>
        </>
      ) : (
        <p>{message}</p>
      )}
    </div>
  );
}

export default async function HourlyNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : defaultDate();

  const hasConfig = isSupabaseConfigured();

  // Load hourly notes + chat messages + associate logins + user session in parallel
  const [{ rows, error }, { messages }, associateLogins, supabase] = await Promise.all([
    getHourlyNotesForDate(date),
    getChatMessages(),
    getAssociateLoginsForWorkspace(),
    createServerSupabaseClient(),
  ]);

  const userRes = supabase ? await supabase.auth.getUser() : null;
  const currentUserId = userRes?.data.user?.id ?? "";
  const currentUserEmail = userRes?.data.user?.email ?? "ICQA Team";

  const dbError = error && error !== "missing_config" ? error : null;
  const hasSupabase = hasConfig && !dbError;

  return (
    <>
      <PageHero
        kicker="Hourly Associate Feedback and Concern"
        title="ICQA Dashboard"
        pill="Hourly Notes"
      />
      {dbError ? <DbSetupBanner message={dbError} /> : null}

      {/* Two-column layout: hourly notes left, live chat right */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        {/* Left — Hourly Notes */}
        <div className="min-w-0">
          <Suspense fallback={<PanelFallback />}>
            <HourlyNotesPanel
              key={date}
              initialDate={date}
              rows={rows}
              hasSupabase={hasSupabase}
              associateLogins={associateLogins}
            />
          </Suspense>
        </div>

        {/* Right — Live Chat */}
        <div className="min-w-0">
          <ChatThreadPanel
            initialMessages={messages}
            hasSupabase={hasConfig}
            currentUserId={currentUserId}
            currentUserName={currentUserEmail}
          />
        </div>
      </div>
    </>
  );
}
