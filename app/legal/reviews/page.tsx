import type { Metadata } from "next";
import LegalDocView from "@/components/LegalDocView";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Review & Rating Policy",
  "How product and store reviews work on TrendsMart — eligibility, honesty rules, and merchant replies.",
  "/legal/reviews",
);

export default function ReviewPolicyPage() {
  return <LegalDocView doc="reviews" />;
}
