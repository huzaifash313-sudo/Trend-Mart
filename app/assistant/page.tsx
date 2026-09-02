import AiAssistantChat from "@/components/ai/AiAssistantChat";
import { generateTrendBotJsonLd } from "@/lib/seo/trendBotJsonLd";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

export const metadata = {
  title: `${TREND_BOT_NAME} — Free AI Shopping Assistant | TrendsMart`,
  description:
    "TrendBot — TrendsMart ka free AI assistant. Product links, deals, shops, orders help. Try: best mobile ka link do. No API key, live marketplace data.",
  keywords: [
    "TrendBot",
    "TrendsMart AI",
    "shopping assistant Pakistan",
    "local marketplace AI",
    "product search Gujranwala",
  ],
  openGraph: {
    title: `${TREND_BOT_NAME} | TrendsMart`,
    description: "Free AI assistant — product links, deals & shop finder. Urdu / English.",
  },
};

export default function PublicAssistantPage() {
  const jsonLd = generateTrendBotJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AiAssistantChat
        role="customer"
        title={TREND_BOT_NAME}
        subtitle="Product links, deals & shop finder — no sign-in required."
        accentClass="from-emerald-600 via-teal-600 to-teal-500"
        backHref="/"
        backLabel="← Home"
      />
    </>
  );
}
