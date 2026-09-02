/* Helpful guided replies — always useful, never dead-end "can't answer" */

import { TRENDSMART_OWNER_NAME } from "@/lib/ai/brandKnowledge";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

export const MIN_PRODUCT_SCORE = 24;
export const MIN_SHOP_SCORE = 22;
export const MIN_KNOWLEDGE_CONFIDENCE = 0.5;
export const MIN_ANSWER_CONFIDENCE = 0.52;

export function buildHelpfulGuideReply(options?: {
  reason?: "unclear" | "no_match" | "out_of_scope" | "low_confidence";
  query?: string;
  role?: "customer" | "merchant" | "shop";
  topCategories?: string[];
}): {
  reply: string;
  intent: string;
  confidence: number;
  suggestions: string[];
} {
  const reason = options?.reason ?? "unclear";
  const q = options?.query ? `"${options.query.slice(0, 40)}"` : "aapki query";
  const role = options?.role ?? "customer";
  const cats = options?.topCategories?.slice(0, 4).join(", ");

  const suggestions =
    role === "merchant"
      ? ["Meri shop ki live summary", "Best selling product?", "Pending orders?", "Growth tips"]
      : [
          "TrendsMart ka owner kaun hai?",
          "Order kaise karun?",
          "Best mobile ka link do",
          "Refund policy?",
        ];

  if (reason === "out_of_scope") {
    return {
      intent: "helpful_redirect",
      confidence: 0.88,
      suggestions,
      reply:
        `🙂 Main *TrendsMart* ka assistant hoon — general duniya ke topics nahi, lekin app ki *har cheez* guide kar sakta hoon.\n\n` +
        `*Owner:* ${TRENDSMART_OWNER_NAME}\n\n` +
        `Pooch sakte hain:\n` +
        `• Products / shops / deals links\n` +
        `• Order, cart, delivery, refund, privacy, terms\n` +
        `• Merchant setup, QR, discounts, analytics\n\n` +
        `Try: *"TrendsMart kaise kaam karta hai?"* ya *"best mobile ka link do"*\n\n` +
        `👉 [Products](/products) · [FAQ](/faq) · [Support](/support)`,
    };
  }

  if (reason === "no_match") {
    return {
      intent: "helpful_guide",
      confidence: 0.86,
      suggestions,
      reply:
        `🔍 *${q}* ka exact catalog match abhi nahi mila — lekin main madad karta hoon:\n\n` +
        `1️⃣ [Products search](/products?q=${encodeURIComponent(options?.query?.slice(0, 40) || "")})\n` +
        `2️⃣ [Deals](/deals) · [FAQ](/faq)\n` +
        `3️⃣ Clear naam likhein (jaise brand + item)\n` +
        (cats ? `\n🔥 Abhi chal raha: *${cats}*\n` : "\n") +
        `\n*Ya poochhein:*\n` +
        `• "TrendsMart ka owner?" → *${TRENDSMART_OWNER_NAME}*\n` +
        `• "Order kaise karun?"\n` +
        `• "Refund policy?"\n\n` +
        `_${TREND_BOT_NAME} — app guide + live search ready._`,
    };
  }

  // unclear / low_confidence — still teach the app
  return {
    intent: "helpful_guide",
    confidence: 0.84,
    suggestions,
    reply:
      `🤝 Samajh gaya ke aap TrendsMart use karna chahte hain — main clear guide karta hoon.\n\n` +
      `*Owner / Founder:* ${TRENDSMART_OWNER_NAME}\n\n` +
      `*Jaldi madad:*\n` +
      `• Shopping: product naam likhein → main link dhoondta hoon\n` +
      `• Order flow: cart → checkout → Open WhatsApp\n` +
      `• Policies: Terms, Privacy, Refund, Merchant Guidelines\n` +
      `• Merchant: become-merchant → products → dashboard\n\n` +
      `👉 [Kaise kaam karta hai](/faq) · [Terms](/legal/terms) · [Refund](/legal/refund-policy) · [Support](/support)\n\n` +
      `_${TREND_BOT_NAME} — har app sawal ka jawab dene ke liye ready._`,
  };
}

/** @deprecated alias — kept so older imports don't break */
export const buildHonestRefuseReply = buildHelpfulGuideReply;

export function isOutOfScope(message: string): boolean {
  const t = message.toLowerCase();
  return /(who is the prime minister|write essay|homework|exam|bitcoin price|stock market tip|medical diagnosis|prescribe|hack|crack password|nsfw|porn)/i.test(
    t,
  );
}
