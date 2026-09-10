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
      <ShopPageClient id={decoded} initialSeo={initialSeo} />
    </>
  );
}
