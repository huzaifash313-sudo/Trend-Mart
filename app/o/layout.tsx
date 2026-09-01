import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Order Summary",
  "Private order summary on Trends Mart.",
);

export default function OrderSummaryLayout({ children }: { children: ReactNode }) {
  return children;
}
