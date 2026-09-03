/* App-wide knowledge — FAQs + feature docs (keyword scoring) */

import { CUSTOMER_FAQS, MERCHANT_FAQS, type FaqItem } from "@/lib/content/faq";
import type { AssistantRole } from "@/lib/ai/assistantEngine";
import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

interface KnowledgeEntry {
  keys: string[];
  q: string;
  a: string;
  roles: AssistantRole | AssistantRole[] | "all";
  link?: string;
}

const APP_KNOWLEDGE: KnowledgeEntry[] = [
  {
    keys: ["gujranwala", "lahore", "city", "kis city", "mera shehar", "area"],
    q: "Kaunsi city?",
    a: "TrendsMart *kisi bhi city* mein account bana sakte hain. Filhaal soft launch pe local shops focus hai — apni location on karein, phir sirf un shops dikhengi jo aapke radius / delivery area mein deliver karti hain.",
    roles: "all",
    link: "/settings/location",
  },
  {
    keys: ["delivery", "delivery charges", "fee", "kitni delivery", "free delivery"],
    q: "Delivery system",
    a: "Har shop apna system set karti hai: *service radius*, minimum order, free-delivery threshold, flat / per-km fee. Checkout par aapki pin se check hota hai ke shop deliver karti hai ya nahi — bahar hone par order block ho sakta hai.",
    roles: "all",
    link: "/products",
  },
  {
    keys: ["trendsmart", "trends mart", "trend mart", "ye app", "yeh app", "what is", "kya hai", "platform"],
    q: "TrendsMart kya hai?",
    a: "TrendsMart ek *hyper-local marketplace* hai jahan aap qareeb ki dukanain browse karte hain, cart banate hain, aur WhatsApp se order place karte hain. Har shop apna radius, delivery rules, aur products khud set karti hai.",
    roles: "all",
    link: "/",
  },
  {
    keys: ["cart", "add to cart", "checkout", "checkout kaise"],
    q: "Cart kaise kaam karta hai?",
    a: "Products par tap karke *Add to cart* karein — guest bhi kar sakta hai. Checkout par name, phone, address bharein. Sign-in users ka data save rehta hai.",
    roles: "all",
    link: "/products",
  },
  {
    keys: ["whatsapp order", "whatsapp se", "open whatsapp", "order whatsapp"],
    q: "WhatsApp order flow",
    a: "Checkout ke baad *Open WhatsApp* tap karein — formatted order message shop ko jati hai. Shop confirm karti hai. Status aap *Orders → Track* par dekhte hain.",
    roles: "all",
    link: "/orders",
  },
  {
    keys: ["radius", "delivery area", "doorstep", "kitne km", "distance filter"],
    q: "Radius / delivery",
    a: "Har merchant apna *service radius* set karta hai. Homepage filter se 'Within X km' choose karein. Checkout par live location share karna zaroori hai taake shop confirm kar sake.",
    roles: "all",
  },
  {
    keys: ["wishlist", "heart", "save product", "favourite"],
    q: "Wishlist",
    a: "Heart icon se products/shops save karein. Sign-in par cloud sync hota hai. [Wishlist](/wishlist) par alag tabs hain.",
    roles: "customer",
    link: "/wishlist",
  },
  {
    keys: ["chat", "message seller", "in app chat", "my chats"],
    q: "In-app chat",
    a: "Shop page → *Message seller* → sign in → message bhejein. Merchant dashboard se reply karta hai. Aapke chats: [My Chats](/account/inquiries).",
    roles: "customer",
    link: "/account/inquiries",
  },
  {
    keys: ["merchant", "dukan", "store register", "become merchant", "sell", "business start"],
    q: "Merchant kaise banein?",
    a: "[Become a Merchant](/account/become-merchant) → store name, category, WhatsApp, logo. Email verify ke baad dashboard khulta hai — products add karein aur orders receive karein.",
    roles: "all",
    link: "/account/become-merchant",
  },
  {
    keys: ["qr code", "qr", "scan shop"],
    q: "Shop QR code",
    a: "Merchants: Dashboard → Settings se apna QR download karein. Customer scan karke seedha shop page par aata hai.",
    roles: "merchant",
    link: "/dashboard/settings",
  },
  {
    keys: ["discount badge", "percent off", "original price", "strikethrough"],
    q: "Discount badges",
    a: "Product edit par *Original Price* selling price se zyada rakhein — app auto *% OFF* badge dikhati hai.",
    roles: "merchant",
  },
  {
    keys: ["deals", "weekly deal", "promo"],
    q: "Deals",
    a: "Platform-wide deals [Deals page](/deals) par hain. Merchants apne shop deals dashboard se manage karte hain.",
    roles: "all",
    link: "/deals",
  },
  {
    keys: ["support", "help desk", "contact trendsmart", "complaint"],
    q: "Support",
    a: "Platform support ke liye app mein Support / Contact section use karein. Order issues ke liye pehle shop se WhatsApp par baat karein.",
    roles: "all",
    link: "/support",
  },
  {
    keys: ["pwa", "install app", "home screen", "add to home"],
    q: "PWA install",
    a: "Browser menu se *Add to Home Screen* karein — TrendsMart native app jaisa chalega, offline basics ke sath.",
    roles: "all",
  },
  {
    keys: ["analytics", "dashboard stats", "views clicks"],
    q: "Merchant analytics",
    a: "Dashboard → [Analytics](/dashboard/analytics): store views, product clicks, revenue trends. AI Coach se bhi real-time summary le sakte hain.",
    roles: "merchant",
    link: "/dashboard/analytics",
  },
  {
    keys: ["ads", "sponsored", "promote shop"],
    q: "Ads",
    a: "Merchants [Ads](/dashboard/ads) se sponsored banners lagwa sakte hain — zyada visibility ke liye.",
    roles: "merchant",
    link: "/dashboard/ads",
  },
  {
    keys: ["trendbot", "ai assistant", "ai bot", "chatbot", "bot kahan", "ai kahan"],
    q: "TrendBot kya hai?",
    a: "*TrendBot* TrendsMart ka free AI assistant hai. Product links, app help, deals, orders — sab pooch sakte hain. [TrendBot kholein](/assistant) ya neeche floating bot tap karein.",
    roles: "all",
    link: "/assistant",
  },
  {
    keys: ["dark mode", "light mode", "theme", "appearance", "font size", "dark theme"],
    q: "Theme & appearance",
    a: "[Settings → Appearance](/settings/appearance) se dark/light mode, font size, grid layout aur card style change karein.",
    roles: "all",
    link: "/settings/appearance",
  },
  {
    keys: ["location", "gps", "pin", "live location", "meri location", "address save"],
    q: "Location & addresses",
    a: "Browse filter ke liye [Location settings](/settings/location). Saved delivery addresses: [My Addresses](/account/addresses). Checkout par live GPS share karna zaroori hai.",
    roles: "customer",
    link: "/settings/location",
  },
  {
    keys: ["search", "global search", "dhundho", "filter", "category", "sub category"],
    q: "Search & categories",
    a: "Navbar search se poore marketplace mein dhundhein. [Products](/products) par category pills aur radius filter use karein. TrendBot se bhi link maang sakte hain.",
    roles: "all",
    link: "/products",
  },
  {
    keys: ["stories", "highlights", "story tray"],
    q: "Stories",
    a: "Homepage par shops ki promotional *Stories* tray hoti hai — tap karke highlights dekhein.",
    roles: "all",
    link: "/",
  },
  {
    keys: ["coupon", "promo code", "discount code", "voucher"],
    q: "Coupons",
    a: "Kuch shops checkout par coupon codes support karti hain. Shop deals aur product markdown badges alag cheez hain — dono [Deals](/deals) aur product pages par dekhein.",
    roles: "all",
    link: "/deals",
  },
  {
    keys: ["review", "rating", "stars", "feedback product"],
    q: "Reviews & ratings",
    a: "Delivered order ke baad product rate karo — stars product ki rating badhati hain aur shop ki average rating bhi auto update hoti hai. Apni reviews: account profile.",
    roles: "customer",
  },
  {
    keys: ["refund", "return", "cancel order", "policy", "dispute"],
    q: "Refund & cancel",
    a: "Pending orders cancel ho sakte hain. Returns/disputes ke liye pehle shop se WhatsApp par baat karein, phir [Refund Policy](/legal/refund-policy) dekhein.",
    roles: "all",
    link: "/legal/refund-policy",
  },
  {
    keys: ["terms", "privacy", "legal", "guidelines", "policy page"],
    q: "Legal pages",
    a: "[Terms](/legal/terms) · [Privacy](/legal/privacy) · [Merchant Guidelines](/legal/merchant-guidelines) · [Refund Policy](/legal/refund-policy)",
    roles: "all",
    link: "/legal/terms",
  },
  {
    keys: ["otp", "verify email", "sign up", "register", "login", "account ban"],
    q: "Account & auth",
    a: "Sign up → email verify → profile complete. Login: [Login](/login). Order ke liye email verification zaroori hai; phone contact profile pe save hota hai.",
    roles: "all",
    link: "/login",
  },
  {
    keys: ["notification", "push", "alert", "bell"],
    q: "Notifications",
    a: "[Notification settings](/settings/notifications) se push alerts control karein. Order updates mostly dashboard/WhatsApp se aate hain.",
    roles: "all",
    link: "/settings/notifications",
  },
  {
    keys: ["recently viewed", "history", "dekha hua"],
    q: "Recently viewed",
    a: "Jo products aap dekhte hain woh [Recently Viewed](/recently-viewed) par save hoti hain — quick access ke liye.",
    roles: "customer",
    link: "/recently-viewed",
  },
  {
    keys: ["faq", "help center", "guide", "sawal jawab"],
    q: "FAQ",
    a: "Common questions ke liye [FAQ page](/faq) dekhein — ya TrendBot se seedha pooch lein.",
    roles: "all",
    link: "/faq",
  },
  {
    keys: ["order page", "my orders", "orders kahan", "order history"],
    q: "Orders page",
    a: "Apne saare orders: [Orders](/orders). Live status: [Track Order](/orders/tracking). TrendBot signed-in users se status bhi bata sakta hai.",
    roles: "customer",
    link: "/orders",
  },
  {
    keys: ["kitchen", "dine in", "dine-in", "table order", "restaurant table"],
    q: "Dine-in / kitchen",
    a: "Restaurants ke liye dine-in menu aur table orders dashboard [Kitchen](/dashboard/kitchen) aur [Tables](/dashboard/tables) se manage hote hain.",
    roles: "merchant",
    link: "/dashboard/kitchen",
  },
  {
    keys: ["service", "portfolio", "booking", "appointment"],
    q: "Services & booking",
    a: "Service businesses portfolio aur bookings dashboard se manage karte hain: [Services Portfolio](/dashboard/services/portfolio).",
    roles: "merchant",
    link: "/dashboard/services/portfolio",
  },
  {
    keys: ["minimum order", "delivery fee", "free delivery", "slab"],
    q: "Delivery fees & minimum order",
    a: "Har shop apna *minimum order*, *flat fee*, *per-km fee*, aur *free-delivery threshold* khud set karti hai. Exact amount checkout par GPS distance ke sath calculate hota hai. Fees set na hon to delivery *FREE nahi* hoti — checkout block ho sakta hai. Radius sirf coverage (deliver hoga ya nahi) decide karta hai.",
    roles: "all",
  },
  {
    keys: ["offline", "no internet", "pwa offline"],
    q: "Offline mode",
    a: "PWA install karne par choti network drops par basic browsing cache se chal sakti hai. Orders ke liye internet zaroori hai.",
    roles: "all",
  },
  {
    keys: ["payment", "cod", "cash on delivery", "online payment", "paisa", "pay"],
    q: "Payment kaise hota hai?",
    a: "Zyada tar shops *Cash on Delivery (COD)* ya WhatsApp par payment confirm karti hain. Checkout message mein payment method clear likhein — shop confirm karegi.",
    roles: "all",
    link: "/cart",
  },
  {
    keys: ["guest", "bina login", "without login", "sign in zaroori"],
    q: "Bina login browse?",
    a: "Haan — shops aur products *bina sign-in* browse aur cart mein add kar sakte hain. Orders / chat / wishlist sync ke liye sign-in better hai.",
    roles: "customer",
    link: "/login",
  },
  {
    keys: ["how to use", "kaise use", "guide", "tutorial", "shuruat", "start"],
    q: "TrendsMart kaise use karein?",
    a: "1) Homepage se shop/category choose karein\n2) Product cart mein add karein\n3) Checkout → WhatsApp order\n4) Status [Orders](/orders) par track karein\n\nTrendBot se product link bhi maang sakte hain.",
    roles: "all",
    link: "/",
  },
  {
    keys: ["safe", "secure", "scam", "trust", "reliable"],
    q: "Kya TrendsMart safe hai?",
    a: "Email verify ke baad merchant shop public ho sakti hai. Order WhatsApp par shop se direct confirm hota hai. Issues: pehle shop, phir [Support](/support).",
    roles: "all",
    link: "/legal/merchant-guidelines",
  },
  {
    keys: ["language", "urdu", "english", "roman urdu"],
    q: "Kaunsi language?",
    a: "TrendBot *Roman Urdu + English* dono samajhta hai — jaise \"best mobile ka link do\" ya \"show cheapest laptop\".",
    roles: "all",
  },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function scoreEntry(message: string, entry: KnowledgeEntry): number {
  const msgTokens = tokenize(message);
  let score = 0;
  for (const key of entry.keys) {
    const keyLower = key.toLowerCase();
    if (message.toLowerCase().includes(keyLower)) score += 25;
    for (const t of keyLower.split(/\s+/)) {
      if (msgTokens.has(t)) score += 8;
    }
  }
  for (const t of tokenize(entry.q)) {
    if (msgTokens.has(t)) score += 4;
  }
  return score;
}

function faqToEntry(faq: FaqItem, roles: AssistantRole | "all"): KnowledgeEntry {
  return {
    keys: [faq.q.toLowerCase(), ...faq.q.toLowerCase().split(/\s+/).filter((w) => w.length > 3)],
    q: faq.q,
    a: faq.a,
    roles,
  };
}

const ALL_ENTRIES: KnowledgeEntry[] = [
  ...APP_KNOWLEDGE,
  ...CUSTOMER_FAQS.map((f) => faqToEntry(f, "customer")),
  ...MERCHANT_FAQS.map((f) => faqToEntry(f, "merchant")),
];

function entryVisibleToRole(entryRoles: AssistantRole | AssistantRole[] | "all", role: AssistantRole): boolean {
  if (entryRoles === "all") return true;
  const allowed = Array.isArray(entryRoles) ? entryRoles : [entryRoles];
  if (allowed.includes(role)) return true;
  return role === "shop" && allowed.includes("customer");
}

function scoreBestKnowledge(
  message: string,
  role: AssistantRole,
): { entry: KnowledgeEntry; score: number } | null {
  let best: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of ALL_ENTRIES) {
    if (!entryVisibleToRole(entry.roles, role)) continue;
    const s = scoreEntry(message, entry);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }

  if (!best) return null;
  return { entry: best, score: bestScore };
}

function formatKnowledgeReply(entry: KnowledgeEntry, confidence: number) {
  const linkLine = entry.link ? `\n\n👉 [Open related page](${entry.link})` : "";
  return {
    intent: "app_knowledge",
    confidence,
    suggestions: ["Best mobile ka link do", "Order kaise karun?", "Best deals?", "Mere orders?"],
    reply: `💡 *${entry.q}*\n\n${entry.a}${linkLine}\n\n_${TREND_BOT_NAME} — TrendsMart ki poori app samajhta hoon. Aur pooch sakte hain!_`,
  };
}

export function matchAppKnowledge(
  message: string,
  role: AssistantRole,
): { reply: string; confidence: number; intent: string; suggestions?: string[] } | null {
  const lower = message.toLowerCase();

  const isAppQuestion =
    /(trendsmart|trends mart|trendbot|trend bot|ye app|yeh app|is app|app mein|app par|how does|kaise kaam|kya hai|what is|help|madad|feature|function)/i.test(
      lower,
    ) ||
    /(cart|checkout|wishlist|whatsapp|delivery|radius|merchant|qr|analytics|deals|support|pwa|chat|track|theme|location|search|stories|coupon|review|refund|legal|login|notification|faq|order|payment|cod|address|profile|password|install|offline|promo|banner|kitchen|booking)/i.test(
      lower,
    );

  if (!isAppQuestion && lower.split(/\s+/).length < 3) return null;

  const hit = scoreBestKnowledge(message, role);
  if (!hit || hit.score < 14) return null;

  return formatKnowledgeReply(hit.entry, Math.min(0.95, 0.5 + hit.score / 80));
}

/** Soft FAQ match for never-empty fallback (lower threshold). */
export function matchAppKnowledgeSoft(
  message: string,
  role: AssistantRole,
): { reply: string; confidence: number; intent: string; suggestions?: string[] } | null {
  const hit = scoreBestKnowledge(message, role);
  // Keep soft match useful but not random wrong FAQs
  if (!hit || hit.score < 18) return null;
  return formatKnowledgeReply(hit.entry, Math.min(0.88, 0.45 + hit.score / 90));
}
