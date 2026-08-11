import type { Metadata } from "next";
import { generateDealsMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateDealsMetadata();

export default function DealsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
