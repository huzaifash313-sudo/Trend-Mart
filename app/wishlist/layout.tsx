import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Wishlist",
  "Your saved items on Trends Mart.",
);

export default function WishlistLayout({ children }: { children: ReactNode }) {
  return children;
}
