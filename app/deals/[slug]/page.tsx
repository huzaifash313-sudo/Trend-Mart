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
import { formatRupees } from "@/lib/formatters";
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

  const imageUrl = getDealPrimaryImageUrl(deal);
  const imageAlt = buildProductImageAlt(deal.title, {
    location: deal.shop.location,
  });
  const shopHref = getShopPath({
    id: deal.shop.id,
    name: deal.shop.name,
    slug: deal.shop.slug,
  });

  return (
    <>
      <DealStructuredData deal={deal} />
      <div className="mx-auto w-full max-w-lg px-3 py-3 pb-8">
        <div className="mb-3">
          <Link
            href="/deals"
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            ← All deals
          </Link>
        </div>

        <article className="mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {deal.title}
          </h1>
          {deal.description ? (
            <p className="mt-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {deal.description}
            </p>
          ) : null}
          {typeof deal.price === "number" && deal.price > 0 ? (
            <p className="mt-2 text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {formatRupees(deal.price)}
              {typeof deal.original_price === "number" &&
              deal.original_price > deal.price ? (
                <span className="ml-2 text-sm font-normal text-zinc-400 line-through">
                  {formatRupees(deal.original_price)}
                </span>
              ) : null}
            </p>
          ) : null}
          {imageUrl ? (
            <div className="relative mt-3 aspect-square overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-800">
              <Image
                src={getSafeImageUrl(imageUrl, "product")}
                alt={imageAlt}
                fill
                priority
                className="object-contain"
                sizes="(max-width: 640px) 100vw, 32rem"
              />
            </div>
          ) : null}
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            From{" "}
            <Link href={shopHref} className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400">
              {deal.shop.name}
            </Link>
            {deal.shop.location ? ` · ${deal.shop.location}` : ""}
          </p>
        </article>

        <DealDetailClient dealId={deal.id} />
      </div>
    </>
  );
}
