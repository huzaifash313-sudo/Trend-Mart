import type { Metadata } from "next";
import LegalPageLayout, { LegalSection, LegalList } from "@/components/LegalPageLayout";
import { generateLegalMetadata } from "@/lib/metadata";

export const metadata: Metadata = generateLegalMetadata(
  "Privacy Policy",
  "How Trends Mart collects, uses, and protects your personal data on trendsmart.pk.",
  "/legal/privacy",
);

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" icon="🔒" lastUpdated="August 8, 2026">
      <LegalSection heading="1. Information We Collect">
        <LegalList
          items={[
            <><strong>Account data</strong>: email address, phone number, and authentication metadata when you sign up or verify via OTP.</>,
            <><strong>Order data</strong>: name, phone number, delivery address, and order contents needed to fulfill an order.</>,
            <><strong>Location data</strong>: GPS coordinates or manually selected city/area, used only to show nearby shops and enforce merchant delivery radii — never sold to third parties.</>,
            <><strong>Merchant data</strong>: shop details, product listings, and uploaded images/logos/banners.</>,
            <><strong>Usage data</strong>: pages viewed, product clicks, and search queries, used to power analytics and the &quot;For You&quot; recommendation sorting.</>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="2. How We Use Your Information">
        <LegalList
          items={[
            "To operate the marketplace: matching customers with nearby shops, processing orders, and enabling WhatsApp-based order routing.",
            "To verify identity via email OTP at account creation / before checkout.",
            "To personalize search results, sorting, and recommendations.",
            "To detect fraud, abuse, and violations of our Terms & Conditions.",
            "To send transactional communications (order confirmations, status updates, OTP codes) via email/SMS/WhatsApp.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Data Sharing">
        <p>
          We share the minimum necessary order details (name, phone, delivery address, order
          contents) with the merchant fulfilling your order. We do not sell your personal data to
          third parties. We may share data with service providers strictly to operate the Platform
          (e.g., Supabase for database/auth hosting, Cloudinary for image storage, and our
          transactional email provider) under contractual confidentiality obligations.
        </p>
      </LegalSection>

      <LegalSection heading="4. Data Retention">
        <p>
          We retain account and order data for as long as your account is active or as needed to
          comply with legal obligations, resolve disputes, and enforce our agreements. You may
          request deletion of your account and associated personal data via the Support Desk,
          subject to any records we are legally required to keep.
        </p>
      </LegalSection>

      <LegalSection heading="5. Your Rights">
        <LegalList
          items={[
            "Access the personal data we hold about you.",
            "Correct inaccurate data via your account settings.",
            "Request deletion of your account and data.",
            "Withdraw location permission at any time via your device/browser settings.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Cookies & Local Storage">
        <p>
          TrendsMart uses local storage/session storage to persist your cart, theme preference, and
          location selection between visits. These are functional, not third-party advertising
          cookies.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We apply industry-standard safeguards — encrypted connections (HTTPS), Row Level Security
          on our database, and rate limiting on sensitive endpoints — to protect your data. No
          method of transmission or storage is 100% secure, and we encourage you to use a strong,
          unique password.
        </p>
      </LegalSection>

      <LegalSection heading="8. Contact">
        <p>
          For privacy questions or data requests, contact us via our{" "}
          <a href="/support" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Support Desk
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
