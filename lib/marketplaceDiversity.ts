/* -------------------------------------------------------------------------- */
/*  Marketplace feed diversity — fair mix across shops                        */
/*                                                                            */
/*  Goals:                                                                    */
/*  - Top deals get spotlight slots (not the whole feed)                      */
/*  - Fresh / “popular-proxy” items also surface                              */
/*  - Every shop gets a turn — one store dumping discounts cannot flood top   */
/* -------------------------------------------------------------------------- */

import type { MarketplaceProduct } from "@/types";
import { getProductDiscount } from "@/lib/formatters";

export type MarketplaceFeedSort =
  | "for_you"
  | "popular"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "discount";

/**
 * Soft caps for the *early* fair window (first screenfuls).
 * Beyond the cap, remaining items still appear lower — interleaved, not dumped.
 */
const MAX_PER_SHOP_EARLY: Record<MarketplaceFeedSort, number> = {
  for_you: 3,
  popular: 6,
  newest: 4,
  discount: 5,
  price_asc: 10,
  price_desc: 10,
};

/** Optional engagement hint (clicks/orders) when available — 0 if unknown. */
export type PopularityMap = Record<string, number>;

function hasImage(p: MarketplaceProduct): boolean {
  return !!(p.image_url?.trim() || (Array.isArray(p.images) && p.images.length > 0));
}

function discountPercent(p: MarketplaceProduct): number {
  return getProductDiscount(p).discountPercent;
}

function createdMs(p: MarketplaceProduct): number {
  return p.created_at ? Date.parse(p.created_at) || 0 : 0;
}

/**
 * Diminishing returns on % OFF so a shop with “everything 40% off”
 * does not crush shops with one strong deal or great fresh stock.
 */
function discountSignal(p: MarketplaceProduct): number {
  const d = discountPercent(p);
  if (d <= 0) return 0;
  // Cap effective signal around ~55% — 90% off is not 2× better than 45%
  const capped = Math.min(d, 55);
  return Math.sqrt(capped / 55) * 100;
}

function freshnessSignal(p: MarketplaceProduct, newestMs: number, oldestMs: number): number {
  const t = createdMs(p);
  if (!t || newestMs <= oldestMs) return 50;
  return ((t - oldestMs) / (newestMs - oldestMs)) * 100;
}

function popularitySignal(p: MarketplaceProduct, popularity?: PopularityMap): number {
  const raw = popularity?.[p.id] ?? 0;
  if (raw <= 0) {
    // Soft proxy until real click/order tallies exist on the public feed
    return hasImage(p) ? 35 : 10;
  }
  // log-ish scale so one viral item does not erase everyone else
  return Math.min(100, Math.log10(raw + 1) * 40);
}

/**
 * Balanced “For You” score: deals + freshness + popularity proxy.
 * Used inside a shop’s queue — never alone as a global sort (that floods).
 */
export function scoreForYouBalanced(
  p: MarketplaceProduct,
  ctx: { newestMs: number; oldestMs: number; popularity?: PopularityMap },
): number {
  const deal = discountSignal(p);
  const fresh = freshnessSignal(p, ctx.newestMs, ctx.oldestMs);
  const pop = popularitySignal(p, ctx.popularity);
  const img = hasImage(p) ? 8 : 0;
  // Deals lead lightly, but freshness + popularity still matter — not discount-only
  return deal * 0.45 + fresh * 0.28 + pop * 0.2 + img;
}

/** Pure deal score (Best deals sort / deal lane). */
export function scoreDeal(p: MarketplaceProduct): number {
  return discountSignal(p) * 10 + freshnessSignal(p, Date.now(), 0) * 0.01 + (hasImage(p) ? 1 : 0);
}

/** Higher = better pick within a single shop for this sort mode. */
export function scoreProductForSort(
  p: MarketplaceProduct,
  sort: MarketplaceFeedSort,
  popularity?: PopularityMap,
): number {
  const disc = discountPercent(p);
  const created = createdMs(p);
  const imgBoost = hasImage(p) ? 50_000 : 0;
  const pop = popularity?.[p.id] ?? 0;

  switch (sort) {
    case "price_asc":
      return imgBoost - p.price;
    case "price_desc":
      return imgBoost + p.price;
    case "popular": {
      // Popularity proxy: shop rating + review volume, then discount + recency.
      const rating = Number(p.shop_avg_rating) || 0;
      const reviews = Number(p.shop_review_count) || 0;
      return (
        imgBoost +
        rating * 100_000 +
        Math.log10(reviews + 1) * 50_000 +
        disc * 100 +
        created / 1_000
      );
    }
    case "newest":
      return imgBoost + created / 1_000 + pop;
    case "discount":
      return imgBoost + disc * 1_000_000 + created / 1_000;
    case "for_you":
    default:
      return scoreForYouBalanced(p, {
        newestMs: created || Date.now(),
        oldestMs: created || 0,
        popularity,
      });
  }
}

function groupByShop(items: MarketplaceProduct[]): Map<string, MarketplaceProduct[]> {
  const byShop = new Map<string, MarketplaceProduct[]>();
  for (const item of items) {
    const key = item.shop_id || "_unknown";
    const list = byShop.get(key);
    if (list) list.push(item);
    else byShop.set(key, [item]);
  }
  return byShop;
}

/** Stable shop rotation — NOT ranked by discount (everyone gets a turn). */
function stableShopOrder(shopIds: string[]): string[] {
  return [...shopIds].sort((a, b) => a.localeCompare(b));
}

function roundRobinTake(
  queues: Map<string, MarketplaceProduct[]>,
  shopOrder: string[],
  maxPerShop: number,
): MarketplaceProduct[] {
  const taken = new Map<string, number>();
  const out: MarketplaceProduct[] = [];
  let progressed = true;

  while (progressed) {
    progressed = false;
    for (const shopId of shopOrder) {
      const used = taken.get(shopId) ?? 0;
      if (used >= maxPerShop) continue;
      const q = queues.get(shopId);
      if (!q || q.length === 0) continue;
      out.push(q.shift()!);
      taken.set(shopId, used + 1);
      progressed = true;
    }
  }

  return out;
}

type Lane = "deal" | "fresh" | "balanced";

/**
 * For You mixer: rotating lanes + equal shop turns.
 *
 * Slot pattern: deal → fresh → balanced → deal → …
 * Each pick advances to the next shop that still has stock in that lane.
 * A shop with *all* items discounted still only gets its fair share of slots;
 * other shops keep appearing even with smaller/no discounts.
 */
function buildForYouFeed(
  items: MarketplaceProduct[],
  options?: { maxPerShop?: number; popularity?: PopularityMap },
): MarketplaceProduct[] {
  const byShop = groupByShop(items);
  const times = items.map(createdMs).filter((t) => t > 0);
  const newestMs = times.length ? Math.max(...times) : Date.now();
  const oldestMs = times.length ? Math.min(...times) : 0;
  const popularity = options?.popularity;

  // Single shop → balanced ranking (discount helps, but freshness/pop break ties)
  if (byShop.size <= 1) {
    return [...items].sort(
      (a, b) =>
        scoreForYouBalanced(b, { newestMs, oldestMs, popularity }) -
        scoreForYouBalanced(a, { newestMs, oldestMs, popularity }),
    );
  }

  const shopOrder = stableShopOrder([...byShop.keys()]);
  const earlyCap = options?.maxPerShop ?? MAX_PER_SHOP_EARLY.for_you;

  // Three queues per shop (same products can only live in one — assign by best lane fit)
  const dealQ = new Map<string, MarketplaceProduct[]>();
  const freshQ = new Map<string, MarketplaceProduct[]>();
  const balQ = new Map<string, MarketplaceProduct[]>();

  for (const shopId of shopOrder) {
    const list = [...(byShop.get(shopId) ?? [])];
    // Rank copies for each lane intent
    const byDeal = [...list].sort((a, b) => scoreDeal(b) - scoreDeal(a));
    const byFresh = [...list].sort((a, b) => createdMs(b) - createdMs(a));
    const byBal = [...list].sort(
      (a, b) =>
        scoreForYouBalanced(b, { newestMs, oldestMs, popularity }) -
        scoreForYouBalanced(a, { newestMs, oldestMs, popularity }),
    );

    // Partition: put true deals into deal lane first, rest into fresh/balanced split
    const used = new Set<string>();
    const deals: MarketplaceProduct[] = [];
    const fresh: MarketplaceProduct[] = [];
    const balanced: MarketplaceProduct[] = [];

    for (const p of byDeal) {
      if (discountPercent(p) > 0 && deals.length < earlyCap) {
        deals.push(p);
        used.add(p.id);
      }
    }
    for (const p of byFresh) {
      if (used.has(p.id)) continue;
      if (fresh.length <= balanced.length) {
        fresh.push(p);
      } else {
        balanced.push(p);
      }
      used.add(p.id);
    }
    // Anything missed (shouldn't happen)
    for (const p of byBal) {
      if (!used.has(p.id)) balanced.push(p);
    }

    dealQ.set(shopId, deals);
    freshQ.set(shopId, fresh);
    balQ.set(shopId, balanced);
  }

  const taken = new Map<string, number>();
  const out: MarketplaceProduct[] = [];
  const lanes: Lane[] = ["deal", "fresh", "balanced"];
  let laneIdx = 0;
  let shopIdx = 0;
  const maxAttempts = items.length * 6;
  let attempts = 0;

  const queueFor = (lane: Lane, shopId: string) => {
    if (lane === "deal") return dealQ.get(shopId);
    if (lane === "fresh") return freshQ.get(shopId);
    return balQ.get(shopId);
  };

  while (out.length < items.length && attempts < maxAttempts) {
    attempts += 1;
    const lane = lanes[laneIdx % lanes.length]!;
    laneIdx += 1;

    // Try each shop once starting from shopIdx (equal chance)
    let placed = false;
    for (let step = 0; step < shopOrder.length; step++) {
      const shopId = shopOrder[(shopIdx + step) % shopOrder.length]!;
      const used = taken.get(shopId) ?? 0;
      if (used >= earlyCap) continue;

      let q = queueFor(lane, shopId);
      // Lane empty? fall back to any remaining queue for that shop
      if (!q || q.length === 0) {
        q =
          (dealQ.get(shopId)?.length ? dealQ.get(shopId) : undefined) ||
          (freshQ.get(shopId)?.length ? freshQ.get(shopId) : undefined) ||
          (balQ.get(shopId)?.length ? balQ.get(shopId) : undefined);
      }
      if (!q || q.length === 0) continue;

      out.push(q.shift()!);
      taken.set(shopId, used + 1);
      shopIdx = (shopIdx + step + 1) % shopOrder.length;
      placed = true;
      break;
    }

    if (!placed) break; // all shops hit early cap or empty
  }

  // Overflow: continue equal round-robin from leftover queues (no cap)
  const leftover = new Map<string, MarketplaceProduct[]>();
  for (const shopId of shopOrder) {
    const rest = [
      ...(dealQ.get(shopId) ?? []),
      ...(freshQ.get(shopId) ?? []),
      ...(balQ.get(shopId) ?? []),
    ];
    // Prefer balanced order for leftovers
    rest.sort(
      (a, b) =>
        scoreForYouBalanced(b, { newestMs, oldestMs, popularity }) -
        scoreForYouBalanced(a, { newestMs, oldestMs, popularity }),
    );
    leftover.set(shopId, rest);
  }

  const rest = roundRobinTake(leftover, shopOrder, Number.POSITIVE_INFINITY);
  return [...out, ...rest];
}

function compareWithinShop(
  a: MarketplaceProduct,
  b: MarketplaceProduct,
  sort: MarketplaceFeedSort,
  popularity?: PopularityMap,
): number {
  return scoreProductForSort(b, sort, popularity) - scoreProductForSort(a, sort, popularity);
}

/**
 * Fair marketplace ordering (works with any filtered subset):
 *
 * - **1 shop**: best items first (balanced for For You), then the rest below.
 * - **2+ shops / For You**: deal + fresh + balanced lanes with equal shop turns
 *   so an all-discount store cannot own the top of the feed.
 * - **Other sorts**: best-of-each + round-robin with soft early cap.
 */
export function diversifyMarketplaceFeed(
  items: MarketplaceProduct[],
  sort: MarketplaceFeedSort,
  options?: { maxPerShop?: number; popularity?: PopularityMap },
): MarketplaceProduct[] {
  if (items.length <= 1) return items;

  if (sort === "for_you") {
    return buildForYouFeed(items, options);
  }

  const byShop = groupByShop(items);
  const popularity = options?.popularity;

  if (byShop.size <= 1) {
    return [...items].sort((a, b) => compareWithinShop(a, b, sort, popularity));
  }

  for (const [, list] of byShop) {
    list.sort((a, b) => compareWithinShop(a, b, sort, popularity));
  }

  // Equal shop turns — do not rank shops by discount strength
  const shopOrder = stableShopOrder([...byShop.keys()]);
  const queues = new Map<string, MarketplaceProduct[]>(
    [...byShop.entries()].map(([id, list]) => [id, [...list]]),
  );

  const earlyCap = options?.maxPerShop ?? MAX_PER_SHOP_EARLY[sort] ?? 4;
  const early = roundRobinTake(queues, shopOrder, earlyCap);
  const rest = roundRobinTake(queues, shopOrder, Number.POSITIVE_INFINITY);
  return [...early, ...rest];
}
