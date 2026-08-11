import { ProductGridSkeleton } from "@/components/Skeletons";
import PageLoadingShell from "@/components/PageLoadingShell";

export default function ProductsLoading() {
  return (
    <PageLoadingShell>
      <div className="mb-4 h-10 w-full max-w-lg animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <ProductGridSkeleton count={8} />
    </PageLoadingShell>
  );
}
