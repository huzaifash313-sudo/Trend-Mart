/* -------------------------------------------------------------------------- */
/*  TrendsMart — Demo promotional ads (local / preview fallback)               */
/*  Used when the DB has no live ads and NEXT_PUBLIC_DEMO_ADS is enabled.     */
/*  Mirrors supabase/migrations/20260831000000_demo_promotional_ads.sql        */
/* -------------------------------------------------------------------------- */

import type { PromotionalAd, PromoAdPlacement } from "@/types";

const SHOP = {
  tandoori: "a0000000-0000-4000-8000-000000000001",
  pizza: "a0000000-0000-4000-8000-000000000002",
  grocery: "a0000000-0000-4000-8000-000000000003",
  bakery: "a0000000-0000-4000-8000-000000000004",
  desi: "a0000000-0000-4000-8000-000000000005",
  clothes: "a0000000-0000-4000-8000-000000000007",
} as const;

const IMG = {
  platform: "https://images.unsplash.com/photo-1607082348824-0a960f2a4b9d?auto=format&fit=crop&w=1200&q=80",
  pizza: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
  burger: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1200&q=80",
  grocery: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
  fashion: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
  bakery: "https://images.unsplash.com/photo-1486427944299-d1955d23e34d?auto=format&fit=crop&w=1200&q=80",
  desi: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=1200&q=80",
  deals: "https://images.unsplash.com/photo-1607083206869-4c7672f72a1d?auto=format&fit=crop&w=1200&q=80",
  tandooriBanner: "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80",
  bbq: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?auto=format&fit=crop&w=1200&q=80",
} as const;

function baseAd(
  partial: Pick<PromotionalAd, "id" | "title" | "subtitle" | "image_url" | "link_url" | "badge_label" | "placement" | "sort_order"> &
    Partial<Pick<PromotionalAd, "shop_id">>,
): PromotionalAd {
  const now = new Date().toISOString();
  return {
    shop_id: partial.shop_id ?? null,
    title: partial.title,
    subtitle: partial.subtitle ?? null,
    image_url: partial.image_url,
    link_url: partial.link_url,
    badge_label: partial.badge_label ?? "Sponsored",
    placement: partial.placement,
    sort_order: partial.sort_order,
    id: partial.id,
    status: "approved",
    is_active: true,
    starts_at: null,
    ends_at: null,
    impression_count: 0,
    click_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/** Full demo catalog — 3 ads per marketplace page + 3 for Tandoori store page. */
export const DEMO_PROMO_ADS: PromotionalAd[] = [
  // ── Homepage ──────────────────────────────────────────────────────────────
  baseAd({
    id: "f0000001-0000-4000-8000-000000000001",
    title: "TrendsMart — Your Neighborhood Marketplace",
    subtitle: "Discover 600+ products from local Gujranwala shops",
    image_url: IMG.platform,
    link_url: "/products",
    badge_label: "Featured",
    placement: "homepage_top",
    sort_order: 0,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000002",
    shop_id: SHOP.tandoori,
    title: "Tandoori Express — Free Delivery",
    subtitle: "Orders above Rs 1,500 deliver free across Satellite Town",
    image_url: IMG.pizza,
    link_url: "/shop/demo-tandoori",
    badge_label: "Hot Deal",
    placement: "homepage_top",
    sort_order: 1,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000003",
    shop_id: SHOP.pizza,
    title: "Pizza Palace Family Combo",
    subtitle: "Large pizza + 1.5L drink at Rs 1,499 — this week only",
    image_url: IMG.pizza,
    link_url: "/shop/demo-pizza",
    badge_label: "Limited Time",
    placement: "homepage_top",
    sort_order: 2,
  }),

  // ── Products page ─────────────────────────────────────────────────────────
  baseAd({
    id: "f0000001-0000-4000-8000-000000000004",
    title: "Browse Everything Near You",
    subtitle: "Filter by category, distance, and best discounts",
    image_url: IMG.platform,
    link_url: "/products",
    badge_label: "Sponsored",
    placement: "products_top",
    sort_order: 0,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000005",
    shop_id: SHOP.grocery,
    title: "Al-Madina Super Store",
    subtitle: "Daily kiryana staples — delivery in 30 minutes",
    image_url: IMG.grocery,
    link_url: "/shop/demo-grocery",
    badge_label: "Trusted Shop",
    placement: "products_top",
    sort_order: 1,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000006",
    shop_id: SHOP.clothes,
    title: "Trendy Threads — New Arrivals",
    subtitle: "Fresh kurta designs & polos — buy 2 get 5% off",
    image_url: IMG.fashion,
    link_url: "/shop/demo-clothes",
    badge_label: "New",
    placement: "products_top",
    sort_order: 2,
  }),

  // ── Deals page ────────────────────────────────────────────────────────────
  baseAd({
    id: "f0000001-0000-4000-8000-000000000007",
    title: "Today's Best Deals",
    subtitle: "Hand-picked discounts updated every morning",
    image_url: IMG.deals,
    link_url: "/deals",
    badge_label: "Featured",
    placement: "deals_top",
    sort_order: 0,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000008",
    shop_id: SHOP.bakery,
    title: "Sweet Bites — Custom Cakes",
    subtitle: "Order 24 hrs ahead · free message on top",
    image_url: IMG.bakery,
    link_url: "/shop/demo-bakery",
    badge_label: "Sweet Deal",
    placement: "deals_top",
    sort_order: 1,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000009",
    shop_id: SHOP.desi,
    title: "Dera Desi Karahi Combo",
    subtitle: "Chicken karahi + 4 naan at Rs 1,999",
    image_url: IMG.desi,
    link_url: "/shop/demo-desi",
    badge_label: "Hot Deal",
    placement: "deals_top",
    sort_order: 2,
  }),

  // ── Tandoori Express store page ───────────────────────────────────────────
  baseAd({
    id: "f0000001-0000-4000-8000-000000000010",
    shop_id: SHOP.tandoori,
    title: "Wood-Fired Pizza Week",
    subtitle: "All medium pizzas 15% off — dine-in or delivery",
    image_url: IMG.tandooriBanner,
    link_url: "/shop/demo-tandoori",
    badge_label: "Store Pick",
    placement: "store_top",
    sort_order: 0,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000011",
    shop_id: SHOP.tandoori,
    title: "Zinger Burger Combo",
    subtitle: "Zinger + fries + drink at Rs 699",
    image_url: IMG.burger,
    link_url: "/shop/demo-tandoori",
    badge_label: "Combo Deal",
    placement: "store_top",
    sort_order: 1,
  }),
  baseAd({
    id: "f0000001-0000-4000-8000-000000000012",
    shop_id: SHOP.tandoori,
    title: "QR Dine-in — Scan & Order",
    subtitle: "No app needed · table order in 30 seconds",
    image_url: IMG.bbq,
    link_url: "/shop/demo-tandoori",
    badge_label: "New",
    placement: "store_top",
    sort_order: 2,
  }),
];

export function demoAdsEnabled(): boolean {
  // Demo ads show whenever the DB has no live ads for a placement.
  // Opt out in production with NEXT_PUBLIC_DEMO_ADS=false once real ads are live.
  return process.env.NEXT_PUBLIC_DEMO_ADS !== "false";
}

export function getDemoAdsForPlacement(
  placement: PromoAdPlacement,
  shopId?: string | null,
): PromotionalAd[] {
  if (placement === "store_top") {
    if (!shopId) return [];
    const scoped = DEMO_PROMO_ADS.filter(
      (ad) => ad.placement === "store_top" && ad.shop_id === shopId,
    );
    if (scoped.length > 0) {
      return scoped.sort((a, b) => a.sort_order - b.sort_order);
    }
    // Any storefront gets sample highlights when no DB ads exist for that shop.
    return DEMO_PROMO_ADS.filter((ad) => ad.placement === "store_top")
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((ad) => ({
        ...ad,
        id: `${ad.id}::${shopId}`,
        shop_id: shopId,
      }));
  }

  return DEMO_PROMO_ADS.filter((ad) => ad.placement === placement).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}
