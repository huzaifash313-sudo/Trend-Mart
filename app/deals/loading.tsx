import { ProductGridSkeleton } from "@/components/Skeletons";
import PageLoadingShell from "@/components/PageLoadingShell";

export default function DealsLoading() {
  return (
    <PageLoadingShell>
      <div className="mb-4 h-8 w-40 animate-pulse rounded bg-amber-100 dark:bg-amber-950/40" />
      <ProductGridSkeleton count={8} />
    </PageLoadingShell>
  );
}
