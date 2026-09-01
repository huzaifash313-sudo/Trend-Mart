import ProductDetailClient from "@/components/product/ProductDetailClient";

export default async function ProductShortLinkPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <ProductDetailClient code={decodeURIComponent(code)} />;
}
