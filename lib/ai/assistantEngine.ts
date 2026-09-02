/* -------------------------------------------------------------------------- */
/*  TrendsMart — Free AI Assistant Engine (no external API)                    */
/*  Data-driven responses for customer, merchant, and shop storefront roles.   */
/* -------------------------------------------------------------------------- */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeChatNumber, sanitizeChatString } from "@/lib/ai/sanitize";
import {
  extractProductQuery,
  looksLikeProductSearch,
  shouldRunProductSearch,
} from "@/lib/ai/queryExtract";
import { detectSortMode, applySpellFixes } from "@/lib/ai/queryExpand";
import {
  formatProductSearchReply,
  searchProductsByCategory,
  searchProductsForAssistant,
  searchProductsLoose,
} from "@/lib/ai/productSearch";
import { getProductSeoPath } from "@/lib/seo/productSlug";
import { matchAppKnowledge } from "@/lib/ai/appKnowledge";
import {
  fetchPlatformSnapshot,
  generateBusinessAdvisorReply,
  generatePlatformTrendsReply,
  formatMerchantLivePulse,
  looksLikeBusinessAdvisor,
  looksLikeLiveAnalytics,
  looksLikePlatformTrends,
} from "@/lib/ai/platformIntel";
import { resolveMessageWithHistory, type HistoryMessage } from "@/lib/ai/sessionContext";
import { getShopCategoryPrompts } from "@/lib/ai/shopCategoryPrompts";
import { getThinkingSteps } from "@/lib/ai/thinkingSteps";
import { looksLikeUniversalSearch, runUniversalSearch } from "@/lib/ai/universalSearch";
import { buildHonestFallbackReply } from "@/lib/ai/smartFallback";
import { normalizeUserLanguage } from "@/lib/ai/languageNormalize";
import { runLocalNlu } from "@/lib/ai/localNlu";
import {
  buildHelpfulGuideReply,
  isOutOfScope,
  MIN_KNOWLEDGE_CONFIDENCE,
  MIN_PRODUCT_SCORE,
} from "@/lib/ai/honestReply";
import { matchCategoryFromMessage, buildCategoryBrowseReply } from "@/lib/ai/categoryIntel";
import { matchBrandKnowledge } from "@/lib/ai/brandKnowledge";

export type { HistoryMessage };

export type AssistantRole = "customer" | "merchant" | "shop";

export interface AssistantRequest {
  message: string;
  role: AssistantRole;
  shopId?: string;
  shopCategory?: string;
  shopName?: string;
  userId?: string;
  history?: HistoryMessage[];
  memoryHints?: string[];
  pathname?: string;
  cartSummary?: { count: number; total: number; lines: string[] };
  location?: { lat: number; lng: number; label?: string };
}

export interface AssistantResponse {
  reply: string;
  intent: string;
  confidence: number;
  suggestions?: string[];
  thinkingSteps?: string[];
  products?: import("@/lib/ai/productSearch").ProductSearchHit[];
  handoff?: { type: "shop" | "support" | "inquiries"; href: string; label: string };
}

// ─── Intent types ────────────────────────────────────────────────────────────

export type MerchantIntent =
  | "greeting"
  | "business_summary"
  | "best_product"
  | "growth_strategy"
  | "discount_advice"
  | "pending_orders"
  | "low_stock"
  | "analytics_insight"
  | "lead_insight"
  | "review_insight"
  | "messaging_insight"
  | "revenue_trend"
  | "peak_hours"
  | "competitor_tips"
  | "ads_advice"
  | "whatsapp_tips"
  | "help"
  | "general";

export type CustomerIntent =
  | "greeting"
  | "product_search"
  | "order_status"
  | "how_to_order"
  | "best_deals"
  | "best_shops"
  | "wishlist_help"
  | "tracking_help"
  | "chat_help"
  | "delivery_help"
  | "account_help"
  | "become_merchant"
  | "help"
  | "general";

export type ShopIntent =
  | "greeting"
  | "product_search"
  | "product_inquiry"
  | "pricing_inquiry"
  | "operating_hours"
  | "location_inquiry"
  | "order_booking"
  | "contact_info"
  | "help"
  | "general";

// ─── Context types ───────────────────────────────────────────────────────────

interface ProductRow {
  name: string;
  price: number;
  original_price: number | null;
  description: string;
  is_available: boolean;
  id: string;
  short_code: string | null;
}

interface OrderItemRow {
  name?: string;
  quantity?: number;
  price?: number;
}

interface MerchantContext {
  shopId: string;
  shopName: string;
  category: string;
  location: string;
  operatingStatus: string;
  businessHours: string;
  whatsapp: string;
  deliveryRadius: number;
  minOrder: number;
  freeDeliveryThreshold: number;
  products: ProductRow[];
  totalRevenue: number;
  pendingOrders: number;
  totalOrders: number;
  ordersLast7Days: number;
  ordersPrev7Days: number;
  ordersToday: number;
  ordersYesterday: number;
  revenueToday: number;
  activeProducts: number;
  outOfStock: number;
  totalViews: number;
  totalClicks: number;
  viewsToday: number;
  clicksToday: number;
  clickThroughRate: number;
  topProductsBySales: { name: string; qty: number; revenue: number }[];
  topProductsByClicks: { name: string; clicks: number }[];
  lowStockItems: { name: string; label: string; stock: number }[];
  leadsTotal: number;
  leadsUnconverted: number;
  leadsToday: number;
  avgRating: number;
  reviewCount: number;
  unreadMessages: number;
  peakHour: number;
  peakHourOrders: number;
}

interface CustomerContext {
  userName: string;
  recentOrders: { id: string; status: string; total: number; shopName: string; createdAt: string }[];
  pendingOrderCount: number;
  wishlistCount: number;
  topDeals: { title: string; shopName: string; discount: number; badge?: string }[];
  popularShops: { name: string; category: string; location: string; id: string }[];
}

interface ShopContext {
  shopId: string;
  name: string;
  category: string;
  location: string;
  operatingStatus: string;
  businessHours: string;
  products: {
    id: string;
    name: string;
    price: number;
    description: string;
    available: boolean;
    productPath: string;
  }[];
  whatsapp: string;
}

// ─── Intent detection ────────────────────────────────────────────────────────

function matchAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

export function detectMerchantIntent(message: string): { intent: MerchantIntent; confidence: number } {
  const t = message.toLowerCase();

  if (matchAny(t, [/^(hi|hello|salam|aoa|assalam|hey|help me|madad)/i, /\b(salam|aoa)\b/])) {
    return { intent: "greeting", confidence: 0.95 };
  }
  if (matchAny(t, [/summary|overview|performance|report|status|halat|kya haal|kitna chal/i, /meri shop|my (store|shop|business)/i])) {
    return { intent: "business_summary", confidence: 0.92 };
  }
  if (matchAny(t, [/best.?sell|top.?sell|most.?sell|zyada bik|sab se zyada|best product|top product|kaun sa product|kon sa product/i])) {
    return { intent: "best_product", confidence: 0.93 };
  }
  if (matchAny(t, [/grow|growth|strategy|strateg|badhao|barhao|tips|improve|behtar|success|marketing|promot/i, /business.*(grow|badh)/i])) {
    return { intent: "growth_strategy", confidence: 0.9 };
  }
  if (matchAny(t, [/discount|sale|markdown|offer|chut|kam price|percentage off/i])) {
    return { intent: "discount_advice", confidence: 0.88 };
  }
  if (matchAny(t, [/pending.?order|new order|kitne order|order count|intezar/i])) {
    return { intent: "pending_orders", confidence: 0.9 };
  }
  if (matchAny(t, [/low.?stock|out.?of.?stock|stock kam|khatam|inventory|maujood nahi/i])) {
    return { intent: "low_stock", confidence: 0.9 };
  }
  if (matchAny(t, [/view|click|analytics|traffic|visitor|dekh|traffic/i, /views.*clicks/i])) {
    return { intent: "analytics_insight", confidence: 0.88 };
  }
  if (matchAny(t, [/lead|customer lead|potential customer/i])) {
    return { intent: "lead_insight", confidence: 0.85 };
  }
  if (matchAny(t, [/review|rating|star|feedback|review/i])) {
    return { intent: "review_insight", confidence: 0.85 };
  }
  if (matchAny(t, [/message|chat|inquiry|customer message|reply/i])) {
    return { intent: "messaging_insight", confidence: 0.85 };
  }
  if (matchAny(t, [/revenue|income|earning|sales|kamai|paisa|rupees|rs\.?/i, /kitna kama/i])) {
    return { intent: "revenue_trend", confidence: 0.88 };
  }
  if (matchAny(t, [/peak|busy|time|hour|subah|sham|raat|kab zyada/i])) {
    return { intent: "peak_hours", confidence: 0.85 };
  }
  if (matchAny(t, [/compet|compare|dusri shop|market/i])) {
    return { intent: "competitor_tips", confidence: 0.8 };
  }
  if (matchAny(t, [/ad|sponsor|promo|banner|featured/i])) {
    return { intent: "ads_advice", confidence: 0.85 };
  }
  if (matchAny(t, [/whatsapp|wa\.me|order via/i])) {
    return { intent: "whatsapp_tips", confidence: 0.85 };
  }
  if (matchAny(t, [/help|kya kar sak|what can you|commands/i])) {
    return { intent: "help", confidence: 0.9 };
  }

  return { intent: "general", confidence: 0.5 };
}

export function detectCustomerIntent(message: string): { intent: CustomerIntent; confidence: number } {
  const t = message.toLowerCase();

  if (matchAny(t, [/^(hi|hello|salam|aoa|assalam|hey)/i, /\b(salam|aoa)\b/])) {
    return { intent: "greeting", confidence: 0.95 };
  }
  if (matchAny(t, [/link|url|dhund|find|search|milega|milta|chahiye|dedo|de do|dikhao|best.*(mobile|phone|laptop|iphone)|available|stock mein|kitne|price of|rate of/i, /sasta.*(mobile|phone)/i])) {
    return { intent: "product_search", confidence: 0.92 };
  }
  if (matchAny(t, [/order.*status|mera order|my order|kahan hai order|track|tracking|deliver/i])) {
    return { intent: "order_status", confidence: 0.92 };
  }
  if (matchAny(t, [/how.*order|order kaise|place order|checkout|cart|whatsapp order/i, /kese order|kaise kharid/i])) {
    return { intent: "how_to_order", confidence: 0.9 };
  }
  if (matchAny(t, [/deal|discount|offer|sale|sasta|best price|cheapest/i, /best deal/i])) {
    return { intent: "best_deals", confidence: 0.9 };
  }
  if (matchAny(t, [/best shop|top shop|popular shop|kon si shop|konsi shop|recommend shop/i, /shop suggest/i])) {
    return { intent: "best_shops", confidence: 0.88 };
  }
  if (matchAny(t, [/wishlist|save|favourite|favorite|pasand/i])) {
    return { intent: "wishlist_help", confidence: 0.85 };
  }
  if (matchAny(t, [/track|live|timeline|pending|dispatched/i])) {
    return { intent: "tracking_help", confidence: 0.85 };
  }
  if (matchAny(t, [/chat|message seller|inquiry|contact shop/i])) {
    return { intent: "chat_help", confidence: 0.85 };
  }
  if (matchAny(t, [/deliver|delivery|ghar|address|radius|door/i])) {
    return { intent: "delivery_help", confidence: 0.85 };
  }
  if (matchAny(t, [/account|profile|password|sign|login|otp/i])) {
    return { intent: "account_help", confidence: 0.85 };
  }
  if (matchAny(t, [/sell|merchant|dukan|store register|become merchant/i])) {
    return { intent: "become_merchant", confidence: 0.88 };
  }
  if (matchAny(t, [/help|kya kar sak|what can you|madad/i])) {
    return { intent: "help", confidence: 0.9 };
  }

  return { intent: "general", confidence: 0.5 };
}

export function detectShopIntent(message: string): { intent: ShopIntent; confidence: number } {
  const t = message.toLowerCase();

  if (matchAny(t, [/^(hi|hello|salam|aoa|assalam|hey|help)/i])) {
    return { intent: "greeting", confidence: 0.95 };
  }
  if (matchAny(t, [/link|url|dhund|find|search|milega|milta|chahiye|dedo|de do|dikhao|best.*(mobile|phone|laptop)/i])) {
    return { intent: "product_search", confidence: 0.9 };
  }
  if (matchAny(t, [/price|cost|kitna|rate|rupees|rs\.?|daam/i])) {
    return { intent: "pricing_inquiry", confidence: 0.9 };
  }
  if (matchAny(t, [/product|item|stock|available|sell|bech|sam|hai|maujood|list/i])) {
    return { intent: "product_inquiry", confidence: 0.85 };
  }
  if (matchAny(t, [/open|close|time|hour|timing|subah|sham|kab khul/i])) {
    return { intent: "operating_hours", confidence: 0.9 };
  }
  if (matchAny(t, [/location|address|where|kahan|area|jaga/i])) {
    return { intent: "location_inquiry", confidence: 0.9 };
  }
  if (matchAny(t, [/order|book|delivery|ship|bhej|ghar|pohnch/i])) {
    return { intent: "order_booking", confidence: 0.85 };
  }
  if (matchAny(t, [/whatsapp|contact|phone|number|call|rabta/i])) {
    return { intent: "contact_info", confidence: 0.9 };
  }
  if (matchAny(t, [/help|kya kar sak/i])) {
    return { intent: "help", confidence: 0.9 };
  }

  return { intent: "general", confidence: 0.5 };
}

// ─── Context builders ────────────────────────────────────────────────────────

function parseOrderItems(raw: unknown): OrderItemRow[] {
  if (!Array.isArray(raw)) return [];
  return raw as OrderItemRow[];
}

export async function buildMerchantContext(
  supabase: SupabaseClient,
  shopId: string,
  userId: string,
): Promise<MerchantContext | null> {
  const safeShopId = sanitizeChatString(shopId, 100);
  if (!safeShopId) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select(
      "id, name, category, location, operating_status, business_hours, whatsapp_number, service_radius_km, min_order_amount, free_delivery_threshold, owner_id",
    )
    .eq("id", safeShopId)
    .single();

  if (!shop || shop.owner_id !== userId) return null;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    productsRes,
    ordersRes,
    viewsRes,
    clicksRes,
    viewsTodayRes,
    clicksTodayRes,
    variantsRes,
    leadsRes,
    reviewsRes,
    clickLogsRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, price, original_price, description, is_available, short_code")
      .eq("shop_id", safeShopId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("orders")
      .select("id, total_amount, status, items_json, created_at")
      .eq("shop_id", safeShopId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", safeShopId)
      .eq("event_type", "shop_view"),
    supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", safeShopId)
      .eq("event_type", "product_click"),
    supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", safeShopId)
      .eq("event_type", "shop_view")
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("analytics_logs")
      .select("*", { count: "exact", head: true })
      .eq("shop_id", safeShopId)
      .eq("event_type", "product_click")
      .gte("created_at", todayStart.toISOString()),
    supabase
      .from("inventory_variants")
      .select("stock, low_stock_threshold, is_available, variant_label, products!inner(name)")
      .eq("shop_id", safeShopId)
      .limit(100),
    supabase.from("leads").select("id, is_converted, created_at").eq("shop_id", safeShopId).limit(500),
    supabase.from("reviews").select("rating").eq("shop_id", safeShopId).limit(100),
    supabase
      .from("analytics_logs")
      .select("product_id, products(name)")
      .eq("shop_id", safeShopId)
      .eq("event_type", "product_click")
      .not("product_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  let unreadMessages = 0;
  try {
    const convRes = await supabase
      .from("conversations")
      .select("merchant_unread_count")
      .eq("shop_id", safeShopId);
    unreadMessages = ((convRes.data ?? []) as { merchant_unread_count: number }[]).reduce(
      (s, c) => s + (c.merchant_unread_count ?? 0),
      0,
    );
  } catch {
    unreadMessages = 0;
  }

  const products = ((productsRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
    id: String(p.id),
    name: sanitizeChatString(p.name, 100),
    price: sanitizeChatNumber(p.price, 0),
    original_price: p.original_price != null ? sanitizeChatNumber(p.original_price, 0) : null,
    description: sanitizeChatString(p.description, 120),
    is_available: p.is_available !== false,
    short_code: (p.short_code as string | null) ?? null,
  }));

  const orders = (ordersRes.data ?? []) as {
    total_amount: number;
    status: string;
    items_json: unknown;
    created_at: string;
  }[];

  const validOrders = orders.filter((o) => o.status !== "Cancelled");
  const totalRevenue = validOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  const pendingOrders = orders.filter((o) => o.status === "Pending").length;

  const ordersLast7Days = orders.filter(
    (o) => new Date(o.created_at) >= sevenDaysAgo && o.status !== "Cancelled",
  ).length;
  const ordersPrev7Days = orders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= fourteenDaysAgo && d < sevenDaysAgo && o.status !== "Cancelled";
  }).length;

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  const ordersTodayList = validOrders.filter((o) => new Date(o.created_at) >= todayStart);
  const ordersToday = ordersTodayList.length;
  const revenueToday = ordersTodayList.reduce(
    (s, o) => s + (Number(o.total_amount) || 0),
    0,
  );
  const ordersYesterday = validOrders.filter((o) => {
    const d = new Date(o.created_at);
    return d >= yesterdayStart && d < todayStart;
  }).length;

  const salesMap = new Map<string, { qty: number; revenue: number }>();
  const hourMap = new Map<number, number>();

  for (const order of validOrders) {
    const hour = new Date(order.created_at).getHours();
    hourMap.set(hour, (hourMap.get(hour) ?? 0) + 1);
    for (const item of parseOrderItems(order.items_json)) {
      const name = sanitizeChatString(item.name, 80) || "Unknown";
      const qty = sanitizeChatNumber(item.quantity, 1);
      const rev = sanitizeChatNumber(item.price, 0) * qty;
      const cur = salesMap.get(name) ?? { qty: 0, revenue: 0 };
      salesMap.set(name, { qty: cur.qty + qty, revenue: cur.revenue + rev });
    }
  }

  const topProductsBySales = [...salesMap.entries()]
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);

  const clickMap = new Map<string, number>();
  for (const row of (clickLogsRes.data ?? []) as Record<string, unknown>[]) {
    const productsJoin = row.products as { name?: string } | null;
    const name = sanitizeChatString(productsJoin?.name, 80) || "Product";
    clickMap.set(name, (clickMap.get(name) ?? 0) + 1);
  }
  const topProductsByClicks = [...clickMap.entries()]
    .map(([name, clicks]) => ({ name, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 6);

  let peakHour = 12;
  let peakHourOrders = 0;
  for (const [h, count] of hourMap) {
    if (count > peakHourOrders) {
      peakHour = h;
      peakHourOrders = count;
    }
  }

  const lowStockItems: MerchantContext["lowStockItems"] = [];
  for (const v of (variantsRes.data ?? []) as Record<string, unknown>[]) {
    const stock = sanitizeChatNumber(v.stock, 0);
    const threshold = sanitizeChatNumber(v.low_stock_threshold, 5);
    if (v.is_available !== false && stock >= 0 && stock <= threshold) {
      const prod = v.products as { name?: string } | null;
      lowStockItems.push({
        name: sanitizeChatString(prod?.name, 80) || "Product",
        label: sanitizeChatString(v.variant_label, 40) || "Default",
        stock,
      });
    }
  }

  const leads = (leadsRes.data ?? []) as { is_converted: boolean; created_at: string }[];
  const reviews = (reviewsRes.data ?? []) as { rating: number }[];
  const avgRating =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + sanitizeChatNumber(r.rating, 0), 0) / reviews.length
      : 0;

  const totalViews = viewsRes.count ?? 0;
  const totalClicks = clicksRes.count ?? 0;
  const clickThroughRate = totalViews > 0 ? Math.round((totalClicks / totalViews) * 1000) / 10 : 0;

  return {
    shopId: safeShopId,
    shopName: sanitizeChatString(shop.name, 100),
    category: sanitizeChatString(shop.category, 50),
    location: sanitizeChatString(shop.location, 100),
    operatingStatus: sanitizeChatString(shop.operating_status, 80) || "Operational",
    businessHours: sanitizeChatString(shop.business_hours, 100) || "Not specified",
    whatsapp: sanitizeChatString(shop.whatsapp_number, 30),
    deliveryRadius: sanitizeChatNumber(shop.service_radius_km, 5),
    minOrder: sanitizeChatNumber(shop.min_order_amount, 0),
    freeDeliveryThreshold: sanitizeChatNumber(shop.free_delivery_threshold, 0),
    products,
    totalRevenue,
    pendingOrders,
    totalOrders: validOrders.length,
    ordersLast7Days,
    ordersPrev7Days,
    ordersToday,
    ordersYesterday,
    revenueToday,
    activeProducts: products.filter((p) => p.is_available).length,
    outOfStock: products.filter((p) => !p.is_available).length,
    totalViews,
    totalClicks,
    viewsToday: viewsTodayRes.count ?? 0,
    clicksToday: clicksTodayRes.count ?? 0,
    clickThroughRate,
    topProductsBySales,
    topProductsByClicks,
    lowStockItems: lowStockItems.slice(0, 8),
    leadsTotal: leads.length,
    leadsUnconverted: leads.filter((l) => !l.is_converted).length,
    leadsToday: leads.filter((l) => new Date(l.created_at) >= todayStart).length,
    avgRating: Math.round(avgRating * 10) / 10,
    reviewCount: reviews.length,
    unreadMessages,
    peakHour,
    peakHourOrders,
  };
}

export async function buildCustomerContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<CustomerContext> {
  const [{ data: profile }, ordersRes, wishRes, dealsRes, shopsRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, status, total_amount, created_at, shops(name)")
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("customer_wishlists")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("shop_deals")
      .select("title, price, original_price, badge_text, shops(name)")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("shops")
      .select("id, name, category, location")
      .eq("is_live", true)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const recentOrders = ((ordersRes.data ?? []) as Record<string, unknown>[]).map((o) => {
    const shops = o.shops as { name?: string } | null;
    return {
      id: String(o.id),
      status: sanitizeChatString(o.status, 30),
      total: sanitizeChatNumber(o.total_amount, 0),
      shopName: sanitizeChatString(shops?.name, 80) || "Shop",
      createdAt: String(o.created_at),
    };
  });

  const topDeals = ((dealsRes.data ?? []) as Record<string, unknown>[])
    .map((d) => {
      const shops = d.shops as { name?: string } | null;
      const price = sanitizeChatNumber(d.price, 0);
      const original = sanitizeChatNumber(d.original_price, 0);
      const discount =
        original > price && original > 0
          ? Math.round(((original - price) / original) * 100)
          : 0;
      return {
        title: sanitizeChatString(d.title, 80),
        shopName: sanitizeChatString(shops?.name, 80) || "Shop",
        discount,
        badge: sanitizeChatString(d.badge_text, 30),
      };
    })
    .filter((d) => d.discount > 0 || d.badge)
    .sort((a, b) => b.discount - a.discount)
    .slice(0, 6);

  const popularShops = ((shopsRes.data ?? []) as Record<string, unknown>[]).map((s) => ({
    id: String(s.id),
    name: sanitizeChatString(s.name, 80),
    category: sanitizeChatString(s.category, 50),
    location: sanitizeChatString(s.location, 80),
  }));

  return {
    userName: sanitizeChatString(profile?.full_name, 60) || "Customer",
    recentOrders,
    pendingOrderCount: recentOrders.filter((o) =>
      ["Pending", "Processing", "Dispatched"].includes(o.status),
    ).length,
    wishlistCount: wishRes.count ?? 0,
    topDeals,
    popularShops,
  };
}

export async function buildShopContext(
  supabase: SupabaseClient,
  shopId: string,
): Promise<ShopContext | null> {
  const safeShopId = sanitizeChatString(shopId, 100);
  if (!safeShopId) return null;

  const { data: shop } = await supabase
    .from("shops")
    .select("name, category, location, operating_status, business_hours, whatsapp_number")
    .eq("id", safeShopId)
    .single();

  if (!shop) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, description, is_available, short_code")
    .eq("shop_id", safeShopId)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    shopId: safeShopId,
    name: sanitizeChatString(shop.name, 100),
    category: sanitizeChatString(shop.category, 50),
    location: sanitizeChatString(shop.location, 100),
    operatingStatus: sanitizeChatString(shop.operating_status, 100) || "Operational",
    businessHours: sanitizeChatString(shop.business_hours, 100) || "Not specified",
    whatsapp: sanitizeChatString(shop.whatsapp_number, 30),
    products: (products ?? []).map((p: Record<string, unknown>) => {
      const name = sanitizeChatString(p.name, 100);
      const id = String(p.id);
      return {
        id,
        name,
        price: sanitizeChatNumber(p.price, 0),
        description: sanitizeChatString(p.description, 120),
        available: p.is_available !== false,
        productPath: getProductSeoPath(name, p.short_code as string | null, id),
      };
    }),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

function rs(n: number): string {
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

function formatHour(h: number): string {
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${suffix}`;
}

function trendEmoji(current: number, previous: number): string {
  if (current > previous) return "📈";
  if (current < previous) return "📉";
  return "➡️";
}

function growthTips(ctx: MerchantContext): string[] {
  const tips: string[] = [];

  if (ctx.totalViews < 20) {
    tips.push("• Share your shop QR code locally & on WhatsApp status");
    tips.push("• Add a clear shop banner and logo in Store Settings");
  }
  if (ctx.clickThroughRate < 5 && ctx.totalViews > 30) {
    tips.push("• Improve product photos — views are high but clicks are low");
    tips.push("• Add discount badges on top products");
  }
  if (ctx.pendingOrders > 0) {
    tips.push(`• Respond to ${ctx.pendingOrders} pending order(s) quickly — speed builds trust`);
  }
  if (ctx.unreadMessages > 0) {
    tips.push(`• Reply to ${ctx.unreadMessages} unread customer message(s) in Messages`);
  }
  if (ctx.outOfStock > 0) {
    tips.push(`• ${ctx.outOfStock} product(s) marked unavailable — restock or hide them`);
  }
  if (ctx.lowStockItems.length > 0) {
    tips.push(`• Restock ${ctx.lowStockItems.length} low-inventory item(s) before you miss sales`);
  }
  if (ctx.products.filter((p) => p.original_price && p.original_price > p.price).length === 0) {
    tips.push("• Add strikethrough discounts on 2–3 hero products to attract buyers");
  }
  if (ctx.leadsUnconverted > 3) {
    tips.push(`• Follow up on ${ctx.leadsUnconverted} unconverted leads via WhatsApp`);
  }
  if (ctx.reviewCount < 3) {
    tips.push("• Ask happy customers to leave a review on your shop page");
  }
  if (ctx.ordersLast7Days <= ctx.ordersPrev7Days && ctx.totalOrders > 5) {
    tips.push("• Run a weekend deal or free-delivery promo to boost weekly orders");
  }
  if (tips.length === 0) {
    tips.push("• Keep posting fresh products weekly");
    tips.push("• Try Sponsored Ads in Dashboard → Ads for more visibility");
    tips.push("• Enable free delivery threshold to increase average order value");
  }

  return tips.slice(0, 6);
}

// ─── Response generators ─────────────────────────────────────────────────────

export function generateMerchantResponse(
  intent: MerchantIntent,
  ctx: MerchantContext,
): AssistantResponse {
  const suggestions = [
    "Mera best selling product?",
    "Business grow karne ki strategy",
    "Meri shop ki summary",
    "Pending orders kitne hain?",
  ];

  switch (intent) {
    case "greeting":
      return {
        intent,
        confidence: 0.95,
        suggestions,
        reply: `👋 *Salam!* Main *${ctx.shopName}* ka AI Business Coach hoon — *live store data* se jawab deta hoon.\n\nTry karein:\n• "Meri shop ki live summary"\n• "Aaj kitne orders aaye?"\n• "Best selling product?"\n• "Growth strategy batao"\n\n_Real-time analytics, stock, aur sales tips — seedha aapke dashboard data se._`,
      };

    case "business_summary":
      return {
        intent,
        confidence: 0.92,
        suggestions,
        reply: `📊 *${ctx.shopName} — Business Snapshot*\n\n⚡ *Aaj:* ${ctx.ordersToday} orders · ${rs(ctx.revenueToday)} revenue · ${ctx.viewsToday} views\n\n💰 Total revenue: *${rs(ctx.totalRevenue)}* (${ctx.totalOrders} orders)\n📦 Active products: *${ctx.activeProducts}* · Out of stock: *${ctx.outOfStock}*\n🧾 Pending orders: *${ctx.pendingOrders}*\n👁 Store views: *${ctx.totalViews.toLocaleString()}* · Clicks: *${ctx.totalClicks.toLocaleString()}*\n📈 CTR: *${ctx.clickThroughRate}%*\n🎯 Leads: *${ctx.leadsTotal}* (${ctx.leadsUnconverted} open)\n⭐ Reviews: *${ctx.avgRating || "—"}* (${ctx.reviewCount})\n💬 Unread chats: *${ctx.unreadMessages}*\n\n${trendEmoji(ctx.ordersLast7Days, ctx.ordersPrev7Days)} 7-day orders: *${ctx.ordersLast7Days}* vs last week *${ctx.ordersPrev7Days}*\n\n[Full analytics](/dashboard/analytics) · [Orders](/dashboard/orders)`,
      };

    case "best_product": {
      if (ctx.topProductsBySales.length === 0) {
        return {
          intent,
          confidence: 0.9,
          suggestions,
          reply: `📦 Abhi tak koi confirmed sales data nahi mila.\n\nShuruat ke liye:\n• Apne hero products par discount lagayein\n• WhatsApp se pehle 5 orders complete karein\n• Product photos clear aur attractive rakhein\n\nJab orders aayenge, main exact best-seller bata dunga.`,
        };
      }
      const list = ctx.topProductsBySales
        .slice(0, 5)
        .map((p, i) => {
          const prod = ctx.products.find((x) => x.name === p.name);
          const link = prod
            ? ` · [View](${getProductSeoPath(prod.name, prod.short_code, prod.id)})`
            : "";
          return `${i + 1}. *${p.name}* — ${p.qty} sold · ${rs(p.revenue)}${link}`;
        })
        .join("\n");
      const clickHint =
        ctx.topProductsByClicks.length > 0
          ? `\n\n👆 Most clicked (interest):\n${ctx.topProductsByClicks
              .slice(0, 3)
              .map((p) => `• ${p.name} (${p.clicks} clicks)`)
              .join("\n")}`
          : "";
      return {
        intent,
        confidence: 0.93,
        suggestions,
        reply: `🏆 *Top sellers at ${ctx.shopName}*\n\n${list}${clickHint}\n\n💡 Tip: In products ko homepage par top par rakhein aur discount badge lagayein.`,
      };
    }

    case "growth_strategy": {
      const tips = growthTips(ctx);
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🚀 *Growth Strategy for ${ctx.shopName}*\n\nAapke data ke hisaab se yeh steps sab se zyada impact denge:\n\n${tips.join("\n")}\n\n📍 Location: ${ctx.location} · Radius: ${ctx.deliveryRadius}km\n🛒 Min order: ${ctx.minOrder > 0 ? rs(ctx.minOrder) : "None"} · Free delivery: ${ctx.freeDeliveryThreshold > 0 ? `above ${rs(ctx.freeDeliveryThreshold)}` : "Not set"}`,
      };
    }

    case "discount_advice": {
      const candidates = ctx.products
        .filter((p) => p.is_available && (!p.original_price || p.original_price <= p.price))
        .slice(0, 5);
      const alreadyDiscounted = ctx.products.filter(
        (p) => p.original_price && p.original_price > p.price,
      ).length;
      const list =
        candidates.length > 0
          ? candidates.map((p) => `• *${p.name}* — currently ${rs(p.price)}`).join("\n")
          : "• Sab products par pehle se discount hai ya list khali hai";
      return {
        intent,
        confidence: 0.88,
        suggestions,
        reply: `🏷 *Discount Strategy*\n\nAbhi *${alreadyDiscounted}* products par discount hai.\n\nIn par 5–15% markdown try karein (high clicks / no sales):\n${list}\n\n💡 Psychology tip: Rs. 1000 → Rs. 940 (6% OFF badge) zyada convert karta hai round numbers se.`,
      };
    }

    case "pending_orders":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply:
          ctx.pendingOrders > 0
            ? `🧾 *${ctx.pendingOrders} pending order(s)* intezar kar rahe hain.\n\n✅ Abhi karein:\n1. Dashboard → Orders kholen\n2. Har order confirm karein\n3. WhatsApp par customer ko update bhejein\n4. Status Processing/Dispatched update karein\n\n⚡ Fast response = repeat customers!`
            : `✅ Koi pending order nahi — great job!\n\nAgle orders ke liye WhatsApp notifications on rakhein aur Messages inbox check karte rahein.`,
      };

    case "low_stock":
      if (ctx.lowStockItems.length === 0) {
        return {
          intent,
          confidence: 0.9,
          suggestions,
          reply: `✅ Inventory theek lag rahi hai — koi critical low-stock alert nahi.\n\n${ctx.outOfStock > 0 ? `⚠️ ${ctx.outOfStock} product(s) "Out of Stock" marked hain — unhe restock karein ya hide karein.` : "Sab available products stocked hain."}`,
        };
      }
      const list = ctx.lowStockItems
        .map((i) => `• *${i.name}* (${i.label}) — ${i.stock} left`)
        .join("\n");
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `⚠️ *Low Stock Alert*\n\n${list}\n\nDashboard → Products se stock update karein taake order reject na hon.`,
      };

    case "analytics_insight":
      return {
        intent,
        confidence: 0.88,
        suggestions,
        reply: `📈 *Analytics Insight*\n\n👁 Total views: *${ctx.totalViews.toLocaleString()}*\n👆 Product clicks: *${ctx.totalClicks.toLocaleString()}*\n📊 Click-through rate: *${ctx.clickThroughRate}%*\n📅 Today: ${ctx.viewsToday} views · ${ctx.clicksToday} clicks\n\n${ctx.clickThroughRate < 5 && ctx.totalViews > 20 ? "⚠️ Views achhe hain lekin clicks kam — product titles & photos improve karein." : ctx.totalViews < 50 ? "💡 Visibility badhane ke liye QR code print karein aur Ads section try karein." : "✅ Traffic aur engagement balance achha hai — deals se convert karein."}`,
      };

    case "lead_insight":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `🎯 *Leads Overview*\n\nTotal leads: *${ctx.leadsTotal}*\nOpen (not converted): *${ctx.leadsUnconverted}*\nToday: *${ctx.leadsToday}*\n\n💡 Har open lead ko 24 hours ke andar WhatsApp par follow-up karein. Dashboard → Leads se details dekhein.`,
      };

    case "review_insight":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply:
          ctx.reviewCount > 0
            ? `⭐ *Reviews: ${ctx.avgRating}/5* (${ctx.reviewCount} reviews)\n\n${ctx.avgRating >= 4 ? "✅ Strong social proof — shop page par reviews highlight karein." : "⚠️ Rating improve karein — delivery speed aur product quality par focus karein."}\n\nDelivered orders ke baad politely review maangein.`
            : `⭐ Abhi koi review nahi.\n\nPehle 5 happy customers se review request karein — trust badhta hai aur conversion 20–30% improve ho sakti hai.`,
      };

    case "messaging_insight":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply:
          ctx.unreadMessages > 0
            ? `💬 *${ctx.unreadMessages} unread message(s)*\n\nDashboard → Messages khol kar reply karein. 1 hour ke andar jawab dene wale shops ko zyada repeat orders milte hain.`
            : `💬 Inbox clear hai — shabash!\n\nCustomers ko proactive updates bhejein (order confirmed, dispatched) — yeh chat ko active rakhta hai.`,
      };

    case "revenue_trend":
      return {
        intent,
        confidence: 0.88,
        suggestions,
        reply: `💰 *Revenue Report*\n\nTotal: *${rs(ctx.totalRevenue)}* from *${ctx.totalOrders}* orders\n${trendEmoji(ctx.ordersLast7Days, ctx.ordersPrev7Days)} This week: *${ctx.ordersLast7Days}* orders · Last week: *${ctx.ordersPrev7Days}*\n\n${ctx.ordersLast7Days > ctx.ordersPrev7Days ? "📈 Momentum achha hai — ab top products par bundle deals try karein." : ctx.ordersLast7Days < ctx.ordersPrev7Days ? "📉 Sales slow hain — weekend discount + free delivery threshold set karein." : "➡️ Stable — naye products add karke catalog fresh rakhein."}`,
      };

    case "peak_hours":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `🕐 *Peak Order Time*\n\nSab se zyada orders: *${formatHour(ctx.peakHour)}* (${ctx.peakHourOrders} orders)\n\n💡 Is time window mein:\n• Phone notifications on rakhein\n• WhatsApp quick replies ready rakhein\n• Agar closed hain to business hours update karein`,
      };

    case "competitor_tips":
      return {
        intent,
        confidence: 0.8,
        suggestions,
        reply: `🏪 *Market Position Tips for ${ctx.category}*\n\n1. *Speed* — jo shop pehle WhatsApp reply kare, woh order leti hai\n2. *Photos* — clean background, natural light\n3. *Discounts* — visible % OFF badges\n4. *Delivery* — clear radius & free delivery threshold\n5. *Reviews* — 4.5+ rating trust build karta hai\n\nAapki CTR ${ctx.clickThroughRate}% hai — ${ctx.clickThroughRate >= 8 ? "market average se achha!" : "photos aur titles improve karke 8%+ target karein."}`,
      };

    case "ads_advice":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `📣 *Ads & Promotion*\n\nDashboard → Ads se sponsored banners lagayein.\n\nBest time: jab aapke paas ${ctx.activeProducts}+ products hon aur photos ready hon.\n\nPehle organic try karein:\n• WhatsApp status par shop link\n• QR code print\n• 1 hero product par strong discount\n\nPhir Ads se reach multiply karein.`,
      };

    case "whatsapp_tips":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `📱 *WhatsApp Sales Tips*\n\n1. *Fast reply* — 15 min ke andar\n2. *Order template* — name, items, total, address confirm karein\n3. *Status updates* — Processing → Dispatched → Delivered\n4. *Payment clarity* — COD ya online pehle se bata dein\n\nAapka WhatsApp: ${ctx.whatsapp ? `+${ctx.whatsapp}` : "Store Settings mein add karein"}`,
      };

    case "help":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🤖 *Merchant AI Coach — Commands*\n\n• "Meri shop ki summary"\n• "Best selling product kaun sa?"\n• "Business grow kaise karun?"\n• "Discount kahan lagayein?"\n• "Pending orders kitne?"\n• "Low stock dikhao"\n• "Analytics / revenue report"\n• "Peak hours kab hain?"\n\nMain aapke *real store data* se jawab deta hoon — koi API fee nahi.`,
      };

    default:
      return {
        intent: "general",
        confidence: 0.45,
        suggestions,
        reply: `MAIN_NEEDS_FALLBACK`,
      };
  }
}

export function generateCustomerResponse(
  intent: CustomerIntent,
  ctx: CustomerContext,
): AssistantResponse {
  const suggestions = [
    "Mere orders ka status?",
    "Best deals kahan hain?",
    "Order kaise karun?",
    "Achhi shops recommend karo",
  ];

  switch (intent) {
    case "greeting":
      return {
        intent,
        confidence: 0.95,
        suggestions,
        reply: `👋 *Salam ${ctx.userName}!* Main TrendsMart Shopping Assistant hoon.\n\n*Owner:* Huzaifa\n\nMain aapki madad kar sakta hoon:\n• *Product search + direct links*\n• Orders, deals, shops\n• Policies (Terms, Refund, Privacy)\n\nNeeche tap karein ya likhein!`,
      };

    case "order_status":
      if (ctx.recentOrders.length === 0) {
        return {
          intent,
          confidence: 0.9,
          suggestions,
          reply: `📦 Abhi koi order nahi mila.\n\nOrder karne ke liye:\n1. Koi shop browse karein\n2. Products cart mein add karein\n3. Checkout → WhatsApp order bhejein\n\nYa shop page se "Chat with seller" try karein.`,
        };
      }
      const list = ctx.recentOrders
        .slice(0, 5)
        .map(
          (o) =>
            `• *${o.shopName}* — ${o.status} · ${rs(o.total)} · ${new Date(o.createdAt).toLocaleDateString()}`,
        )
        .join("\n");
      return {
        intent,
        confidence: 0.92,
        suggestions,
        reply: `📦 *Your Recent Orders*\n\n${list}\n\n${ctx.pendingOrderCount > 0 ? `⏳ ${ctx.pendingOrderCount} active order(s) — [Live tracking](/orders/tracking)` : "✅ Koi active pending order nahi."}\n\n📋 [All orders](/orders)`,
      };

    case "how_to_order":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🛒 *TrendsMart par order kaise karein*\n\n1️⃣ Homepage se shop ya product choose karein\n2️⃣ Cart mein add karein (guest bhi kar sakta hai)\n3️⃣ Checkout par name, phone, address bharein\n4️⃣ *Order via WhatsApp* — shop ko formatted message jayegi\n5️⃣ Shop confirm karegi aur deliver karegi\n\n💬 Personal sawal ke liye shop page se *Chat with seller* use karein (sign-in required).`,
      };

    case "best_deals":
      if (ctx.topDeals.length === 0) {
        return {
          intent,
          confidence: 0.85,
          suggestions,
          reply: `🏷 Abhi koi active deal nahi — /deals page check karte rahein.\n\nTip: Wishlist mein products save karein taake discount par notification mile.`,
        };
      }
      const deals = ctx.topDeals
        .map((d) =>
          d.discount > 0
            ? `• *${d.title}* at ${d.shopName} — *${d.discount}% OFF*`
            : `• *${d.title}* at ${d.shopName}${d.badge ? ` — ${d.badge}` : ""}`,
        )
        .join("\n");
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🔥 *Top Deals on TrendsMart*\n\n${deals}\n\n👉 [View all deals](/deals)`,
      };

    case "best_shops":
      if (ctx.popularShops.length === 0) {
        return {
          intent,
          confidence: 0.85,
          suggestions,
          reply: `🏪 Homepage par shops browse karein — category filter se apne area ki dukanain dhundein.`,
        };
      }
      const shops = ctx.popularShops
        .slice(0, 6)
        .map(
          (s) =>
            `• *[${s.name}]* — ${s.category} · ${s.location}\n  🔗 [Visit shop](/shop/${s.id})`,
        )
        .join("\n");
      return {
        intent,
        confidence: 0.88,
        suggestions,
        reply: `⭐ *Shops on TrendsMart*\n\n${shops}\n\n🔎 [Browse all products](/products)`,
      };

    case "wishlist_help":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `❤️ *Wishlist*\n\nAapke paas *${ctx.wishlistCount}* saved item(s) hain.\n\n• Product ya shop par heart icon tap karein\n• /wishlist se alag Products aur Shops tabs dekhein\n• Sign-in par cloud sync hota hai\n\nSaved cheezein baad mein order karne mein asaan hoti hain.`,
      };

    case "tracking_help":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `📍 *Live Order Tracking*\n\nStatus flow: Pending → Processing → Dispatched → Delivered\n\n/orders/tracking par real-time updates milte hain jab shop status change kare.\n\n${ctx.pendingOrderCount > 0 ? `Aapke ${ctx.pendingOrderCount} active order(s) track ho sakte hain.` : "Active order hone par yahan timeline dikhega."}`,
      };

    case "chat_help":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `💬 *In-App Chat with Shops*\n\n1. Shop page → "Chat with seller"\n2. Sign in karein\n3. Message bhejein — shop Dashboard se reply karegi\n\nAapke chats: /account/inquiries\n\nWhatsApp bhi available hai har shop par.`,
        handoff: { type: "inquiries", href: "/account/inquiries", label: "Open human chat" },
      };

    case "delivery_help":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `🚚 *Delivery*\n\nHar shop apna delivery radius set karti hai.\n\nCheckout par address add karein — agar shop ke radius ke andar hain to delivery possible hai.\n\nKuch shops free delivery threshold bhi set karti hain (jaise Rs. 2000+ par free).`,
      };

    case "account_help":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `👤 *Account Help*\n\n• Profile: /account\n• Settings & password: /auth/settings\n• Addresses: /account/addresses\n• Phone OTP checkout par verify hota hai\n\nKoi masla ho to Support section se ticket raise karein.`,
      };

    case "become_merchant":
      return {
        intent,
        confidence: 0.88,
        suggestions,
        reply: `🏪 *Apni dukan TrendsMart par*\n\n1. /account/become-merchant\n2. Store name, category, WhatsApp, logo add karein\n3. Admin approval ke baad Dashboard khulega\n4. Products add karein aur orders receive karein\n\nMerchants ke liye AI Business Coach bhi hai: /dashboard/assistant`,
      };

    case "help":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🤖 *Shopping Assistant — Commands*\n\n• "Best mobile ka link do"\n• "Sasta laptop dhundo"\n• "Mere orders ka status"\n• "Best deals kahan hain?"\n• "Achhi shops batao"\n\nHar jawab mein *clickable links* milenge — seedha product/shop par jayein.`,
      };

    default:
      return {
        intent: "general",
        confidence: 0.45,
        suggestions,
        reply: `MAIN_NEEDS_FALLBACK`,
      };
  }
}

export function generateShopResponse(intent: ShopIntent, ctx: ShopContext): AssistantResponse {
  const suggestions = getShopCategoryPrompts(ctx.category, ctx.name);

  switch (intent) {
    case "greeting":
      return {
        intent,
        confidence: 0.95,
        suggestions,
        reply: `👋 *Salam!* Main *TrendBot* hoon — *${ctx.name}* ka AI assistant.\n\n*${ctx.category}* · ${ctx.location}\n\nPooch sakte hain products, prices, timings, delivery.\n\nHuman reply: *Message seller* button.`,
      };

    case "product_inquiry":
      if (ctx.products.length === 0) {
        return {
          intent,
          confidence: 0.85,
          suggestions,
          reply: `📦 *${ctx.name}* par abhi products list nahi hain. WhatsApp: +${ctx.whatsapp}`,
        };
      }
      const available = ctx.products.filter((p) => p.available);
      const list = available
        .slice(0, 6)
        .map(
          (p) =>
            `• *${p.name}* — ${rs(p.price)}${p.description ? ` (${p.description.slice(0, 50)})` : ""}\n  🔗 [Open](${p.productPath})`,
        )
        .join("\n");
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `📦 *Products at ${ctx.name}*\n\n${list}${available.length > 6 ? `\n\n_+${available.length - 6} more on shop page_` : ""}\n\n🛒 [Browse full shop](${`/shop/${ctx.shopId}`})`,
      };

    case "pricing_inquiry":
      if (ctx.products.length === 0) {
        return {
          intent,
          confidence: 0.9,
          suggestions,
          reply: `💰 Pricing ke liye WhatsApp karein: +${ctx.whatsapp}`,
        };
      }
      const prices = ctx.products
        .filter((p) => p.available)
        .slice(0, 8)
        .map((p) => `• *${p.name}* — ${rs(p.price)} · [View](${p.productPath})`)
        .join("\n");
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `💰 *Pricing at ${ctx.name}*\n\n${prices}\n\n🛒 [Order from shop](${`/shop/${ctx.shopId}`})`,
      };

    case "operating_hours":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🕐 *${ctx.name} — Hours*\n\n${ctx.businessHours}\n\nStatus: *${ctx.operatingStatus}*\n📍 ${ctx.location}`,
      };

    case "location_inquiry":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `📍 *${ctx.name}* — ${ctx.location}\n\nDelivery options WhatsApp par confirm karein: +${ctx.whatsapp}`,
      };

    case "order_booking":
      return {
        intent,
        confidence: 0.85,
        suggestions,
        reply: `🛒 *Order from ${ctx.name}*\n\n1. Shop page se products cart mein add karein\n2. Checkout → Order via WhatsApp\n3. Hum confirm karenge!\n\n📞 +${ctx.whatsapp}`,
      };

    case "contact_info":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `📞 *Contact ${ctx.name}*\n\n• WhatsApp: +${ctx.whatsapp}\n• Location: ${ctx.location}\n• Category: ${ctx.category}\n\n💬 In-app chat bhi available (sign in required).`,
      };

    case "help":
      return {
        intent,
        confidence: 0.9,
        suggestions,
        reply: `🤖 *${ctx.name} Shop Assistant*\n\n• Products & prices\n• Business hours\n• Location & delivery\n• How to order\n\nHuman chat: "Chat with seller" button.`,
      };

    default:
      return {
        intent: "general",
        confidence: 0.45,
        suggestions,
        reply: `MAIN_NEEDS_FALLBACK`,
      };
  }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

function withThinking(
  res: AssistantResponse,
  role: AssistantRole,
  query?: string,
): AssistantResponse {
  return {
    ...res,
    thinkingSteps: getThinkingSteps(res.intent, role, query),
  };
}

function isShortGreeting(message: string): boolean {
  const t = message.trim().toLowerCase();
  return /^(hi|hello|salam|aoa|assalam|hey|help)[!.?\s]*$/i.test(t);
}

async function tryProductSearch(
  supabase: SupabaseClient,
  message: string,
  role: AssistantRole,
  shopId?: string,
  shopCategory?: string,
  shopName?: string,
  location?: { lat: number; lng: number },
): Promise<AssistantResponse | null> {
  if (isShortGreeting(message)) return null;
  if (!shouldRunProductSearch(message, role)) return null;

  const query = extractProductQuery(message) ?? message.trim().slice(0, 60);
  if (!query || query.length < 2) return null;

  const sortMode = detectSortMode(message);
  let hits = await searchProductsForAssistant(supabase, {
    query,
    shopId: role === "customer" ? undefined : shopId,
    limit: 5,
    sortMode,
    originalMessage: message,
    userLat: location?.lat,
    userLng: location?.lng,
  });
  hits = hits.filter((h) => h.score >= MIN_PRODUCT_SCORE);

  if (!hits.length) {
    hits = (
      await searchProductsLoose(supabase, {
        message,
        shopId: role === "customer" ? undefined : shopId,
        limit: 5,
        userLat: location?.lat,
        userLng: location?.lng,
      })
    ).filter((h) => h.score >= MIN_PRODUCT_SCORE);
  }

  if (hits.length > 0) {
    const formatted = formatProductSearchReply(hits, query, role, sortMode, shopCategory, shopName);
    return {
      ...formatted,
      products: hits,
    };
  }

  if (looksLikeProductSearch(message)) {
    return buildHelpfulGuideReply({
      reason: "no_match",
      query,
      role,
    });
  }

  return null;
}

function looksLikeCartQuery(message: string): boolean {
  return /\b(cart|basket|mer[ea] cart|cart mein|cart me|kitne items|cart ka status)\b/i.test(message);
}

function looksLikePageHelp(message: string): boolean {
  return /\b(yeh page|is page|yahan kya|where am i|current page|ye page)\b/i.test(message);
}

function buildCartReply(cart?: AssistantRequest["cartSummary"]): AssistantResponse {
  if (!cart || cart.count <= 0) {
    return {
      intent: "cart_help",
      confidence: 0.92,
      suggestions: ["Best mobile ka link do", "Best deals?", "Order kaise karun?"],
      reply:
        `🛒 *Aapka cart khali hai.*\n\nProducts add karke [Cart](/cart) se WhatsApp order bhej sakte ho.\n\nTip: *"best mobile ka link do"* likho — main seedha product link dunga.`,
    };
  }
  const lines = cart.lines.slice(0, 6).map((l) => `• ${l}`).join("\n");
  return {
    intent: "cart_help",
    confidence: 0.95,
    suggestions: ["Order kaise karun?", "Best deals?", "Mere orders?"],
    reply:
      `🛒 *Aapke cart mein ${cart.count} item(s)* — total ~Rs. ${cart.total.toLocaleString("en-PK")}\n\n${lines}\n\n👉 [Open cart & checkout](/cart)`,
  };
}

function buildPageContextReply(pathname?: string, cart?: AssistantRequest["cartSummary"]): AssistantResponse | null {
  if (!pathname) return null;
  const p = pathname.toLowerCase();
  let tip = "";
  if (p === "/" || p.startsWith("/?")) tip = "Aap *homepage* par hain — Live Shops, categories, aur TrendBot se product search.";
  else if (p.startsWith("/shop/")) tip = "Aap *kisi shop* ke storefront par hain — products browse karein ya mujh se us shop ke items poochhein.";
  else if (p.startsWith("/products")) tip = "Aap *products browse* kar rahe hain — filter/sort use karein ya mujh se best pick maangein.";
  else if (p.startsWith("/cart")) tip = "Aap *cart* par hain — checkout se WhatsApp order jayega.";
  else if (p.startsWith("/orders")) tip = "Aap *orders* section mein hain — status track kar sakte ho.";
  else if (p.startsWith("/wishlist")) tip = "Aap *wishlist* par hain — saved items yahan milte hain.";
  else if (p.startsWith("/deals")) tip = "Aap *deals* page par hain — discounts explore karein.";
  else if (p.startsWith("/dashboard")) tip = "Aap *merchant dashboard* par hain — live summary ke liye poochhein.";
  else tip = `Aap *${pathname}* par hain.`;

  const cartLine =
    cart && cart.count > 0
      ? `\n\n🛒 Cart: ${cart.count} item(s) · [Open cart](/cart)`
      : "";

  return {
    intent: "page_context",
    confidence: 0.9,
    suggestions: ["Best mobile ka link do", "Mere cart mein kya hai?", "Order kaise karun?"],
    reply: `📍 ${tip}${cartLine}\n\nKuch aur chahiye? Product link, deals, ya help — likh do.`,
  };
}

export async function runAssistant(
  supabase: SupabaseClient,
  req: AssistantRequest,
): Promise<AssistantResponse> {
  const rawMessage = req.message.trim();
  if (!rawMessage) {
    return { reply: "Please type a message.", intent: "empty", confidence: 0 };
  }

  const historyResolved = resolveMessageWithHistory(rawMessage, req.history);
  const nlu = runLocalNlu(historyResolved);
  const lang = normalizeUserLanguage(historyResolved);
  const message =
    nlu.normalizedMessage.length >= 2 ? nlu.normalizedMessage : historyResolved;
  const role = req.role;
  let shopCategoryHint = req.shopCategory ?? nlu.categoryHint ?? lang.likelyCategory;

  const honestFallback = (preferredQuery?: string) =>
    buildHonestFallbackReply(supabase, {
      message: historyResolved,
      role,
      shopId: req.shopId,
      shopCategory: shopCategoryHint,
      shopName: req.shopName,
      location: req.location,
      preferredQuery,
    });

  if (isOutOfScope(historyResolved)) {
    return withThinking(
      buildHelpfulGuideReply({ reason: "out_of_scope", query: historyResolved.slice(0, 40), role }),
      role,
    );
  }

  // Brand / owner / policies / how-it-works — FIRST (100% local, no API)
  if (
    nlu.intent === "brand_owner" ||
    nlu.intent === "policy" ||
    nlu.intent === "how_it_works" ||
    nlu.intent === "support"
  ) {
    const brandHit =
      matchBrandKnowledge(historyResolved, role) ?? matchBrandKnowledge(message, role);
    if (brandHit) return withThinking(brandHit, role);
  } else {
    const brandHit =
      matchBrandKnowledge(historyResolved, role) ?? matchBrandKnowledge(message, role);
    if (brandHit && brandHit.confidence >= 0.75) {
      return withThinking(brandHit, role);
    }
  }

  const searchQuery = nlu.searchQuery ? applySpellFixes(nlu.searchQuery) : undefined;
  if (nlu.categoryHint) shopCategoryHint = nlu.categoryHint;

  // ── Live cart / page context ────────────────────────────────────────────
  if (role !== "merchant" && (nlu.intent === "cart_help" || looksLikeCartQuery(historyResolved))) {
    return withThinking(buildCartReply(req.cartSummary), role);
  }
  if (looksLikePageHelp(historyResolved)) {
    const pageRes = buildPageContextReply(req.pathname, req.cartSummary);
    if (pageRes) return withThinking(pageRes, role);
  }

  // ── App knowledge (FAQs + features) ─────────────────────────────────────
  const appHit = matchAppKnowledge(historyResolved, role) ?? matchAppKnowledge(message, role);
  if (appHit && appHit.confidence >= MIN_KNOWLEDGE_CONFIDENCE) {
    const hintBoost =
      req.memoryHints?.length &&
      req.memoryHints.some((h) => historyResolved.toLowerCase().includes(h.toLowerCase().slice(0, 12)));
    return withThinking(
      {
        reply: appHit.reply,
        intent: appHit.intent,
        confidence: hintBoost ? Math.min(appHit.confidence + 0.05, 0.99) : appHit.confidence,
        suggestions:
          appHit.suggestions ??
          (role === "merchant"
            ? ["Meri shop ki live summary", "Best selling product?", "Growth strategy"]
            : ["TrendsMart ka owner?", "Best mobile ka link do", "Order kaise karun?", "Refund policy?"]),
        handoff:
          role === "shop" && req.shopId
            ? { type: "shop", href: `/shop/${req.shopId}`, label: "Message seller" }
            : { type: "support", href: "/contact", label: "Contact support" },
      },
      role,
    );
  }

  // ── Category browse + live products ─────────────────────────────────────
  if (nlu.intent === "category_browse" || nlu.intent === "deals") {
    const catMatch = await matchCategoryFromMessage(supabase, historyResolved);
    if (catMatch && catMatch.score >= 40) {
      const catProducts = await searchProductsByCategory(supabase, {
        category: catMatch.category,
        shopId: role === "shop" ? req.shopId : undefined,
        limit: 5,
        userLat: req.location?.lat,
        userLng: req.location?.lng,
      });
      if (catProducts.length) {
        return withThinking(
          {
            ...formatProductSearchReply(
              catProducts,
              catMatch.subCategory || catMatch.category,
              role,
              nlu.intent === "deals" ? "best_deal" : nlu.sortMode,
              catMatch.category,
              req.shopName,
            ),
            products: catProducts,
          },
          role,
        );
      }
      const catReply = await buildCategoryBrowseReply(supabase, catMatch);
      if (catReply) return withThinking(catReply, role);
    }
  }

  // ── Platform business advisor ───────────────────────────────────────────
  if (
    (role === "customer" || role === "shop") &&
    (looksLikeBusinessAdvisor(historyResolved) || looksLikePlatformTrends(historyResolved))
  ) {
    const snapshot = await fetchPlatformSnapshot(supabase);
    if (looksLikeBusinessAdvisor(historyResolved)) {
      return withThinking(generateBusinessAdvisorReply(snapshot, historyResolved), role);
    }
    return withThinking(generatePlatformTrendsReply(snapshot), role);
  }

  // ── Product search (local NLU) ──────────────────────────────────────────
  const searchMessage = searchQuery ? `${searchQuery} ${message}` : message;
  const productHit = await tryProductSearch(
    supabase,
    searchMessage,
    role,
    req.shopId,
    shopCategoryHint,
    req.shopName,
    req.location,
  );
  if (productHit) {
    return withThinking(productHit, role, extractProductQuery(searchMessage) ?? searchMessage);
  }

  if (nlu.intent === "product_search" || nlu.intent === "shop_search") {
    return withThinking(await honestFallback(searchQuery || message), role, message);
  }

  // ── Universal search ────────────────────────────────────────────────────
  if (looksLikeUniversalSearch(historyResolved) && role !== "merchant") {
    const q = searchQuery || extractProductQuery(message) || message;
    const uni = await runUniversalSearch(supabase, q, role === "shop" ? req.shopId : undefined);
    if (uni && uni.confidence >= 0.8) return withThinking(uni, role, q);
  }

  if (role === "merchant") {
    if (!req.shopId || !req.userId) {
      return { reply: "Sign in as a merchant to use the Business AI Coach.", intent: "auth", confidence: 0 };
    }

    const ctx = await buildMerchantContext(supabase, req.shopId, req.userId);
    if (!ctx) {
      return { reply: "Could not load your shop data. Register a store first.", intent: "no_shop", confidence: 0 };
    }

    if (looksLikeLiveAnalytics(historyResolved)) {
      return withThinking(
        {
          reply: formatMerchantLivePulse({
            shopName: ctx.shopName,
            ordersToday: ctx.ordersToday,
            revenueToday: ctx.revenueToday,
            ordersYesterday: ctx.ordersYesterday,
            viewsToday: ctx.viewsToday,
            clicksToday: ctx.clicksToday,
            pendingOrders: ctx.pendingOrders,
            unreadMessages: ctx.unreadMessages,
          }),
          intent: "live_pulse",
          confidence: 0.94,
          suggestions: [
            "Meri shop ki full summary",
            "Best selling product?",
            "Growth strategy batao",
            "Aaj kitne views aaye?",
          ],
        },
        role,
      );
    }

    const { intent, confidence } = detectMerchantIntent(historyResolved);
    const res = generateMerchantResponse(intent, ctx);
    if (intent === "general" || res.reply === "MAIN_NEEDS_FALLBACK" || confidence < 0.7) {
      const fallback = await honestFallback(searchQuery);
      if (
        fallback.intent !== "helpful_guide" &&
        fallback.intent !== "helpful_redirect" &&
        fallback.intent !== "honest_refuse"
      ) {
        return withThinking(fallback, role, message);
      }
      if (intent === "general" || res.reply === "MAIN_NEEDS_FALLBACK") {
        return withThinking(
          {
            intent: "merchant_help",
            confidence: 0.85,
            suggestions: [
              "Meri shop ki live summary",
              "Best selling product?",
              "Growth strategy batao",
              "Pending orders kitne?",
            ],
            reply:
              `🤖 *${ctx.shopName}* — main aapke *live store data* se guide karta hoon.\n\n` +
              `Pooch sakte hain:\n• Live summary / revenue / views\n• Best sellers / low stock\n• Growth, discounts, ads, WhatsApp tips\n• Product naam → stock/price check\n\n` +
              `TrendsMart Owner: *Huzaifa*\n\n` +
              `👉 [Analytics](/dashboard/analytics) · [Orders](/dashboard/orders) · [Products](/dashboard/products)`,
          },
          role,
        );
      }
    }
    return withThinking(res, role);
  }

  if (role === "customer") {
    if (!req.userId) {
      return withThinking(await honestFallback(searchQuery), role, message);
    }

    const ctx = await buildCustomerContext(supabase, req.userId);
    const { intent, confidence } = detectCustomerIntent(historyResolved);
    const res = generateCustomerResponse(intent, ctx);

    if (intent === "general" || res.reply === "MAIN_NEEDS_FALLBACK" || confidence < 0.7) {
      return withThinking(await honestFallback(searchQuery), role, message);
    }

    return withThinking(res, role);
  }

  // shop storefront
  if (!req.shopId) {
    return withThinking(await honestFallback(searchQuery), role, message);
  }

  const shopCtx = await buildShopContext(supabase, req.shopId);
  if (!shopCtx) {
    return withThinking(await honestFallback(searchQuery), role, message);
  }
  const { intent, confidence } = detectShopIntent(historyResolved);
  const res = generateShopResponse(intent, shopCtx);
  if (
    intent === "general" ||
    intent === "product_search" ||
    res.reply === "MAIN_NEEDS_FALLBACK" ||
    confidence < 0.7
  ) {
    const fallback = await honestFallback(searchQuery);
    if (fallback.intent !== "helpful_guide" && fallback.intent !== "helpful_redirect" && fallback.intent !== "honest_refuse") {
      return withThinking(fallback, role, message);
    }
    if (shopCtx.products.length > 0 && intent === "product_search") {
      // Only list real shop products when user asked about products but search failed
      const list = shopCtx.products
        .filter((p) => p.available)
        .slice(0, 5)
        .map((p) => `• *${p.name}* — Rs. ${p.price.toLocaleString("en-PK")} · [Open](${p.productPath})`)
        .join("\n");
      if (list) {
        return withThinking(
          {
            intent: "product_inquiry",
            confidence: 0.8,
            suggestions: getShopCategoryPrompts(shopCtx.category, shopCtx.name),
            reply:
              `📦 *${shopCtx.name}* ke confirmed products:\n\n${list}\n\n` +
              `🛒 [Browse full shop](/shop/${shopCtx.shopId})\n📞 WhatsApp: +${shopCtx.whatsapp}`,
            handoff: { type: "shop", href: `/shop/${shopCtx.shopId}`, label: "Message seller" },
          },
          role,
          message,
        );
      }
    }
    return withThinking(fallback, role, message);
  }
  return withThinking(res, role);
}

export const MERCHANT_PROMPTS = [
  "Meri shop ki live summary",
  "Aaj kitne orders aaye?",
  "Best selling product kaun sa?",
  "Business grow karne ki strategy",
  "Best mobile stock mein hai?",
  "Revenue report",
];

export const CUSTOMER_PROMPTS = [
  "Best mobile ka link do",
  "Konsa business karun?",
  "TrendsMart par kya chal raha?",
  "Cart kaise kaam karta hai?",
  "Best deals kahan hain?",
  "Mere orders ka status?",
];

export const SHOP_PROMPTS = [
  "Best mobile ka link do",
  "Products aur prices?",
  "Kab khulte hain?",
  "Order kaise karun?",
];
