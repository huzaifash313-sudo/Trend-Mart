import { absoluteUrl } from "@/lib/metadata";

const SITE_NAME = "TrendsMart";

export default function SupportStructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: `${SITE_NAME} Support`,
    description:
      "Contact the TrendsMart platform team for order help, merchant onboarding, billing, or technical issues.",
    url: absoluteUrl("/support"),
    mainEntity: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        availableLanguage: ["English", "Urdu"],
        areaServed: "PK",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
