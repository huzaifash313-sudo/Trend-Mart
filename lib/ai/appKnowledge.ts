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
    a: "Delivered orders ke baad review reminder aata hai. Shop aur product ratings trust build karti hain. Apni reviews: account profile section.",
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
    a: "Sign up → email verify → profile complete. Login: [Login](/login). Phone OTP abhi optional hai; email verification zaroori hai orders ke liye.",
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
    a: "Har shop apna minimum order aur delivery slabs set karti hai — checkout par clearly dikhte hain. Free delivery threshold shop settings mein hota hai.",
    roles: "all",
  },
  {
    keys: ["offline", "no internet", "pwa offline"],
    q: "Offline mode",
    a: "PWA install karne par choti network drops par basic browsing cache se chal sakti hai. Orders ke liye internet zaroori hai.",
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

export function matchAppKnowledge(
  message: string,
  role: AssistantRole,
): { reply: string; confidence: number; intent: string } | null {
  const lower = message.toLowerCase();

  const isAppQuestion =
    /(trendsmart|trends mart|trendbot|trend bot|ye app|yeh app|is app|app mein|app par|how does|kaise kaam|kya hai|what is|help|madad|feature|function)/i.test(
      lower,
    ) ||
    /(cart|checkout|wishlist|whatsapp|delivery|radius|merchant|qr|analytics|deals|support|pwa|chat|track|theme|location|search|stories|coupon|review|refund|legal|login|notification|faq|order)/i.test(
      lower,
    );

  if (!isAppQuestion && lower.split(/\s+/).length < 4) return null;

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

  if (!best || bestScore < 20) return null;

  const linkLine = best.link ? `\n\n👉 [Open related page](${best.link})` : "";
  return {
    intent: "app_knowledge",
    confidence: Math.min(0.95, 0.5 + bestScore / 80),
    reply: `💡 *${best.q}*\n\n${best.a}${linkLine}\n\n_${TREND_BOT_NAME} — TrendsMart ki poori app samajhta hoon. Aur pooch sakte hain!_`,
  };
}
