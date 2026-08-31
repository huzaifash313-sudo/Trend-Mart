import type { ReactNode } from "react";

/** QR dine-in routes are standalone — no global navbar, footer, or bottom nav. */
export default function DineInLayout({ children }: { children: ReactNode }) {
  return <div className="tm-dine-in-shell">{children}</div>;
}
