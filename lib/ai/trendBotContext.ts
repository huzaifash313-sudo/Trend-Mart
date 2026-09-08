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
      "🏠 Ghar pe ho — qareeb ki shops ya best deals pooch lo!",
      "✨ Product link chahiye? Bas naam likho — main dhundh deta hoon!",
      "🛒 Koi bhi cheez samajhni ho — tap karo, main yahan hoon!",
    ],
    voiceLines: [
      "Assalam o alaikum! TrendBot yahan hai. Apni pasandida shop ya deal poochein.",
      "Salam! Qareeb ki dukaan ya sasta product chahiye? Batao, main dhundh deta hoon.",
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
      "🔥 Deals dhoond rahe ho? Konsa offer chahiye — batao!",
      "Discount hunt mein hoon — TrendBot help karta hai!",
      "🏷️ Deal samajh nahi aa rahi? Tap karke pooch lo!",
    ],
    voiceLines: [
      "Salam! Aaj ke best deals main bata sakta hoon. Kya chahiye?",
      "Discount dhoond rahe ho? Apni zaroorat batao, sahi deal suggest karta hoon.",
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
      "Sasta ya best quality? Main catalog se sahi option bataunga!",
      "Filters confuse kar rahe hain? Main clear guide karta hoon!",
    ],
    voiceLines: [
      "Koi product chahiye? Naam batao, main live catalog se link nikalta hoon.",
      "Sasta ya best wala? Dono options batata hoon, aap decide karo.",
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
      "🏪 Is store ke products ya delivery ke baare mein pooch lo!",
      "Timing, fees, order steps — sab yahin clear ho jata hai!",
    ],
    voiceLines: [
      "Is dukaan ke baare mein kuch poochna hai? Products, delivery, ya timings?",
      "Order karna ho ya delivery fee pata karni ho — main madad karta hoon.",
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
      "🛒 Checkout mein atke ho? Main order steps bataunga!",
      "Delivery fee ya location confuse? Tap karo, clear kar deta hoon!",
    ],
    voiceLines: [
      "Cart mein items hain. Checkout kaise karna hai, main samjha sakta hoon.",
      "WhatsApp par order karna asaan hai. Koi confusion ho to batao.",
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
      "📦 Order ka status janana hai? Main guide karta hoon!",
      "Tracking ya refund ka masla hai? Pooch lo, abhi clear karta hoon!",
    ],
    voiceLines: [
      "Order ke baare mein koi sawal hai? Status, tracking, ya refund — batao.",
      "Delivery ka wait kar rahe ho? Main status explain kar sakta hoon.",
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
      "📊 Business tip chahiye? Live data se bata sakta hoon!",
      "Apni dukaan ki growth ke liye — TrendBot coach ready hai!",
    ],
    voiceLines: [
      "Apni shop ki performance dekhni hai? Main live data se summary de sakta hoon.",
      "Business coach yahan hai. Sales badhane ke liye kya karna chahiye — batao.",
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
      "Main TrendBot hoon — app ka kuch bhi pooch sakte ho!",
      "Madad chahiye? Bas tap karo — main yahan hoon!",
    ],
    voiceLines: [
      "Salam! TrendBot yahan hai. Products, deals, ya orders — kuch bhi poochein.",
      "Koi bhi sawaal ho — main jawab dene ki koshish karta hoon.",
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
