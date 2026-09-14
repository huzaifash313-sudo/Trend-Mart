import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Merchant Security Guidelines",
  "Security and conduct guidelines every Trends Mart merchant must follow on trendsmart.pk.",
  "/legal/merchant-guidelines",
);

export default function MerchantGuidelinesPage() {
  return <LegalDocView doc="merchant-guidelines" />;
}
