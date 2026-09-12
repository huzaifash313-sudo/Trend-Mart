import Link from "next/link";
import ShopPageClient from "./ShopPageClient";
import { fetchShopForSeoByReference } from "@/lib/seo/fetchShopForSeo";
import { getSafeImageUrl } from "@/services/storageService";

export const revalidate = 120;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ShopDetailPage({ params }: PageProps) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const initialSeo = await fetchShopForSeoByReference(decoded);
  const bannerRaw = initialSeo?.banner_url?.trim();
  const bannerSrc = bannerRaw
    ? getSafeImageUrl(bannerRaw, "shop", "banner")
    : null;

  return (
    <>
      {bannerSrc && !bannerSrc.startsWith("data:") ? (
        <link rel="preload" as="image" href={bannerSrc} fetchPriority="high" />
      ) : null}
      {initialSeo ? (
        <div className="mx-auto w-full max-w-6xl px-3 pt-3">
          <header className="mb-2">
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-xl">
              {initialSeo.name}
            </h1>
            {initialSeo.store_bio ? (
              <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                {initialSeo.store_bio}
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {[initialSeo.category, initialSeo.location].filter(Boolean).join(" · ") ||
                  "Local shop on TrendsMart"}
              </p>
            )}
            <p className="mt-1 text-[11px] text-zinc-400">
              Shop on{" "}
              <Link href="/" className="font-semibold text-emerald-600 hover:underline">
                TrendsMart
              </Link>
              {" · "}Trends Mart Pakistan
            </p>
          </header>
        </div>
      ) : null}
      <ShopPageClient id={decoded} initialSeo={initialSeo} />
    </>
  );
}
