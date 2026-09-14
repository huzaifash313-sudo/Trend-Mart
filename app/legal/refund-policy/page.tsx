import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Refund & Order Policy",
  "Trends Mart refund, cancellation, and order dispute policy for customers and merchants.",
  "/legal/refund-policy",
);

export default function RefundPolicyPage() {
  return <LegalDocView doc="refund-policy" />;
}
