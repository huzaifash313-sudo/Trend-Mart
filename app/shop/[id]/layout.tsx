import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchShopForSeoByReference } from "@/lib/seo/fetchShopForSeo";
import { generateShopReferenceMetadata } from "@/lib/seo/shopMetadata";
import { getShopSeoPath, isUuid } from "@/lib/seo/shopSlug";
import ShopStructuredData from "@/components/seo/ShopStructuredData";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return generateShopReferenceMetadata(id);
}

export default async function ShopLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);
  const shop = await fetchShopForSeoByReference(decoded);

  if (shop && isUuid(decoded) && shop.slug?.trim()) {
    redirect(getShopSeoPath(shop));
  }

  return (
    <>
      {shop ? <ShopStructuredData shop={shop} /> : null}
      {children}
    </>
  );
}
