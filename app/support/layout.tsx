import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/metadata";
import SupportStructuredData from "@/components/seo/SupportStructuredData";

const SITE_NAME = "TrendsMart";

export const metadata: Metadata = {
  title: "Contact Support",
  description:
    "Reach the TrendsMart support team for order issues, merchant help, billing questions, or technical problems.",
  keywords: [
    "TrendsMart support",
    "contact TrendsMart",
    "merchant help",
    "order issue Pakistan",
  ],
  alternates: { canonical: absoluteUrl("/support") },
  openGraph: {
    title: `Support — ${SITE_NAME}`,
    description: "Submit a support ticket to the TrendsMart team.",
    url: absoluteUrl("/support"),
    siteName: SITE_NAME,
    locale: "en_PK",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `Support — ${SITE_NAME}`,
    description: "Contact TrendsMart customer and merchant support.",
  },
};

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SupportStructuredData />
      {children}
    </>
  );
}
