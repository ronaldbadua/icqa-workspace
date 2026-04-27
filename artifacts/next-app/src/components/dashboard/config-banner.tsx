export function ConfigBanner() {
  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
    >
      <p className="font-medium">Supabase environment variables are missing</p>
      <p className="mt-1 text-amber-800/90">
        Create <code className="rounded bg-amber-100/80 px-1">.env.local</code> with{" "}
        <code className="rounded bg-amber-100/80 px-1">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="rounded bg-amber-100/80 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
        , then run the SQL migration in the Supabase SQL editor (see <code>README</code>).
      </p>
    </div>
  );
}
