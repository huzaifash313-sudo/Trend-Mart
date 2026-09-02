/* API-free NLU — intent + search query + category from local rules */

import { normalizeUserLanguage, detectLikelyCategory } from "@/lib/ai/languageNormalize";
import { extractProductQuery, looksLikeProductSearch } from "@/lib/ai/queryExtract";
import { detectSortMode } from "@/lib/ai/queryExpand";

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
  | "unclear";

export interface LocalNluResult {
  intent: LocalIntent;
  searchQuery: string;
  categoryHint?: string;
  sortMode: ReturnType<typeof detectSortMode>;
  confidence: number;
  normalizedMessage: string;
}

const GREETING =
  /^(hi|hello|hey|salam|aoa|assalam|assalamualaikum|hello ji|salam ji|ok|thanks|shukriya|jazakallah)[\s!.?]*$/i;

const OWNER =
  /(owner|founder|ceo|malik|banaya|banane wala|kis ne|kisne|who (made|created|owns)|huzaifa|creator|developer|app kis|platform kis)/i;

const POLICY =
  /(terms|privacy|refund|return|cancel|policy|guidelines|shartain|wapis|paisa wapas|legal|dispute)/i;

const HOW =
  /(kaise kaam|how (it |does )?work|tareeqa|tareeka|process|step by step|guide|tutorial|shuruat|kaise use)/i;

const ORDER =
  /(order|checkout|track|tracking|mera order|my order|status|dispatched|delivered|pending)/i;

const CART = /\b(cart|basket|mer[ea] cart|cart mein|add to cart)\b/i;

const DEALS = /(deal|discount|offer|sale|sasta|promo|% off|markdown|chut)/i;

const ACCOUNT = /(account|login|sign|otp|password|profile|register|signup)/i;

const MERCHANT =
  /(merchant|dukan|store register|become merchant|dashboard|qr code|analytics|low stock|best sell)/i;

const DELIVERY = /(deliver|delivery|radius|ghar|address|doorstep|free delivery|min order)/i;

const SUPPORT = /(support|complaint|ticket|help desk|masla|contact trendsmart)/i;

const SHOP_FIND = /(shop|dukan|dukaan|store|vendor|seller|kahan (hai|milega)|near me|qareeb)/i;

const CATEGORY_WORDS =
  /(grocery|kiryana|sabzi|fashion|electronic|pharmacy|restaurant|bakery|sweets|toys|sports|beauty|furniture|automotive|handmade|repair|security|service)/i;

export function runLocalNlu(rawMessage: string): LocalNluResult {
  const lang = normalizeUserLanguage(rawMessage);
  const text = lang.normalized.length >= 2 ? lang.normalized : rawMessage.trim();
  const lower = text.toLowerCase();
  const sortMode = detectSortMode(rawMessage);
  const categoryHint = lang.likelyCategory ?? detectLikelyCategory(rawMessage);

  if (GREETING.test(rawMessage.trim())) {
    return {
      intent: "greeting",
      searchQuery: "",
      sortMode,
      confidence: 0.97,
      normalizedMessage: text,
    };
  }

  if (OWNER.test(lower)) {
    return {
      intent: "brand_owner",
      searchQuery: "",
      sortMode,
      confidence: 0.99,
      normalizedMessage: text,
    };
  }

  if (POLICY.test(lower)) {
    return {
      intent: "policy",
      searchQuery: "",
      categoryHint,
      sortMode,
      confidence: 0.93,
      normalizedMessage: text,
    };
  }

  if (HOW.test(lower)) {
    return {
      intent: "how_it_works",
      searchQuery: "",
      sortMode,
      confidence: 0.92,
      normalizedMessage: text,
    };
  }

  if (CART.test(lower) && !looksLikeProductSearch(lower)) {
    return {
      intent: "cart_help",
      searchQuery: "",
      sortMode,
      confidence: 0.92,
      normalizedMessage: text,
    };
  }

  if (ORDER.test(lower) && !/(order kar|place order|order kaise)/i.test(lower)) {
    // status-ish vs how-to: how-to caught below via knowledge
    if (/(status|track|mera order|my order|kahan hai order|dispatched|delivered)/i.test(lower)) {
      return {
        intent: "order_help",
        searchQuery: "",
        sortMode,
        confidence: 0.9,
        normalizedMessage: text,
      };
    }
  }

  if (SUPPORT.test(lower)) {
    return {
      intent: "support",
      searchQuery: "",
      sortMode,
      confidence: 0.9,
      normalizedMessage: text,
    };
  }

  if (ACCOUNT.test(lower) && !looksLikeProductSearch(lower)) {
    return {
      intent: "account_help",
      searchQuery: "",
      sortMode,
      confidence: 0.88,
      normalizedMessage: text,
    };
  }

  if (MERCHANT.test(lower) && !looksLikeProductSearch(lower)) {
    return {
      intent: "merchant_help",
      searchQuery: "",
      sortMode,
      confidence: 0.88,
      normalizedMessage: text,
    };
  }

  if (DELIVERY.test(lower) && !looksLikeProductSearch(lower)) {
    return {
      intent: "delivery_help",
      searchQuery: "",
      sortMode,
      confidence: 0.88,
      normalizedMessage: text,
    };
  }

  if (DEALS.test(lower) && !/(mobile|phone|laptop|burger|pizza|shirt)/i.test(lower)) {
    return {
      intent: "deals",
      searchQuery: extractProductQuery(text) ?? "",
      categoryHint,
      sortMode: sortMode === "relevance" ? "best_deal" : sortMode,
      confidence: 0.86,
      normalizedMessage: text,
    };
  }

  if (SHOP_FIND.test(lower) && !looksLikeProductSearch(lower)) {
    const q = extractProductQuery(text) ?? text.slice(0, 40);
    return {
      intent: "shop_search",
      searchQuery: q,
      categoryHint,
      sortMode,
      confidence: 0.88,
      normalizedMessage: text,
    };
  }

  if (CATEGORY_WORDS.test(lower) && /(category|section|dikhao|browse|shops?|dukan)/i.test(lower)) {
    return {
      intent: "category_browse",
      searchQuery: extractProductQuery(text) ?? categoryHint ?? text.slice(0, 40),
      categoryHint,
      sortMode,
      confidence: 0.87,
      normalizedMessage: text,
    };
  }

  if (looksLikeProductSearch(text) || looksLikeProductSearch(rawMessage)) {
    const q = extractProductQuery(text) ?? extractProductQuery(rawMessage) ?? text.slice(0, 50);
    return {
      intent: "product_search",
      searchQuery: q,
      categoryHint,
      sortMode,
      confidence: 0.9,
      normalizedMessage: text,
    };
  }

  // Any multi-token message with a meaningful word → treat as product/catalog attempt
  const extracted = extractProductQuery(text);
  if (extracted && extracted.length >= 3) {
    return {
      intent: "product_search",
      searchQuery: extracted,
      categoryHint,
      sortMode,
      confidence: 0.72,
      normalizedMessage: text,
    };
  }

  if (categoryHint) {
    return {
      intent: "category_browse",
      searchQuery: categoryHint,
      categoryHint,
      sortMode,
      confidence: 0.7,
      normalizedMessage: text,
    };
  }

  return {
    intent: "unclear",
    searchQuery: extracted ?? text.slice(0, 40),
    categoryHint,
    sortMode,
    confidence: 0.45,
    normalizedMessage: text,
  };
}
