import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Account",
  "Manage your Trends Mart account.",
);

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
