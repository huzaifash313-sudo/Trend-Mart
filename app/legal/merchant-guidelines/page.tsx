import type { Metadata } from "next";
import LegalPageLayout, { LegalSection, LegalList } from "@/components/LegalPageLayout";

export const metadata: Metadata = {
  title: "Merchant Security Guidelines — TrendsMart",
  description: "Security and conduct guidelines every TrendsMart merchant must follow.",
  robots: { index: true, follow: true },
};

export default function MerchantGuidelinesPage() {
  return (
    <LegalPageLayout title="Merchant Security Guidelines" icon="🛡️" lastUpdated="August 8, 2026">
      <LegalSection heading="1. Going Live">
        <p>
          When you register a store with a verified email, it goes live on the
          marketplace immediately — there is no Super-Admin approval wait. Keep
          your store details accurate (name, category, WhatsApp, logo). TrendsMart
          may still suspend stores that violate these guidelines without notice.
        </p>
      </LegalSection>

      <LegalSection heading="2. Account Security">
        <LegalList
          items={[
            "Use a strong, unique password for your merchant account and never share your login credentials.",
            "Keep your registered WhatsApp number active and monitored — this is how customer orders reach you.",
            "Report any suspicious activity on your account (e.g., products you didn't list) to Support immediately.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. Product Listing Integrity">
        <LegalList
          items={[
            "List only products/services you can actually fulfill. Keep the availability toggle accurate — mark items Out of Stock instead of leaving them listed as available.",
            "Original/markdown pricing (\"% OFF\" badges) must reflect a genuine prior price, not an inflated \"before\" price used to fake a discount.",
            "Do not list counterfeit, stolen, hazardous, or platform-prohibited goods.",
            "Upload real product photos. Do not use misleading stock photos for physical goods you sell.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Delivery & Service Radius">
        <p>
          Set your delivery/service radius honestly to reflect the area you can realistically serve.
          Repeatedly accepting orders you cannot fulfill within your stated radius, minimum order
          amount, or delivery slabs may result in a suspension.
        </p>
      </LegalSection>

      <LegalSection heading="5. Customer Communication">
        <LegalList
          items={[
            "Respond to customer inquiries and orders promptly and professionally.",
            "Do not use customer contact information obtained through TrendsMart for unsolicited marketing outside the platform.",
            "Update order status (Pending → Processing → Dispatched → Delivered) promptly so customers can track their order.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="6. Data & Image Uploads">
        <p>
          Only upload images you own the rights to. Uploaded media is automatically compressed and
          converted to WebP for storage efficiency — do not attempt to bypass or abuse the upload
          pipeline (e.g., uploading non-product files, excessively large files, or scripts).
        </p>
      </LegalSection>

      <LegalSection heading="7. Enforcement">
        <p>
          Violations of these guidelines may result in a warning, temporary suspension (store hidden
          from customers), or permanent removal from the Platform, at TrendsMart&apos;s sole
          discretion. Serious violations (fraud, counterfeit goods, harassment) may be reported to
          relevant authorities.
        </p>
      </LegalSection>

      <LegalSection heading="8. Questions">
        <p>
          Need help setting up your store correctly? See our{" "}
          <a href="/faq" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            New Merchant Guide &amp; FAQ
          </a>{" "}
          or reach out via{" "}
          <a href="/support" className="font-medium text-emerald-600 underline dark:text-emerald-400">
            Support
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
