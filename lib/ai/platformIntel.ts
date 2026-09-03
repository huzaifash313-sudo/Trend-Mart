/* Live marketplace intelligence — trending categories, business advisor */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeChatNumber, sanitizeChatString } from "@/lib/ai/sanitize";

export interface PlatformSnapshot {
  liveShops: number;
  totalProducts: number;
  activeDeals: number;
  categoryStats: { category: string; shops: number; products: number; score: number }[];
  topCategories: string[];
  fetchedAt: string;
}

export async function fetchPlatformSnapshot(
  supabase: SupabaseClient,
): Promise<PlatformSnapshot> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [shopsRes, productsRes, dealsRes, clicksRes] = await Promise.all([
    supabase.from("shops").select("id, category").eq("is_live", true).limit(500),
    supabase
      .from("products")
      .select("id, shop_id, shops!inner(category, is_live)")
      .eq("is_available", true)
      .eq("shops.is_live", true)
      .limit(800),
    supabase
      .from("shop_deals")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("analytics_logs")
      .select("product_id, products(shop_id, shops(category))")
      .eq("event_type", "product_click")
      .gte("created_at", sevenDaysAgo)
      .not("product_id", "is", null)
      .limit(400),
  ]);

  const catMap = new Map<string, { shops: Set<string>; products: number; clicks: number }>();

  for (const s of (shopsRes.data ?? []) as { id: string; category: string }[]) {
    const cat = sanitizeChatString(s.category, 60) || "Others";
    const cur = catMap.get(cat) ?? { shops: new Set(), products: 0, clicks: 0 };
    cur.shops.add(s.id);
    catMap.set(cat, cur);
  }

  for (const p of (productsRes.data ?? []) as Record<string, unknown>[]) {
    const shops = p.shops as { category?: string } | null;
    const cat = sanitizeChatString(shops?.category, 60) || "Others";
    const cur = catMap.get(cat) ?? { shops: new Set(), products: 0, clicks: 0 };
    cur.products += 1;
    catMap.set(cat, cur);
  }

  for (const row of (clicksRes.data ?? []) as Record<string, unknown>[]) {
    const prod = row.products as { shops?: { category?: string } } | null;
    const cat = sanitizeChatString(prod?.shops?.category, 60) || "Others";
    const cur = catMap.get(cat) ?? { shops: new Set(), products: 0, clicks: 0 };
    cur.clicks += 1;
    catMap.set(cat, cur);
  }

  const categoryStats = [...catMap.entries()]
    .map(([category, v]) => ({
      category,
      shops: v.shops.size,
      products: v.products,
      score: v.shops.size * 3 + v.products + v.clicks * 2,
    }))
    .sort((a, b) => b.score - a.score);

  return {
    liveShops: (shopsRes.data ?? []).length,
    totalProducts: (productsRes.data ?? []).length,
    activeDeals: dealsRes.count ?? 0,
    categoryStats,
    topCategories: categoryStats.slice(0, 5).map((c) => c.category),
    fetchedAt: new Date().toISOString(),
  };
}

const BUSINESS_IDEA_PATTERNS =
  /(konsa business|kon sa business|kya business|business karun|business shuru|dukan kholun|shop kholo|kya bechun|kya sell|new business|start business|idea|trending|chal raha|demand|market mein)/i;

export function looksLikeBusinessAdvisor(message: string): boolean {
  return BUSINESS_IDEA_PATTERNS.test(message);
}

export function generateBusinessAdvisorReply(
  snapshot: PlatformSnapshot,
  message: string,
): { reply: string; intent: string; confidence: number; suggestions: string[] } {
  const top = snapshot.categoryStats.slice(0, 6);
  const list = top
    .map(
      (c, i) =>
        `${i + 1}. *${c.category}* — ${c.shops} shops · ${c.products} products · demand score ${c.score}`,
    )
    .join("\n");

  const isNew =
    /(new|naya|start|shuru|pehli|first time|beginner)/i.test(message) ||
    /(konsa|kon sa|kya)/i.test(message);

  const intro = isNew
    ? "Maine abhi *live TrendsMart data* scan kiya — yeh categories sab se active hain:"
    : "Marketplace ka *real-time snapshot* (abhi fetch hua):";

  const tips = [
    top[0]
      ? `• *${top[0].category}* mein sab se zyada activity hai — agar aapke area mein gap / kam shops hain, yahan start karein.`
      : "• Pehle ek clear niche choose karein (food, grocery, fashion, electronics).",
    top[1]
      ? `• Runner-up niche: *${top[1].category}* — competition thori kam ho sakti hai, margin check karein.`
      : "• Doosri category backup rakhein taake demand shift pe ready rahein.",
    "• WhatsApp number + clear photos + 3–5 reviews = trust build hota hai.",
    "• 10–15 hero products se start karein; pehle 5 pe discount badge lagayein.",
    "• Free delivery threshold (jaise Rs 1500+) set karein taake average order barhe.",
    "• Local QR print + WhatsApp status + nearby groups = pehle 20 orders ka shortcut.",
  ];

  const gapHint =
    top.length >= 3
      ? `\n🎯 *Opportunity read:* Top demand *${top[0]!.category}* hai, lekin *${top[2]!.category}* mein ${top[2]!.shops} shops hain — agar aapke neighbourhood mein yeh weak hai, early-mover ban sakte ho.\n`
      : "\n";

  return {
    intent: "business_advisor",
    confidence: 0.92,
    suggestions: [
      "Electronics shop start karun?",
      "Food business ka trend?",
      "Meri shop ki summary",
      "Business grow strategy",
    ],
    reply:
      `🧠 *Business Advisor* _(live data · ${new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})_\n\n` +
      `${intro}\n\n${list}\n` +
      gapHint +
      `\n📊 Platform: *${snapshot.liveShops}* live shops · *${snapshot.totalProducts}+* listed products · *${snapshot.activeDeals}* active deals\n\n` +
      `*Meri best recommendation (priority order):*\n${tips.join("\n")}\n\n` +
      `Ready ho to [Register your store](/account/become-merchant) — setup ~15 minutes.\n\n` +
      `_Yeh analysis abhi ke marketplace trends par based hai, guess nahi._`,
  };
}

export function generatePlatformTrendsReply(snapshot: PlatformSnapshot): {
  reply: string;
  intent: string;
  confidence: number;
  suggestions: string[];
} {
  const cats = snapshot.topCategories.join(", ") || "—";
  return {
    intent: "platform_trends",
    confidence: 0.9,
    suggestions: ["Best mobile ka link do", "Konsa business karun?", "Best deals?"],
    reply:
      `📈 *TrendsMart Live Pulse*\n\n` +
      `🕐 Updated: ${new Date(snapshot.fetchedAt).toLocaleString()}\n\n` +
      `• Live shops: *${snapshot.liveShops}*\n` +
      `• Listed products: *${snapshot.totalProducts}+*\n` +
      `• Active deals: *${snapshot.activeDeals}*\n\n` +
      `🔥 *Hot categories right now:* ${cats}\n\n` +
      `Explore: [All products](/products) · [Deals](/deals)`,
  };
}

/** Merchant live pulse — today vs recent */
export function formatMerchantLivePulse(ctx: {
  shopName: string;
  ordersToday: number;
  revenueToday: number;
  ordersYesterday: number;
  viewsToday: number;
  clicksToday: number;
  pendingOrders: number;
  unreadMessages: number;
}): string {
  const orderTrend =
    ctx.ordersToday > ctx.ordersYesterday
      ? "📈 aaj zyada"
      : ctx.ordersToday < ctx.ordersYesterday
        ? "📉 kal se kam"
        : "➡️ stable";

  return (
    `⚡ *Live Pulse — ${ctx.shopName}*\n\n` +
    `🕐 Abhi: ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}\n\n` +
    `• Aaj ke orders: *${ctx.ordersToday}* (${orderTrend}, kal: ${ctx.ordersYesterday})\n` +
    `• Aaj ki revenue: *Rs. ${ctx.revenueToday.toLocaleString("en-PK")}*\n` +
    `• Aaj views/clicks: *${ctx.viewsToday}* / *${ctx.clicksToday}*\n` +
    `• Pending: *${ctx.pendingOrders}* · Unread chats: *${ctx.unreadMessages}*\n\n` +
    `[Full analytics](/dashboard/analytics) · [Orders](/dashboard/orders)`
  );
}

export function looksLikeLiveAnalytics(message: string): boolean {
  return /(live|abhi|real.?time|realtime|aaj|today|right now|filhal|current|pulse|instant)/i.test(
    message,
  ) && /(analytics|stats|data|performance|report|summary|orders|revenue|views)/i.test(message);
}

export function looksLikePlatformTrends(message: string): boolean {
  return /(trend|trending|popular|chalti|demand|market|platform|overall)/i.test(message);
}
