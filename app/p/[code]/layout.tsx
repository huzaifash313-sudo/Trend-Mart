import type { Metadata } from "next";
import ProductStructuredData from "@/components/seo/ProductStructuredData";
import { fetchProductForSeoByCode } from "@/lib/seo/fetchProductForSeo";
import { generateProductCodeMetadata } from "@/lib/seo/productMetadata";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return generateProductCodeMetadata(decodeURIComponent(code));
}

export default async function ProductShortLinkLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const product = await fetchProductForSeoByCode(decodeURIComponent(code));

  return (
    <>
      {product ? <ProductStructuredData product={product} /> : null}
      {children}
    </>
  );
}
