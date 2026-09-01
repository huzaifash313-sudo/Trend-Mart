import type { ReactNode } from "react";
import { generateSupportMetadata } from "@/lib/metadata";

export const metadata = generateSupportMetadata();

export default function SupportLayout({ children }: { children: ReactNode }) {
  return children;
}
