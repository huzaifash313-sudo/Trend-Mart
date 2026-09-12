import type { Metadata } from "next";
import { generateProductCodeMetadata } from "@/lib/seo/productMetadata";

type Props = { params: Promise<{ code: string }> };

/** Metadata still resolves for the brief hop; body always redirects to SEO path. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return generateProductCodeMetadata(decodeURIComponent(code));
}

export default function ProductShortLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
