/* App-wide knowledge — FAQs + feature docs (keyword scoring) */

import { CUSTOMER_FAQS, MERCHANT_FAQS, type FaqItem } from "@/lib/content/faq";
import type { AssistantRole } from "@/lib/ai/assistantEngine";

interface KnowledgeEntry {
  keys: string[];
  q: string;
  a: string;
  roles: AssistantRole[] | "all";
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

function faqToEntry(faq: FaqItem, roles: AssistantRole[] | "all"): KnowledgeEntry {
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

export function matchAppKnowledge(
  message: string,
  role: AssistantRole,
): { reply: string; confidence: number; intent: string } | null {
  const lower = message.toLowerCase();

  const isAppQuestion =
    /(trendsmart|trends mart|ye app|yeh app|is app|app mein|app par|how does|kaise kaam|kya hai|what is|help|madad|feature|function)/i.test(
      lower,
    ) ||
    /(cart|checkout|wishlist|whatsapp|delivery|radius|merchant|qr|analytics|deals|support|pwa|chat|track)/i.test(
      lower,
    );

  if (!isAppQuestion && lower.split(/\s+/).length < 4) return null;

  let best: KnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of ALL_ENTRIES) {
    if (entry.roles !== "all" && entry.roles !== role && !entry.roles.includes(role)) {
      if (role === "shop" && !entry.roles.includes("customer")) continue;
    }
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
    reply: `💡 *${best.q}*\n\n${best.a}${linkLine}\n\n_Kuch aur pooch sakte hain — main TrendsMart ki poori app samajhta hoon._`,
  };
}
