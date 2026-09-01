import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Sign Up",
  "Create your Trends Mart account on trendsmart.pk.",
);

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
