/* TrendBot — page-aware tips, prompts, and soft voice lines */

export type TrendBotPageContext =
  | "home"
  | "deals"
  | "products"
  | "shop"
  | "cart"
  | "orders"
  | "merchant"
  | "general";

export function resolveTrendBotPageContext(pathname: string): TrendBotPageContext {
  const p = (pathname || "/").toLowerCase();
  if (p === "/" || p === "") return "home";
  if (p.startsWith("/deals")) return "deals";
  if (p.startsWith("/products") || p.startsWith("/p/") || p.startsWith("/search")) {
    return "products";
  }
  if (p.startsWith("/shop/")) return "shop";
  if (p.startsWith("/cart") || p.startsWith("/wishlist")) return "cart";
  if (p.startsWith("/orders") || p.startsWith("/o/")) return "orders";
  if (
    p.startsWith("/dashboard") ||
    p.startsWith("/account/become-merchant") ||
    p.includes("merchant")
  ) {
    return "merchant";
  }
  return "general";
}

interface PagePack {
  teasers: string[];
  /** Short lines safe for speechSynthesis (simple English / light Urdu). */
  voiceLines: string[];
  prompts: string[];
  welcomeHint: string;
}

const PAGE_PACKS: Record<TrendBotPageContext, PagePack> = {
  home: {
    teasers: [
      "🏠 Ghar pe ho — nearby shops ya best deals pooch lo!",
      "✨ Main TrendBot hoon — product link chahiye to naam likho!",
      "🛒 Browse karte raho — madad chahiye to tap!",
    ],
    voiceLines: [
      "Hey! Welcome. Ask me for nearby shops or product links.",
      "Hi friend! I can find cute deals for you.",
    ],
    prompts: [
      "Best deals kahan hain?",
      "Qareeb ki shops batao",
      "Best mobile ka link do",
      "Order kaise karun?",
      "Delivery fee kaise kaam karti hai?",
    ],
    welcomeHint: "Homepage pe ho — shops, deals, ya product links pooch sakte ho.",
  },
  deals: {
    teasers: [
      "🔥 Wooo deals! Konsa offer chahiye — batao!",
      "💥 Discount hunt? Main help karta hoon!",
      "🏷️ Deal samajh nahi aa rahi? Tap karke pooch lo!",
    ],
    voiceLines: [
      "Woo deals! Tell me what you want and I will pick the best.",
      "Nice discounts! Need my top tip?",
    ],
    prompts: [
      "Aaj ke best deals?",
      "Sab se bari discount kahan?",
      "Food deals dikhao",
      "Deal kaise claim karun?",
      "Free delivery wale deals?",
    ],
    welcomeHint: "Deals section — offers, discounts, aur kaise claim karna hai, sab pooch sakte ho.",
  },
  products: {
    teasers: [
      "📦 Product dhoond rahe ho? Naam likho — link dunga!",
      "🔎 Sasta / best pick? Main catalog se bataunga!",
      "✨ Filters confuse? Main clear guide karta hoon!",
    ],
    voiceLines: [
      "Looking for something? Say the name and I will find it.",
      "I can recommend the best match from live catalog.",
    ],
    prompts: [
      "Best mobile ka link do",
      "Sasta laptop dhundo",
      "Best deal product?",
      "Category kaise filter karun?",
      "Qareeb ke products?",
    ],
    welcomeHint: "Products pe ho — exact naam likho, main live catalog se link dunga.",
  },
  shop: {
    teasers: [
      "🏪 Is store ke products / delivery pooch sakte ho!",
      "💬 Timing, fees, order flow — main yahin help karta hoon!",
    ],
    voiceLines: [
      "This store looks good. Ask about products or delivery.",
      "Need help ordering from this shop?",
    ],
    prompts: [
      "Is shop ke products?",
      "Delivery fee kitni?",
      "Order kaise karun?",
      "Shop kab open hai?",
      "Min order kitna?",
    ],
    welcomeHint: "Store page — products, delivery rules, aur order steps yahan pooch sakte ho.",
  },
  cart: {
    teasers: [
      "🛒 Checkout stuck? Main order steps bataunga!",
      "📍 Location / delivery fee confuse? Tap karo!",
    ],
    voiceLines: [
      "Ready to checkout? I can explain delivery fees.",
      "Need help placing your WhatsApp order?",
    ],
    prompts: [
      "Checkout kaise karun?",
      "Delivery fee kaise calculate hoti hai?",
      "Coupon kaise lagaye?",
      "Pickup vs delivery?",
      "Min order kya hai?",
    ],
    welcomeHint: "Cart / checkout — fees, coupons, aur WhatsApp order flow clear kar sakte ho.",
  },
  orders: {
    teasers: [
      "📦 Order status? Main guide karta hoon!",
      "🚚 Tracking confuse? Tap karke pooch lo!",
    ],
    voiceLines: [
      "Need order help? Ask me about tracking.",
      "I can explain order statuses.",
    ],
    prompts: [
      "Order status kaise dekhu?",
      "Refund policy?",
      "Order cancel kaise?",
      "Merchant ne reply nahi diya?",
      "Support kaise contact karun?",
    ],
    welcomeHint: "Orders — status, tracking, refund, support — confirmed help yahan.",
  },
  merchant: {
    teasers: [
      "📊 Business tip chahiye? Live data se bataunga!",
      "🚀 Growth / fees / products — merchant coach ready!",
    ],
    voiceLines: [
      "Business coach ready. Ask me for growth tips from your live data.",
      "I can recommend the best next move for your store.",
    ],
    prompts: [
      "Meri shop ki live summary",
      "Best selling product?",
      "Delivery fees kaise set karun?",
      "Pending orders?",
      "Growth tips",
    ],
    welcomeHint: "Merchant side — analytics, fees, products, growth tips (real data se).",
  },
  general: {
    teasers: [
      "👋 Main TrendBot hoon — app ka kuch bhi pucho!",
      "💡 Madad chahiye? Tap karo!",
    ],
    voiceLines: [
      "Hi, I am TrendBot. How can I help?",
      "Ask me about products, deals, or orders.",
    ],
    prompts: [
      "TrendsMart kaise kaam karta hai?",
      "Best deals kahan hain?",
      "Order kaise karun?",
      "Refund policy?",
      "Support",
    ],
    welcomeHint: "TrendsMart guide — products, deals, orders, policies.",
  },
};

export function getTrendBotPagePack(ctx: TrendBotPageContext): PagePack {
  return PAGE_PACKS[ctx] ?? PAGE_PACKS.general;
}

export function buildContextualWelcome(
  ctx: TrendBotPageContext,
  baseWelcome: string,
): string {
  const hint = getTrendBotPagePack(ctx).welcomeHint;
  return `${baseWelcome}\n\n_📍 ${hint}_`;
}
