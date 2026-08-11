import { ProductGridSkeleton } from "@/components/Skeletons";

export default function DealsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
      <div className="mb-4 h-8 w-40 animate-pulse rounded bg-amber-100 dark:bg-amber-950/40" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
