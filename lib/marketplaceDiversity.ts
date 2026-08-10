/* -------------------------------------------------------------------------- */
/*  Marketplace feed diversity — prevent one seller flooding /products        */
/* -------------------------------------------------------------------------- */

import type { MarketplaceProduct } from "@/types";
import { getProductDiscount } from "@/lib/formatters";

export type MarketplaceFeedSort =
  | "for_you"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "discount";

/**
 * Soft caps for the *early* fair window (first screenfuls).
 * Beyond the cap, remaining items still appear lower — interleaved, not dumped.
 */
const MAX_PER_SHOP_EARLY: Record<MarketplaceFeedSort, number> = {
  for_you: 4,
  newest: 4,
  discount: 5,
  price_asc: 10,
  price_desc: 10,
};

function hasImage(p: MarketplaceProduct): boolean {
  return !!(p.image_url?.trim() || (Array.isArray(p.images) && p.images.length > 0));
}

/** Higher = better pick within a single shop for this sort mode. */
export function scoreProductForSort(
  p: MarketplaceProduct,
  sort: MarketplaceFeedSort,
): number {
  const disc = getProductDiscount(p).discountPercent;
  const created = p.created_at ? Date.parse(p.created_at) || 0 : 0;
  const imgBoost = hasImage(p) ? 50_000 : 0;

  switch (sort) {
    case "price_asc":
      return imgBoost - p.price;
    case "price_desc":
      return imgBoost + p.price;
    case "newest":
      return imgBoost + created / 1_000;
    case "discount":
      return imgBoost + disc * 1_000_000 + created / 1_000;
    case "for_you":
    default:
      // Best-of-shop: discount → freshness → image → lower price
      return imgBoost + disc * 1_000_000 + created / 1_000 - p.price * 0.01;
  }
}

function compareWithinShop(
  a: MarketplaceProduct,
  b: MarketplaceProduct,
  sort: MarketplaceFeedSort,
): number {
  return scoreProductForSort(b, sort) - scoreProductForSort(a, sort);
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

/**
 * Round-robin pull from shop queues.
 * @param maxPerShop - stop taking from a shop after this many (Infinity = drain all)
 */
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

/**
 * Fair marketplace ordering (works with any filtered subset):
 *
 * - **1 shop**: best items first (by sort), then the rest below.
 * - **2+ shops**: early window = best-of-each + round-robin (per-shop soft cap),
 *   then remaining items still interleaved shop-by-shop so one seller never
 *   dumps a long block after the cap.
 */
export function diversifyMarketplaceFeed(
  items: MarketplaceProduct[],
  sort: MarketplaceFeedSort,
  options?: { maxPerShop?: number },
): MarketplaceProduct[] {
  if (items.length <= 1) return items;

  const byShop = groupByShop(items);

  // Single shop after filters → best first, then the rest
  if (byShop.size <= 1) {
    return [...items].sort((a, b) => compareWithinShop(a, b, sort));
  }

  for (const [, list] of byShop) {
    list.sort((a, b) => compareWithinShop(a, b, sort));
  }

  // Stronger shops first in each round (by their #1 item score)
  const shopOrder = [...byShop.entries()]
    .map(([shopId, list]) => ({
      shopId,
      best: list[0] ? scoreProductForSort(list[0], sort) : 0,
    }))
    .sort((a, b) => b.best - a.best)
    .map((s) => s.shopId);

  const queues = new Map<string, MarketplaceProduct[]>(
    [...byShop.entries()].map(([id, list]) => [id, [...list]]),
  );

  const earlyCap = options?.maxPerShop ?? MAX_PER_SHOP_EARLY[sort] ?? 4;
  const early = roundRobinTake(queues, shopOrder, earlyCap);
  // Overflow: keep interleaving (no cap) so filters stay mixed all the way down
  const rest = roundRobinTake(queues, shopOrder, Number.POSITIVE_INFINITY);

  return [...early, ...rest];
}
