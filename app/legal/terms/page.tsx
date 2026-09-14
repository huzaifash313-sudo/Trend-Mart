import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Terms & Conditions",
  "The terms and conditions governing use of the Trends Mart marketplace on trendsmart.pk.",
  "/legal/terms",
);

export default function TermsPage() {
  return <LegalDocView doc="terms" />;
}
