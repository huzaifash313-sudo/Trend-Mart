import type { Metadata } from "next";
import LegalPageLayout, { LegalSection, LegalList } from "@/components/LegalPageLayout";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Terms & Conditions",
  "The terms and conditions governing use of the Trends Mart marketplace on trendsmart.pk.",
  "/legal/terms",
);

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms & Conditions" icon="📜" lastUpdated="August 8, 2026">
      <LegalSection heading="1. Acceptance of Terms">
        <p>
          By creating an account, browsing shops, placing an order, or registering a store on
          TrendsMart (&quot;the Platform&quot;), you agree to be bound by these Terms &amp; Conditions.
          If you do not agree, please do not use the Platform.
        </p>
      </LegalSection>

      <LegalSection heading="2. What TrendsMart Is">
        <p>
          TrendsMart is a hyper-local multi-vendor marketplace that connects customers with
          independent merchants (&quot;Sellers&quot;) in their area. TrendsMart provides the technology —
          storefronts, product listings, search, cart, and WhatsApp-based order routing — but each
          Seller is solely responsible for the products or services they list, their pricing,
          stock availability, order fulfillment, and delivery.
        </p>
      </LegalSection>

      <LegalSection heading="3. Accounts & Roles">
        <LegalList
          items={[
            <>
              <strong>Guests</strong> may browse shops, categories, and products, and build a cart
              without creating an account.
            </>,
            <>
              <strong>Customers</strong> must create an account with their full name and phone
              number, and verify their email before an order is placed. Phone numbers are required
              contact/delivery details. Phone SMS OTP verification is not enabled at this time
              (email OTP only).
            </>,
            <>
              <strong>Merchants</strong> must complete store registration with business name and
              WhatsApp/phone number. New stores go live immediately after email verification
              (auto-approved). TrendsMart may later introduce a Super-Admin approval queue and may
              still suspend stores that violate these Terms.
            </>,
          ]}
        />
        <p>
          You are responsible for maintaining the confidentiality of your account credentials and
          for all activity that occurs under your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. Orders & Payments">
        <p>
          Orders placed through TrendsMart are compiled and sent to the relevant merchant (via
          WhatsApp and/or the in-app order system). Payment terms (cash on delivery, bank transfer,
          or other methods) are agreed directly between the customer and the merchant unless stated
          otherwise on the storefront. TrendsMart is not a party to the sale contract between buyer
          and seller and does not guarantee product quality, availability, or delivery timelines.
        </p>
      </LegalSection>

      <LegalSection heading="5. Merchant Obligations">
        <p>
          Merchants agree to list accurate product information and pricing, honor the availability
          status shown to customers, fulfill accepted orders in good faith, and comply with the{" "}
          <a href="/legal/merchant-guidelines" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Merchant Security Guidelines
          </a>{" "}
          at all times. TrendsMart reserves the right to suspend or remove any store that violates
          these Terms, engages in fraudulent activity, or receives repeated verified complaints.
        </p>
      </LegalSection>

      <LegalSection heading="6. Prohibited Use">
        <LegalList
          items={[
            "Listing counterfeit, stolen, illegal, or prohibited goods.",
            "Manipulating reviews, ratings, or analytics.",
            "Scraping, reverse-engineering, or attacking Platform infrastructure.",
            "Impersonating another person, shop, or the TrendsMart team.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="7. Limitation of Liability">
        <p>
          TrendsMart is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the
          maximum extent permitted by law, TrendsMart is not liable for indirect, incidental, or
          consequential damages arising from your use of the Platform, transactions with merchants,
          or third-party services (e.g., WhatsApp, payment providers, delivery riders).
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Continued use of the Platform after changes
          are posted constitutes acceptance of the revised Terms. Material changes will be
          highlighted on this page with an updated &quot;Last updated&quot; date.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>
          Questions about these Terms? Reach out via our{" "}
          <a href="/support" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Support Desk
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
