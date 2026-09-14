import type { ReactNode } from "react";
import DashboardShell from "@/components/DashboardShell";
import { generateDashboardMetadata } from "@/lib/metadata";

export const metadata = generateDashboardMetadata();

/* Shared shell for every /dashboard/* route — merchant chrome + progress cue. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
