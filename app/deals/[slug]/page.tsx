import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import DealDetailClient from "@/components/deal/DealDetailClient";
import DealStructuredData from "@/components/seo/DealStructuredData";
import {
  fetchDealForSeoBySlug,
  getDealPrimaryImageUrl,
} from "@/lib/seo/fetchDealForSeo";
import { generateDealSlugMetadata } from "@/lib/seo/dealMetadata";
import { buildProductImageAlt } from "@/lib/seo/imageAlt";
import { getShopPath } from "@/lib/shopSlug";
import { formatRupees, getProductDiscount } from "@/lib/formatters";
import { getSafeImageUrl } from "@/services/storageService";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return generateDealSlugMetadata(decodeURIComponent(slug));
}

export default async function DealSeoPage({ params }: PageProps) {
  const { slug } = await params;
  const deal = await fetchDealForSeoBySlug(decodeURIComponent(slug));

  if (!deal) {
    notFound();
  }

  const gallery = (() => {
    const fromImages = Array.isArray(deal.images)
      ? deal.images.filter((u): u is string => typeof u === "string" && !!u.trim())
      : [];
    if (fromImages.length) return fromImages;
    const primary = getDealPrimaryImageUrl(deal);
    return primary ? [primary] : [];
  })();

  const imageAlt = buildProductImageAlt(deal.title, {
    location: deal.shop.location,
  });
  const shopHref = getShopPath({
    id: deal.shop.id,
    name: deal.shop.name,
    slug: deal.shop.slug,
  });
  const discount = getProductDiscount({
    price: typeof deal.price === "number" ? deal.price : 0,
    original_price:
      typeof deal.original_price === "number" ? deal.original_price : null,
  });

  return (
    <>
      <DealStructuredData deal={deal} />
      <div className="mx-auto w-full max-w-lg pb-10">
        {/* Image-first gallery (same idea as PDP) */}
        <div className="relative overflow-hidden bg-zinc-100 dark:bg-zinc-900">
          {gallery.length > 0 ? (
            <div className="flex aspect-square snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {gallery.map((url, i) => (
                <div
                  key={`${deal.id}-img-${i}`}
                  className="relative h-full w-full min-w-full shrink-0 snap-center"
                >
                  <Image
                    src={getSafeImageUrl(url, "product")}
                    alt={
                      gallery.length > 1
                        ? `${imageAlt} (${i + 1}/${gallery.length})`
                        : imageAlt
                    }
                    fill
                    priority={i === 0}
                    className="object-contain"
                    sizes="(max-width: 640px) 100vw, 32rem"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center bg-zinc-100 dark:bg-zinc-800">
              <span className="text-5xl text-zinc-300 dark:text-zinc-600">
                {deal.title.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <Link
            href="/deals"
            className="absolute left-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-800 shadow-md backdrop-blur-sm dark:bg-zinc-900/90 dark:text-zinc-100"
            aria-label="Back to deals"
          >
            ←
          </Link>

          {discount.hasDiscount && discount.discountPercent > 0 ? (
            <span className="absolute right-3 top-3 z-10 rounded-full bg-rose-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">
              {discount.discountPercent}% OFF
            </span>
          ) : null}

          {gallery.length > 1 ? (
            <span className="absolute bottom-3 right-3 z-10 rounded bg-zinc-950/70 px-2 py-0.5 text-[10px] font-semibold text-white">
              Swipe · {gallery.length} photos
            </span>
          ) : null}
        </div>

        {/* Compact details under image */}
        <article className="space-y-2 px-3 pt-3">
          <h1 className="text-[1.15rem] font-bold leading-snug tracking-tight text-zinc-900 dark:text-zinc-50">
            {deal.title}
          </h1>
          {deal.description ? (
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {deal.description}
            </p>
          ) : null}
          {typeof deal.price === "number" && deal.price > 0 ? (
            <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatRupees(deal.price)}
              {typeof deal.original_price === "number" &&
              deal.original_price > deal.price ? (
                <span className="ml-2 text-sm font-normal text-zinc-400 line-through">
                  {formatRupees(deal.original_price)}
                </span>
              ) : null}
            </p>
          ) : null}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            From{" "}
            <Link
              href={shopHref}
              className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              {deal.shop.name}
            </Link>
            {deal.shop.location ? ` · ${deal.shop.location}` : ""}
          </p>
        </article>

        {/* Actions + related — no duplicate big card */}
        <div className="px-3">
          <DealDetailClient dealId={deal.id} hideCard />
        </div>
      </div>
    </>
  );
}
