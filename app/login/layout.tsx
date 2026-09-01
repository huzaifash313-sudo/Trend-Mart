import type { ReactNode } from "react";
import { generateAuthMetadata } from "@/lib/metadata";

export const metadata = generateAuthMetadata();

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
