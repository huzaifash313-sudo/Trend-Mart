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
  if (!t || t.length < 4) return false;

  // ── Hard in-scope anchors — always stay in app ────────────────────────────
  if (
    /(trendsmart|trend\s*mart|trendbot|trend bot|shopping|shop|dukan|dukandar|product|order|cart|checkout|delivery|refund|merchant|whatsapp|coupon|deal|wishlist|dashboard|qr code|payment|cod|cash on delivery)/i.test(t)
  ) {
    return false;
  }

  // ── Politics / government / current affairs ───────────────────────────────
  if (
    /(prime minister|wazir azam|president of pakistan|imran khan|pm modi|narendra modi|donald trump|joe biden|government|parliament|assembly|election|vote|voter|imf pakistan|dollar rate|rupee rate|forex|exchange rate|petrol price|petrol kitna|petrol rate|diesel rate|inflation|economy pakistan|budget pakistan|gdp|news kya hai|khabar|breaking news|current affair|army|military|ispr|isi\b|raw\b|establishment|martial law|constitution|fir|police case|fir kaise|thana|darj)/i.test(t)
  ) {
    return true;
  }

  // ── Health / medical ──────────────────────────────────────────────────────
  if (
    /(medical diagnosis|diagnose|prescribe|doctor advice|doctor se|hospital|dawai batao|medicine for|tablet batao|injection|surgery|bimari|beemar hoon|fever ka|bukhar ka|dard ka|dawa kya|symptoms of|disease|cancer|diabetes|blood pressure|sugar level|pregnancy test|covid|vaccination|vaccine|mental health|depression ka|anxiety ka|psychiatrist)/i.test(t)
  ) {
    return true;
  }

  // ── Finance / crypto / stock ──────────────────────────────────────────────
  if (
    /(bitcoin|crypto (price|invest|buy)|ethereum|binance|nft|stock market|share market tip|mutual fund|forex trading|trading tips|gold rate today|gold price today|sensex|nifty|psx index|invest in stocks|bonds khariden|real estate invest|property invest)/i.test(t)
  ) {
    return true;
  }

  // ── Entertainment / celebrity / sports scores ─────────────────────────────
  if (
    /(cricket score|match score|football score|ipl score|psl score|fifa|world cup score|who won match|man city|real madrid|barcelona|celebrity gossip|actor ka|actress ka|drama review|film review|movie review|bollywood|lollywood|hollywood news|song lyrics|gana|mehfil|ost|drama ost)/i.test(t)
  ) {
    return true;
  }

  // ── Education / homework / essays ─────────────────────────────────────────
  if (
    /(write (an |a )?essay|homework|exam (paper|question)|past paper|matric paper|inter paper|fa paper|ba paper|thesis likhna|assignment likhna|translate (this|into|to)|translation of|english mein translate|urdu mein translate|explain (this )?(poem|stanza|chapter)|math (problem|solve)|mathematics|physics (question|solve)|chemistry|biology question|code (for|in) (python|java|c\+\+|javascript|html)|leetcode|hackerrank|programming kaise|data structure)/i.test(t)
  ) {
    return true;
  }

  // ── Personal / social / relationship ────────────────────────────────────
  if (
    /(girlfriend|boyfriend|love advice|pyar|mohabbat|rishta|shadi kaise|shaadi advice|divorce|talaq|ladki patao|ladka patao|dosti|dost kaise|life advice|zindagi mein|personality develop|motivation quote|shayari|poetry likhna|poem likhna)/i.test(t)
  ) {
    return true;
  }

  // ── Weather / astrology ───────────────────────────────────────────────────
  if (
    /(weather (today|forecast|report|kaisa hai)|aaj mosam|barish hogi|temperature kitna|horoscope|zodiac|kundli|astrology|palmistry|future batao|qismat)/i.test(t)
  ) {
    return true;
  }

  // ── Hacking / illegal / harmful ───────────────────────────────────────────
  if (
    /(hack|crack password|facebook hack|whatsapp hack|account hack|phishing|malware|virus banana|nsfw|porn|adult content|sex|nude|18\+|gambling|jua|satta|lottery ticket|prize bond predict)/i.test(t)
  ) {
    return true;
  }

  // ── Religion / fatwa ─────────────────────────────────────────────────────
  if (
    /(fatwa|halal (or )?haram|namaz padhna|rakat|quran (tafsir|tarjuma)|hadith number|islamic ruling|sharia law|kya islam mein|kya quran mein)/i.test(t)
  ) {
    return true;
  }

  // ── Generic cooking / recipes (unrelated to food orders) ─────────────────
  if (
    /^(recipe for|how to (cook|bake|make) |biryani recipe|karahi recipe|daal recipe|roti kaise|sabzi kaise banain|cake banana|khana banana|ghar pe kaise banain).{0,40}$/i.test(t)
  ) {
    return true;
  }

  return false;
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
