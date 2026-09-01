import type { ReactNode } from "react";
import AdminLayoutShell from "@/components/AdminLayoutShell";
import { generateAdminMetadata } from "@/lib/metadata";

export const metadata = generateAdminMetadata();

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
