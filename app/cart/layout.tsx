import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Cart",
  "Your shopping cart on Trends Mart.",
);

export default function CartLayout({ children }: { children: ReactNode }) {
  return children;
}
