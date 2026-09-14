import type { ReactNode } from "react";
import DashboardNavbar from "@/components/DashboardNavbar";
import DashboardNavSmooth from "@/components/DashboardNavSmooth";
import { generateDashboardMetadata } from "@/lib/metadata";

export const metadata = generateDashboardMetadata();

/* Shared shell for every /dashboard/* route — merchant chrome + progress cue. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <DashboardNavbar />
      <DashboardNavSmooth />
      <div className="tm-route-fade">{children}</div>
    </>
  );
}
