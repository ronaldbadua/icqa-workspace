import { notFound } from "next/navigation";
import Link from "next/link";
import { getDatabaseEntry, isSupabaseConfigured } from "@/lib/data/queries";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ q?: string }>;
}

function highlightText(text: string, query: string) {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(regex, `<mark class="bg-yellow-200 text-slate-900 rounded px-0.5 font-medium">$1</mark>`);
}

export default async function DatabaseEntryPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { q = "" } = await searchParams;
  const hasConfig = isSupabaseConfigured();

  if (!hasConfig) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-rose-600">Supabase is not configured. Please check your environment variables.</p>
      </div>
    );
  }

  const { entry, error } = await getDatabaseEntry(id);

  if (error && error !== "missing_config") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-rose-600">{error}</p>
      </div>
    );
  }

  if (!entry) notFound();

  const labelHtml = q ? highlightText(entry.label, q) : entry.label;
  const notesHtml = q ? highlightText(entry.notes ?? "", q) : (entry.notes ?? "");

  const backHref = q ? `/database?q=${encodeURIComponent(q)}` : "/database";

  return (
    <div className="mx-auto max-w-3xl">
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

      {/* Header pill */}
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Source Document
        </span>
        <span className="text-xs text-slate-400">
          {new Date(entry.updated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </span>
      </div>

      {/* Content card */}
      <div className="overflow-hidden rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
        {/* Title */}
        <div className="border-b border-slate-100 bg-slate-50 px-6 py-5">
          <h1
            className="text-xl font-bold text-slate-900 leading-snug"
            dangerouslySetInnerHTML={{ __html: labelHtml }}
          />
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {entry.notes ? (
            <div
              className="text-sm text-slate-700 whitespace-pre-line leading-relaxed"
              dangerouslySetInnerHTML={{ __html: notesHtml }}
            />
          ) : (
            <p className="text-sm text-slate-400 italic">No additional content for this record.</p>
          )}
        </div>
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
    </div>
  );
}
