import { ShopCardGridSkeleton } from "@/components/Skeletons";
import PageLoadingShell from "@/components/PageLoadingShell";

export default function HomeLoading() {
  return (
    <PageLoadingShell>
      <div className="mb-4 h-10 w-full max-w-md animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
        ))}
      </div>
      <ShopCardGridSkeleton count={8} />
    </PageLoadingShell>
  );
}
