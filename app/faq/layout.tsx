import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/metadata";
import FaqStructuredData from "@/components/seo/FaqStructuredData";

const SITE_NAME = "TrendsMart";

export const metadata: Metadata = {
  title: "FAQ & Merchant Guide",
  description:
    "Answers for shoppers and new merchants on TrendsMart — ordering via WhatsApp, delivery, returns, product listing, shop QR codes, and more.",
  keywords: [
    "TrendsMart FAQ",
    "merchant guide",
    "WhatsApp ordering help",
    "local shopping Pakistan",
    "how to sell online",
  ],
  alternates: { canonical: absoluteUrl("/faq") },
  openGraph: {
    title: `FAQ & Merchant Guide — ${SITE_NAME}`,
    description:
      "Customer FAQs and step-by-step merchant onboarding on TrendsMart.",
    url: absoluteUrl("/faq"),
    siteName: SITE_NAME,
    locale: "en_PK",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `FAQ — ${SITE_NAME}`,
    description: "Help for customers and merchants on TrendsMart.",
  },
};

export default function FaqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <FaqStructuredData />
      {children}
    </>
  );
}
