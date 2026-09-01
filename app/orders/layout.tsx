import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Orders",
  "View and track your Trends Mart orders.",
);

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return children;
}
