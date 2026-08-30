import PageLoadingShell from "@/components/PageLoadingShell";

/** Instant skeleton while any /dashboard/* segment streams in. */
export default function DashboardLoading() {
  return (
    <PageLoadingShell>
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-emerald-200/70 dark:bg-emerald-900/40" />
            <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-full bg-emerald-200/80 dark:bg-emerald-900/40" />
        </div>

        <div className="h-16 animate-pulse rounded-2xl bg-emerald-100/80 dark:bg-emerald-950/30" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="h-9 w-9 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="h-10 w-20 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((__, j) => (
                  <div
                    key={j}
                    className="h-12 w-12 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800"
            />
          ))}
        </div>
      </div>
    </PageLoadingShell>
  );
}
