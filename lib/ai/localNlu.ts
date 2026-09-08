/* API-free NLU — intent + search query + category from local rules.
   Maximised for Roman Urdu + English. Zero API cost. */

import { normalizeUserLanguage, detectLikelyCategory } from "@/lib/ai/languageNormalize";
import { extractProductQuery, looksLikeProductSearch } from "@/lib/ai/queryExtract";
import { detectSortMode } from "@/lib/ai/queryExpand";
import { isOutOfScope } from "@/lib/ai/honestReply";

export type LocalIntent =
  | "greeting"
  | "brand_owner"
  | "policy"
  | "how_it_works"
  | "product_search"
  | "shop_search"
  | "category_browse"
  | "order_help"
  | "cart_help"
  | "deals"
  | "account_help"
  | "merchant_help"
  | "delivery_help"
  | "support"
  | "page_help"
  | "out_of_scope"
  | "unclear";

export interface LocalNluResult {
  intent: LocalIntent;
  searchQuery: string;
  categoryHint?: string;
  sortMode: ReturnType<typeof detectSortMode>;
  confidence: number;
  normalizedMessage: string;
}

// ── Intent patterns (Roman Urdu + English mixed) ────────────────────────────

const GREETING = /^(hi|hello|hey|salam|aoa|assalam o?alaikum?|assalamualaikum|hello ji|salam ji|ji|ok|okay|thanks|shukriya|shukria|jazakallah|theek|thx|ty|haan|haan ji|na|nahi|achi|achha|good|great)[\s!.?,]*$/i;

const OWNER =
  /(owner|founder|ceo|malik|banaya|banane wala|kis ne banay?a|kisne banaya|who (made|created|owns|built)|huzaifa|creator|developer|app kis ne|platform kis ne|trendsmart ka owner|kaun hai owner)/i;

const POLICY =
  /(terms|privacy|refund|return|cancel|cancellation|policy|guidelines|shartain|wapis|paisa wapas|legal|dispute|wapsi|exchange|niyam)/i;

const HOW =
  /(kaise kaam|how (does |it |this )?work|tareeqa|tareeka|process|step by step|guide|tutorial|shuruat kaise|kaise use|kaise istemaal|kaise chalata|kaise chalta|use karne ka|kaise chalao)/i;

const ORDER_STATUS =
  /(mera order|my order|order status|order kahan|order track|track(ing)? order|order dispatched|order delivered|order pending|order ka status|order update|order abhi|order ka kya|kahan hai mera)/i;

const ORDER_HOW =
  /(order kaise|kaise order|place order|order karna hai|order lagana|order de dena|khareedna hai|khareed lena|buy karna|purchase karna|order flow|checkout karna|checkout kaise)/i;

const CART =
  /\b(cart|basket|mer[ea] cart|cart mein|cart me|cart ka|add to cart|cart se|cart khali|cart mein kya|cart items?)\b/i;

const DEALS =
  /(deal|discount|offer|sale|sasta|promo|% off|markdown|chut|choot|ucheema|cheap|affordable|best price|low price|kam daam|sab se sasta|best offer|best deal|aaj ka offer|limited offer|flash sale)/i;

const ACCOUNT =
  /(account|login|sign in|sign up|otp|password|profile|register|signup|sign-in|sign-out|logout|forgot password|email verify|email confirm|verification)/i;

const MERCHANT =
  /(merchant|dukan(daar)?|store register|become merchant|apni shop|meri shop|seller banna|vendor|dashboard|qr code|analytics|low stock|best sell|apna store|register shop|shop khol|apna business|dukaan register|shop banana)/i;

const DELIVERY =
  /(deliver(y)?|delivery fee|delivery charge|kitni delivery|delivery cost|radius|ghar pe|address|doorstep|free delivery|min(imum)? order|per km|delivery kitni|shipping)/i;

const SUPPORT =
  /(support|complaint|ticket|help desk|masla|problem|issue|contact trendsmart|help chahiye|madad chahiye|koi masla|problem hai|shikayat|report)/i;

const SHOP_FIND =
  /(shop|dukan|dukaan|store|vendor|seller|kahan hai|kahan milega|near me|qareeb|nazdik|nearby|local shop|mere pass wali|mere qareeb)/i;

const CATEGORY_WORDS =
  /(grocery|kiryana|sabzi|fashion|clothing|clothes|electronic(s)?|phone|mobile|laptop|pharmacy|medical|restaurant|bakery|cake|sweets|mithai|toys|khilona|sports|beauty|salon|furniture|automotive|car|handmade|repair|security|service|food|pizza|burger|biryani|shoes|footwear|watch|accessories|jewelry|books|stationery)/i;

const WISHLIST =
  /(wishlist|wish list|saved|save karna|favourite|favorite|pasand|dil mein|baad mein|bookmark)/i;

const PAYMENT =
  /(payment|pay karna|pay kaise|pay method|cod|cash on delivery|online payment|paisa kaise|paisa bhejein|jazzcash|easypaisa|bank transfer)/i;

// ── Runner ───────────────────────────────────────────────────────────────────

export function runLocalNlu(rawMessage: string): LocalNluResult {
  const lang = normalizeUserLanguage(rawMessage);
  const text = lang.normalized.length >= 2 ? lang.normalized : rawMessage.trim();
  const lower = text.toLowerCase();
  const rawLower = rawMessage.toLowerCase().trim();
  const sortMode = detectSortMode(rawMessage);
  const categoryHint = lang.likelyCategory ?? detectLikelyCategory(rawMessage);

  // ── 0. Out-of-scope fast-path (zero API waste) ─────────────────────────
  if (isOutOfScope(rawLower) && !/(shop|dukan|product|order|cart|deal|trendsmart)/i.test(rawLower)) {
    return {
      intent: "out_of_scope",
      searchQuery: "",
      sortMode,
      confidence: 0.97,
      normalizedMessage: text,
    };
  }

  // ── 1. Greeting ────────────────────────────────────────────────────────
  if (GREETING.test(rawMessage.trim())) {
    return { intent: "greeting", searchQuery: "", sortMode, confidence: 0.97, normalizedMessage: text };
  }

  // ── 2. Brand / owner ──────────────────────────────────────────────────
  if (OWNER.test(rawLower)) {
    return { intent: "brand_owner", searchQuery: "", sortMode, confidence: 0.99, normalizedMessage: text };
  }

  // ── 3. Policy / legal ─────────────────────────────────────────────────
  if (POLICY.test(rawLower)) {
    return { intent: "policy", searchQuery: "", categoryHint, sortMode, confidence: 0.93, normalizedMessage: text };
  }

  // ── 4. How it works ───────────────────────────────────────────────────
  if (HOW.test(rawLower)) {
    return { intent: "how_it_works", searchQuery: "", sortMode, confidence: 0.92, normalizedMessage: text };
  }

  // ── 5. Cart ───────────────────────────────────────────────────────────
  if (CART.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    return { intent: "cart_help", searchQuery: "", sortMode, confidence: 0.93, normalizedMessage: text };
  }

  // ── 6. Delivery fees/rules (before order-status so "delivery fee" ≠ tracking)
  if (DELIVERY.test(rawLower)) {
    return { intent: "delivery_help", searchQuery: "", sortMode, confidence: 0.92, normalizedMessage: text };
  }

  // ── 7. Payment ────────────────────────────────────────────────────────
  if (PAYMENT.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    return { intent: "how_it_works", searchQuery: "", sortMode, confidence: 0.88, normalizedMessage: text };
  }

  // ── 8. Order tracking/status ──────────────────────────────────────────
  if (ORDER_STATUS.test(rawLower)) {
    return { intent: "order_help", searchQuery: "", sortMode, confidence: 0.93, normalizedMessage: text };
  }

  // ── 9. How to order ───────────────────────────────────────────────────
  if (ORDER_HOW.test(rawLower)) {
    return { intent: "how_it_works", searchQuery: "", sortMode, confidence: 0.91, normalizedMessage: text };
  }

  // ── 10. Wishlist ──────────────────────────────────────────────────────
  if (WISHLIST.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    return { intent: "account_help", searchQuery: "", sortMode, confidence: 0.88, normalizedMessage: text };
  }

  // ── 11. Support ───────────────────────────────────────────────────────
  if (SUPPORT.test(rawLower)) {
    return { intent: "support", searchQuery: "", sortMode, confidence: 0.91, normalizedMessage: text };
  }

  // ── 12. Account / auth ────────────────────────────────────────────────
  if (ACCOUNT.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    return { intent: "account_help", searchQuery: "", sortMode, confidence: 0.89, normalizedMessage: text };
  }

  // ── 13. Merchant / seller ────────────────────────────────────────────
  if (MERCHANT.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    return { intent: "merchant_help", searchQuery: "", sortMode, confidence: 0.9, normalizedMessage: text };
  }

  // ── 14. Deals (only when no specific product keyword present) ─────────
  if (DEALS.test(rawLower) && !/(specific product|mobile model|laptop model|brand name)/i.test(rawLower)) {
    const q = extractProductQuery(text) ?? "";
    return {
      intent: "deals",
      searchQuery: q,
      categoryHint,
      sortMode: sortMode === "relevance" ? "best_deal" : sortMode,
      confidence: 0.88,
      normalizedMessage: text,
    };
  }

  // ── 15. Shop search ───────────────────────────────────────────────────
  if (SHOP_FIND.test(rawLower) && !looksLikeProductSearch(rawLower)) {
    const q = extractProductQuery(text) ?? text.slice(0, 40);
    return { intent: "shop_search", searchQuery: q, categoryHint, sortMode, confidence: 0.89, normalizedMessage: text };
  }

  // ── 16. Category browse ───────────────────────────────────────────────
  if (CATEGORY_WORDS.test(rawLower) && /(category|section|dikhao|browse|shops?|dukan|list|all)/i.test(rawLower)) {
    return {
      intent: "category_browse",
      searchQuery: extractProductQuery(text) ?? categoryHint ?? text.slice(0, 40),
      categoryHint,
      sortMode,
      confidence: 0.87,
      normalizedMessage: text,
    };
  }

  // ── 17. Product search ────────────────────────────────────────────────
  if (looksLikeProductSearch(text) || looksLikeProductSearch(rawMessage)) {
    const q = extractProductQuery(text) ?? extractProductQuery(rawMessage) ?? text.slice(0, 50);
    return { intent: "product_search", searchQuery: q, categoryHint, sortMode, confidence: 0.91, normalizedMessage: text };
  }

  // ── 18. Weak product guess (multi-token message with meaningful word) ──
  const extracted = extractProductQuery(text);
  if (extracted && extracted.length >= 3) {
    return { intent: "product_search", searchQuery: extracted, categoryHint, sortMode, confidence: 0.74, normalizedMessage: text };
  }

  // ── 19. Category hint only ────────────────────────────────────────────
  if (categoryHint) {
    return { intent: "category_browse", searchQuery: categoryHint, categoryHint, sortMode, confidence: 0.72, normalizedMessage: text };
  }

  // ── 20. Truly unclear ─────────────────────────────────────────────────
  return {
    intent: "unclear",
    searchQuery: extracted ?? text.slice(0, 40),
    categoryHint,
    sortMode,
    confidence: 0.45,
    normalizedMessage: text,
  };
}
