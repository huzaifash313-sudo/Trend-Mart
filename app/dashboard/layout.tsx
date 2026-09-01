import type { ReactNode } from "react";
import DashboardNavSmooth from "@/components/DashboardNavSmooth";
import { generateDashboardMetadata } from "@/lib/metadata";

export const metadata = generateDashboardMetadata();

/* Shared shell for every /dashboard/* route — keeps nav warm + shows a
   lightweight progress cue so page switches never feel frozen. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardNavSmooth />
      <div className="tm-route-fade">{children}</div>
    </>
  );
}
