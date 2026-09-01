import type { Metadata } from "next";
import LegalPageLayout, { LegalSection, LegalList } from "@/components/LegalPageLayout";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Refund & Order Policy",
  "Trends Mart refund, cancellation, and order dispute policy for customers and merchants.",
  "/legal/refund-policy",
);

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout title="Refund & Order Policy" icon="↩️" lastUpdated="August 8, 2026">
      <LegalSection heading="1. Order Cancellation">
        <p>
          Orders can typically be cancelled while in the <strong>Pending</strong> status, before the
          merchant begins processing. Once an order moves to <strong>Processing</strong> or later,
          cancellation is at the merchant&apos;s discretion — contact the merchant directly (via the
          WhatsApp thread from your order) as soon as possible.
        </p>
      </LegalSection>

      <LegalSection heading="2. Refunds">
        <p>
          Because payment is arranged directly between the customer and the merchant (e.g., cash on
          delivery or bank transfer), refunds are processed by the merchant according to their own
          store policy. TrendsMart facilitates dispute resolution but does not hold customer funds
          and cannot directly issue refunds on a merchant&apos;s behalf.
        </p>
      </LegalSection>

      <LegalSection heading="3. Damaged, Wrong, or Missing Items">
        <LegalList
          items={[
            "Inspect your order upon delivery whenever possible.",
            "Contact the merchant within 24 hours of delivery for damaged, incorrect, or missing items, including photos where relevant.",
            "If the merchant is unresponsive after 48 hours, escalate the issue to TrendsMart Support with your order details.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Non-Returnable Categories">
        <p>
          Perishable goods, made-to-order items, and personal-care products are generally
          non-returnable unless defective on arrival, subject to the specific merchant&apos;s
          storefront policy.
        </p>
      </LegalSection>

      <LegalSection heading="5. Delivery Fees & Minimum Order Amounts">
        <p>
          Each merchant may set their own minimum order amount and delivery fee slabs (including
          free delivery above a threshold, and distance-based charges for orders placed near the
          edge of their delivery radius). These are shown at checkout before you confirm your order.
        </p>
      </LegalSection>

      <LegalSection heading="6. Dispute Escalation">
        <p>
          If a merchant does not resolve your issue satisfactorily, submit a ticket via our{" "}
          <a href="/support" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Support Desk
          </a>{" "}
          with your order ID, and our team will review the case and may take action on the
          merchant&apos;s account per our{" "}
          <a href="/legal/merchant-guidelines" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Merchant Security Guidelines
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
