import type { ReactNode } from "react";
import { generateNoIndexMetadata } from "@/lib/metadata";

export const metadata = generateNoIndexMetadata(
  "Forgot Password",
  "Reset your Trends Mart account password.",
);

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
