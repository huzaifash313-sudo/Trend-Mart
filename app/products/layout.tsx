import type { Metadata } from "next";
import { generateProductsMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateProductsMetadata();

export default function ProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
