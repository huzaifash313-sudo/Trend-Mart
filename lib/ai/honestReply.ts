/* Honest replies — admit unknown; never invent fees, products, or policies */

import { TRENDSMART_OWNER_NAME } from "@/lib/ai/brandKnowledge";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

export const MIN_PRODUCT_SCORE = 28;
export const MIN_SHOP_SCORE = 26;
export const MIN_KNOWLEDGE_CONFIDENCE = 0.58;
export const MIN_ANSWER_CONFIDENCE = 0.55;

export function buildHonestRefuseReply(options?: {
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
  const q = options?.query ? `"${options.query.slice(0, 40)}"` : "ye sawal";
  const role = options?.role ?? "customer";

  const suggestions =
    role === "merchant"
      ? ["Meri shop ki live summary", "Pending orders?", "Growth tips", "Support"]
      : role === "shop"
        ? ["Available products?", "Order kaise karun?", "Message seller"]
        : [
            "Order kaise karun?",
            "Refund policy?",
            "Best deals kahan hain?",
            "Support",
          ];

  if (reason === "out_of_scope") {
    return {
      intent: "honest_refuse",
      confidence: 0.95,
      suggestions,
      reply:
        `🚫 Yeh sawal *TrendsMart app* se related nahi — is liye jawab nahi de sakta.\n\n` +
        `Main sirf in topics par help karta hoon:\n` +
        `• Shops / products / deals / cart / orders\n` +
        `• Delivery fees, policies, merchant dashboard\n` +
        `• App kaise kaam karti hai\n\n` +
        `App help: [FAQ](/faq) · [Support](/support)\n\n` +
        `_${TREND_BOT_NAME} — app ke bahar ke topics = irrelevant._`,
    };
  }

  if (reason === "no_match") {
    return {
      intent: "honest_refuse",
      confidence: 0.88,
      suggestions,
      reply:
        `🔍 *${q}* ka *confirmed* match abhi nahi mila — main galat product/fee invent nahi karunga.\n\n` +
        `Aap try karein:\n` +
        `1️⃣ Clear naam (brand + item)\n` +
        `2️⃣ [Products search](/products?q=${encodeURIComponent(options?.query?.slice(0, 40) || "")})\n` +
        `3️⃣ [Deals](/deals) · [Support](/support)\n\n` +
        `_${TREND_BOT_NAME} — nahi pata to seedha keh deta hoon._`,
    };
  }

  return {
    intent: "honest_refuse",
    confidence: 0.86,
    suggestions,
    reply:
      `🤝 Is sawal ka *confirmed* data mere paas nahi — is liye guess nahi kar raha.\n\n` +
      `*Owner / Founder:* ${TRENDSMART_OWNER_NAME}\n\n` +
      `Madad ke liye:\n` +
      `• Product naam likhein → main *live catalog* se link dunga\n` +
      `• Policies: [Terms](/legal/terms) · [Refund](/legal/refund-policy) · [Privacy](/legal/privacy)\n` +
      `• Insaan se baat: [Support](/support)\n\n` +
      `_${TREND_BOT_NAME} — galat jawab se behtar hai clear “nahi pata”._`,
  };
}

/** @deprecated — use buildHonestRefuseReply; kept for older imports */
export const buildHelpfulGuideReply = buildHonestRefuseReply;

/** Clear off-app / irrelevant topics — refuse instead of guessing. */
export function isOutOfScope(message: string): boolean {
  const t = message.toLowerCase().trim();
  if (!t) return false;

  // Explicit TrendsMart / shopping cues → stay in scope
  if (
    /(trendsmart|trend\s*mart|trendbot|shop|dukan|product|order|cart|checkout|delivery|refund|merchant|whatsapp|coupon|deal|wishlist|dashboard)/i.test(
      t,
    )
  ) {
    return false;
  }

  return (
    /(who is the prime minister|prime minister|president of|write (an )?essay|homework|exam (paper|question)|bitcoin|crypto (price|invest)|stock market|share market tip|medical diagnosis|prescribe|doctor advice|hack|crack password|nsfw|porn|adult content|weather (today|forecast)|cricket score|football score|recipe for|how to cook|translate this|code (for|in) (python|java|c\+\+)|leetcode|girlfriend|boyfriend|love advice|horoscope|lottery)/i.test(
      t,
    )
  );
}

/**
 * Ensure every assistant turn has a non-empty, app-scoped reply.
 * Never return blank — refuse instead.
 */
export function ensureAssistantReply(
  res: {
    reply: string;
    intent: string;
    confidence: number;
    suggestions?: string[];
    products?: unknown[];
    thinkingSteps?: string[];
    handoff?: unknown;
  },
  role: "customer" | "merchant" | "shop",
  query?: string,
): {
  reply: string;
  intent: string;
  confidence: number;
  suggestions?: string[];
  products?: unknown[];
  thinkingSteps?: string[];
  handoff?: unknown;
} {
  const text = typeof res.reply === "string" ? res.reply.trim() : "";
  if (text.length >= 8) return { ...res, reply: text };

  const refuse = buildHonestRefuseReply({
    reason: "unclear",
    query: query?.slice(0, 40),
    role,
  });
  return {
    ...res,
    reply: refuse.reply,
    intent: refuse.intent,
    confidence: refuse.confidence,
    suggestions: refuse.suggestions,
  };
}
