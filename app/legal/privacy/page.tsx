import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Privacy Policy",
  "How Trends Mart collects, uses, and protects your personal data on trendsmart.pk.",
  "/legal/privacy",
);

export default function PrivacyPage() {
  return <LegalDocView doc="privacy" />;
}
