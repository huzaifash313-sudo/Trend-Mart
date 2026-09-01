import type { Metadata } from "next";
import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...generateNoIndexMetadata("Dine-In Menu", "QR dine-in menu on Trends Mart."),
  robots: { index: false, follow: false, noarchive: true },
};

export default function DineInLayout({ children }: { children: ReactNode }) {
  return <div className="tm-dine-in-shell">{children}</div>;
}
