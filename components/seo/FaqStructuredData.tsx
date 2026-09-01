import { ALL_FAQS } from "@/lib/content/faq";
import { absoluteUrl } from "@/lib/metadata";

const SITE_NAME = "TrendsMart";

export default function FaqStructuredData() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: ALL_FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
    url: absoluteUrl("/faq"),
    name: `${SITE_NAME} FAQ & Merchant Guide`,
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
