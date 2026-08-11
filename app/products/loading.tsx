import { ProductGridSkeleton } from "@/components/Skeletons";

export default function ProductsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4">
      <div className="mb-4 h-10 w-full max-w-lg animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <ProductGridSkeleton count={8} />
    </div>
  );
}
