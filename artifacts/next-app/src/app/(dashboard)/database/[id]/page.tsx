import { notFound } from "next/navigation";
import Link from "next/link";
import { getDatabaseSourceDocument, isSupabaseConfigured } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

function highlightText(text: string, query: string): string {
  if (!query.trim() || !text) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(
    regex,
    `<mark class="bg-yellow-200 text-slate-900 rounded px-0.5 font-medium">$1</mark>`
  );
}

export default async function DatabaseEntryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { q = "" } = await searchParams;

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-rose-600">Supabase is not configured. Please check your environment variables.</p>
      </div>
    );
  }

  const { focusEntry, allEntries, sourceFile, error } = await getDatabaseSourceDocument(id);

  if (error && error !== "missing_config") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (!focusEntry) notFound();

  const backHref = q ? `/database?q=${encodeURIComponent(q)}` : "/database";
  const docName = sourceFile ?? "Source Document";
  const importedDate = new Date(focusEntry.created_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl">
      {/* Back link */}
      <Link
        href={backHref}
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        {q ? `Back to results for "${q}"` : "Back to Database"}
      </Link>

      {/* Document header */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <svg className="h-5 w-5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h1 className="text-lg font-bold text-slate-900 break-all">{docName}</h1>
          </div>
          <p className="pl-7 text-xs text-slate-500">
            Imported {importedDate} · {allEntries.length} section{allEntries.length !== 1 ? "s" : ""}
            {q && <> · Keyword: <span className="font-semibold text-slate-700">"{q}"</span></>}
          </p>
        </div>
        {q && (
          <span className="flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            Matched: {q}
          </span>
        )}
      </div>

      {/* Full document — all sections */}
      <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
        {allEntries.map((entry, idx) => {
          const isFocus = entry.id === id;
          const labelHtml = q ? highlightText(entry.label, q) : entry.label;
          const notesHtml = q ? highlightText(entry.notes ?? "", q) : (entry.notes ?? "");

          return (
            <div
              key={entry.id}
              id={`section-${entry.id}`}
              className={[
                "border-b border-slate-100 last:border-b-0",
                isFocus
                  ? "bg-amber-50 ring-2 ring-inset ring-amber-300"
                  : idx % 2 === 0 ? "bg-white" : "bg-slate-50/50",
              ].join(" ")}
            >
              {/* Section label / heading */}
              <div className="px-6 pt-5 pb-2 flex items-start gap-2">
                {isFocus && (
                  <span className="mt-0.5 flex-shrink-0 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    Match
                  </span>
                )}
                <h2
                  className="text-sm font-bold text-slate-900 leading-snug"
                  dangerouslySetInnerHTML={{ __html: labelHtml }}
                />
              </div>

              {/* Section body */}
              <div className="px-6 pb-5">
                {entry.notes ? (
                  <div
                    className="text-sm text-slate-700 whitespace-pre-line leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: notesHtml }}
                  />
                ) : (
                  <p className="text-xs text-slate-400 italic">—</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom back link */}
      <div className="mt-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 hover:text-sky-700 hover:underline"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {q ? `Back to results for "${q}"` : "Back to Database"}
        </Link>
      </div>

      {/* Auto-scroll to matched section */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              var el = document.getElementById("section-${id}");
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            })();
          `,
        }}
      />
    </div>
  );
}
