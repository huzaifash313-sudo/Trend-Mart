/* TrendsMart brand + owner + policies — high-priority chatbot facts */

import { TREND_BOT_NAME } from "@/lib/ai/trendBotBrand";

type AssistantRole = "customer" | "merchant" | "shop";

export const TRENDSMART_OWNER_NAME = "Huzaifa";

export interface BrandKnowledgeEntry {
  keys: string[];
  q: string;
  a: string;
  roles: AssistantRole | AssistantRole[] | "all";
  link?: string;
  /** Higher = answer first */
  priority?: number;
}

export const BRAND_KNOWLEDGE: BrandKnowledgeEntry[] = [
  {
    priority: 100,
    keys: [
      "owner",
      "founder",
      "ceo",
      "malik",
      "banaya",
      "banane wala",
      "kis ne banaya",
      "kisne banaya",
      "who made",
      "who created",
      "who owns",
      "who is owner",
      "huzaifa",
      "creator",
      "developer",
      "trendsmart ka owner",
      "trends mart owner",
      "app ka owner",
      "app kis ki",
      "platform owner",
    ],
    q: "TrendsMart ka owner kaun hai?",
    a:
      `TrendsMart ke *Owner / Founder* hain: *${TRENDSMART_OWNER_NAME}*.\n\n` +
      `Yeh unka hyper-local marketplace platform hai — local shops aur customers ko WhatsApp ordering se connect karta hai.\n\n` +
      `_Clear jawab: Owner = ${TRENDSMART_OWNER_NAME}._`,
    roles: "all",
    link: "/",
  },
  {
    priority: 90,
    keys: ["about trendsmart", "about us", "company", "platform kya", "trendsmart kya hai", "ye app kya"],
    q: "TrendsMart about",
    a:
      `*TrendsMart* ek hyper-local multi-vendor marketplace hai (trendsmart.pk).\n\n` +
      `• Customers qareeb ki dukanain browse karte hain\n` +
      `• Cart + WhatsApp se order jata hai\n` +
      `• Merchants apna store, products, radius, delivery rules set karte hain\n` +
      `• Owner / Founder: *${TRENDSMART_OWNER_NAME}*\n\n` +
      `${TREND_BOT_NAME} isi app ke features aur live catalog se madad karta hai.`,
    roles: "all",
    link: "/",
  },
  {
    priority: 85,
    keys: ["terms", "terms and conditions", "shartain", "terms of use", "agreement"],
    q: "Terms & Conditions",
    a:
      `📜 *Terms & Conditions (summary)*\n\n` +
      `1. App use = Terms accept\n` +
      `2. TrendsMart *technology* deta hai; har merchant apne products, price, stock, delivery ka zimmedar hai\n` +
      `3. Guests browse/cart kar sakte hain; order ke liye account + email verify\n` +
      `4. Payment customer ↔ merchant ke beech (COD / transfer etc.) — TrendsMart sale contract ka party nahi\n` +
      `5. Fraud / rules break par store suspend ho sakta hai\n\n` +
      `Poori detail: [Terms](/legal/terms)`,
    roles: "all",
    link: "/legal/terms",
  },
  {
    priority: 85,
    keys: ["privacy", "privacy policy", "data", "personal info", "meri info", "data safe"],
    q: "Privacy Policy",
    a:
      `🔒 *Privacy (summary)*\n\n` +
      `• Collect: email, phone, order/address, location (nearby shops ke liye), usage analytics\n` +
      `• Use: marketplace chalana, OTP, recommendations, fraud detect\n` +
      `• Share: sirf zaruri order details merchant ko — *data sell nahi hota*\n` +
      `• Rights: access / correct / delete request Support se\n\n` +
      `Poori detail: [Privacy Policy](/legal/privacy)`,
    roles: "all",
    link: "/legal/privacy",
  },
  {
    priority: 85,
    keys: ["refund", "return", "cancel order", "cancellation", "dispute", "wapis", "paisa wapas"],
    q: "Refund & Order Policy",
    a:
      `↩️ *Refund / Cancel (summary)*\n\n` +
      `• *Pending* status mein cancel usually possible\n` +
      `• Processing ke baad cancel merchant discretion\n` +
      `• Refund merchant process karta hai (kyunki payment unke paas / COD)\n` +
      `• Damaged/wrong item: 24h mein shop ko WhatsApp + photos\n` +
      `• Shop 48h silent ho to [Support](/support) escalate karein\n` +
      `• Perishable / personal-care aksar non-returnable (unless defective)\n\n` +
      `Poori detail: [Refund Policy](/legal/refund-policy)`,
    roles: "all",
    link: "/legal/refund-policy",
  },
  {
    priority: 85,
    keys: [
      "merchant guidelines",
      "merchant rules",
      "seller rules",
      "security guidelines",
      "dukan rules",
      "merchant policy",
    ],
    q: "Merchant Security Guidelines",
    a:
      `🛡️ *Merchant Guidelines (summary)*\n\n` +
      `• Email verify + *admin approval* ke baad store live hota hai\n` +
      `• Strong password; WhatsApp active rakhein\n` +
      `• Real photos + sahi price; fake % OFF banned\n` +
      `• Out of Stock toggle use karein — galat availability na rakhein\n` +
      `• Delivery radius honest rakhein\n` +
      `• Counterfeit / prohibited items mana\n\n` +
      `Poori detail: [Merchant Guidelines](/legal/merchant-guidelines)`,
    roles: "all",
    link: "/legal/merchant-guidelines",
  },
  {
    priority: 80,
    keys: ["kaise kaam", "how it works", "tareeqa", "tareeka", "process", "flow", "step by step", "guide"],
    q: "TrendsMart kaise kaam karta hai?",
    a:
      `⚙️ *Tareeqa-e-kaar (simple)*\n\n` +
      `*Customer:*\n` +
      `1. Shops/products browse (guest OK)\n` +
      `2. Cart → Checkout (name, phone, address, live location)\n` +
      `3. Order save → *Open WhatsApp* → shop ko message\n` +
      `4. Shop confirm → status: Pending → Processing → Dispatched → Delivered\n\n` +
      `*Merchant:*\n` +
      `1. Become merchant → store details\n` +
      `2. Products Quick Add (Name, Category, Price, Image)\n` +
      `3. Radius / min order / free delivery set\n` +
      `4. Dashboard + WhatsApp se orders handle\n\n` +
      `👉 [FAQ](/faq) · [Support](/support)`,
    roles: "all",
    link: "/faq",
  },
  {
    priority: 75,
    keys: ["payment", "cod", "cash on delivery", "online pay", "paisa kaise", "payment method"],
    q: "Payment kaise hota hai?",
    a:
      `💳 *Payment*\n\n` +
      `TrendsMart generally *payment gateway hold* nahi karta. Payment customer aur merchant decide karte hain — aksar *Cash on Delivery (COD)* ya bank transfer / WhatsApp par confirm.\n\n` +
      `Checkout message mein payment method clear likhein. Details: [Terms § Orders & Payments](/legal/terms)`,
    roles: "all",
    link: "/legal/terms",
  },
  {
    priority: 70,
    keys: ["support", "complaint", "ticket", "help desk", "contact support", "masla"],
    q: "Support kaise lein?",
    a:
      `🎧 *Support*\n\n` +
      `1. Pehle shop se WhatsApp (order thread)\n` +
      `2. Phir [Support Desk](/support) par ticket\n` +
      `3. Order ID + details attach karein\n\n` +
      `Owner: *${TRENDSMART_OWNER_NAME}* — platform TrendsMart unka hai; day-to-day issues Support se handle hote hain.`,
    roles: "all",
    link: "/support",
  },
  {
    priority: 70,
    keys: ["contact", "email", "rabta", "phone trendsmart"],
    q: "TrendsMart se contact",
    a:
      `📞 Platform help ke liye [Support / Contact](/support) use karein.\n` +
      `Shop-specific sawal ke liye us shop ka WhatsApp / Message seller.\n\n` +
      `TrendsMart Owner: *${TRENDSMART_OWNER_NAME}*`,
    roles: "all",
    link: "/support",
  },
];

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s\u0600-\u06FF]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
}

export function matchBrandKnowledge(
  message: string,
  role: AssistantRole,
): { reply: string; confidence: number; intent: string; suggestions?: string[] } | null {
  const lower = message.toLowerCase();
  const tokens = tokenize(lower);

  // Hard win for owner questions
  if (
    /(owner|founder|ceo|malik|banaya|banane|kis ne|kisne|who (made|created|owns)|huzaifa|creator|developer)/i.test(
      lower,
    ) &&
    /(trend|app|mart|platform|ye|yeh|is|owner|founder)?/i.test(lower)
  ) {
    const entry = BRAND_KNOWLEDGE[0];
    return {
      intent: "brand_owner",
      confidence: 0.99,
      suggestions: ["TrendsMart kaise kaam karta hai?", "Order kaise karun?", "Refund policy?"],
      reply: `💡 *${entry.q}*\n\n${entry.a}\n\n_${TREND_BOT_NAME}_`,
    };
  }

  let best: BrandKnowledgeEntry | null = null;
  let bestScore = 0;

  for (const entry of BRAND_KNOWLEDGE) {
    const allowed =
      entry.roles === "all" ||
      (Array.isArray(entry.roles) ? entry.roles.includes(role) : entry.roles === role) ||
      (role === "shop" && entry.roles === "customer");
    if (!allowed) continue;

    let score = (entry.priority ?? 0) / 10;
    for (const key of entry.keys) {
      if (lower.includes(key.toLowerCase())) score += 30;
      for (const t of key.toLowerCase().split(/\s+/)) {
        if (tokens.has(t)) score += 8;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (!best || bestScore < 28) return null;

  const linkLine = best.link ? `\n\n👉 [Open](${best.link})` : "";
  return {
    intent: "brand_knowledge",
    confidence: Math.min(0.99, 0.55 + bestScore / 100),
    suggestions: [
      "TrendsMart ka owner?",
      "Order kaise karun?",
      "Refund policy?",
      "Best mobile ka link do",
    ],
    reply: `💡 *${best.q}*\n\n${best.a}${linkLine}\n\n_${TREND_BOT_NAME} — policies aur tareeqa-e-kaar clear batata hoon._`,
  };
}
