"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import DashboardNavbar from "@/components/DashboardNavbar";
import DashboardNavSmooth from "@/components/DashboardNavSmooth";

/** Merchant chrome — skipped on immersive POS so the register can fill the screen. */
export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname === "/dashboard/pos" || pathname.startsWith("/dashboard/pos/");

  if (isPos) {
    return <>{children}</>;
  }

  return (
    <>
      <DashboardNavbar />
      <DashboardNavSmooth />
      <div className="tm-route-fade">{children}</div>
    </>
  );
}
