import {
  diversifyMarketplaceFeed,
  scoreForYouBalanced,
  scoreProductForSort,
  scoreProductPopularity,
  type MarketplaceFeedSort,
} from "@/lib/marketplaceDiversity";
import type { MarketplaceProduct } from "@/types";

function product(
  partial: Partial<MarketplaceProduct> & { id: string; shop_id: string; name: string },
): MarketplaceProduct {
  return {
    description: "",
    price: 100,
    original_price: null,
    compare_at_price: null,
    deal_expires_at: null,
    currency: "PKR",
    image_url: "https://example.com/p.jpg",
    images: null,
    is_available: true,
    category_id: null,
    sub_category_id: null,
    created_at: "2026-01-01T00:00:00Z",
    shop_name: "Shop",
    shop_logo_url: null,
    shop_whatsapp: null,
    shop_category: null,
    shop_latitude: null,
    shop_longitude: null,
    ...partial,
  };
}

describe("diversifyMarketplaceFeed", () => {
  const sort: MarketplaceFeedSort = "for_you";

  it("single shop: discounted best first among mixed catalogue", () => {
    const items = [
      product({ id: "a", shop_id: "s1", name: "Plain", price: 500, created_at: "2026-06-01T00:00:00Z" }),
      product({
        id: "b",
        shop_id: "s1",
        name: "Deal",
        price: 400,
        original_price: 800,
        created_at: "2026-05-01T00:00:00Z",
      }),
      product({ id: "c", shop_id: "s1", name: "Newer", price: 450, created_at: "2026-07-01T00:00:00Z" }),
    ];

    const out = diversifyMarketplaceFeed(items, sort);
    expect(out[0].id).toBe("b");
    expect(out.map((p) => p.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("two+ shops: interleaves and soft-caps early window", () => {
    const items: MarketplaceProduct[] = [];
    for (let i = 0; i < 6; i++) {
      items.push(
        product({
          id: `s1-${i}`,
          shop_id: "s1",
          name: `A${i}`,
          price: 100 + i,
          original_price: 200,
          created_at: `2026-08-0${i + 1}T00:00:00Z`,
        }),
      );
      items.push(
        product({
          id: `s2-${i}`,
          shop_id: "s2",
          name: `B${i}`,
          price: 110 + i,
          original_price: 220,
          created_at: `2026-08-0${i + 1}T12:00:00Z`,
        }),
      );
    }

    const out = diversifyMarketplaceFeed(items, sort, { maxPerShop: 3 });
    const early = out.slice(0, 6);
    expect(early.filter((p) => p.shop_id === "s1")).toHaveLength(3);
    expect(early.filter((p) => p.shop_id === "s2")).toHaveLength(3);
    expect(out.length).toBe(12);
  });

  it("all-discount shop cannot own the top when another shop has no discounts", () => {
    const items: MarketplaceProduct[] = [];
    // Shop A: everything 50% off (flood attempt)
    for (let i = 0; i < 8; i++) {
      items.push(
        product({
          id: `deal-${i}`,
          shop_id: "discount-king",
          name: `Deal${i}`,
          price: 50,
          original_price: 100,
          created_at: `2026-08-0${(i % 9) + 1}T00:00:00Z`,
        }),
      );
    }
    // Shop B: no discounts, just fresh stock
    for (let i = 0; i < 8; i++) {
      items.push(
        product({
          id: `plain-${i}`,
          shop_id: "fresh-shop",
          name: `Plain${i}`,
          price: 80,
          created_at: `2026-08-1${(i % 9)}T00:00:00Z`,
        }),
      );
    }

    const out = diversifyMarketplaceFeed(items, "for_you", { maxPerShop: 3 });
    const early = out.slice(0, 6);
    const king = early.filter((p) => p.shop_id === "discount-king").length;
    const fresh = early.filter((p) => p.shop_id === "fresh-shop").length;

    // Equal early share — discount dump does not take all 6
    expect(king).toBe(3);
    expect(fresh).toBe(3);
    // First screen must include the non-discount shop
    expect(early.some((p) => p.shop_id === "fresh-shop")).toBe(true);
  });

  it("popularity hint can lift a product in balanced scoring", () => {
    const plain = product({ id: "p", shop_id: "s1", name: "Plain", price: 100 });
    const hot = product({ id: "h", shop_id: "s1", name: "Hot", price: 100 });
    const ctx = { newestMs: Date.now(), oldestMs: 0, popularity: { h: 500 } };
    expect(scoreForYouBalanced(hot, ctx)).toBeGreaterThan(scoreForYouBalanced(plain, ctx));
  });

  it("score prefers discount for for_you within a shop", () => {
    const deal = product({
      id: "d",
      shop_id: "s1",
      name: "Deal",
      price: 50,
      original_price: 100,
    });
    const plain = product({ id: "p", shop_id: "s1", name: "Plain", price: 50 });
    expect(scoreProductForSort(deal, "for_you")).toBeGreaterThan(
      scoreProductForSort(plain, "for_you"),
    );
  });
});

describe("product popularity signals (reviews / orders / clicks)", () => {
  it("scores real demand signals higher than a cold product", () => {
    const hot = product({
      id: "hot",
      shop_id: "s1",
      name: "Hot",
      shop_avg_rating: 4.8,
      shop_review_count: 120,
      orders_count: 500,
      click_count: 3000,
    });
    const cold = product({
      id: "cold",
      shop_id: "s1",
      name: "Cold",
      shop_avg_rating: null,
      shop_review_count: 0,
      orders_count: 0,
      click_count: 0,
    });

    expect(scoreProductPopularity(hot)).toBeGreaterThan(scoreProductPopularity(cold));
    expect(scoreProductPopularity(cold)).toBe(0);
  });

  it("gives orders the heaviest weight", () => {
    const manyOrders = product({ id: "a", shop_id: "s1", name: "A", orders_count: 400, click_count: 10 });
    const manyClicks = product({ id: "b", shop_id: "s1", name: "B", orders_count: 10, click_count: 400 });
    expect(scoreProductPopularity(manyOrders)).toBeGreaterThan(
      scoreProductPopularity(manyClicks),
    );
  });

  it("uses log-scale so one viral item does not crush the feed", () => {
    const viral = scoreProductPopularity(
      product({ id: "viral", shop_id: "s1", name: "Viral", orders_count: 1_000_000, click_count: 5_000_000 }),
    );
    const medium = scoreProductPopularity(
      product({ id: "medium", shop_id: "s1", name: "Medium", orders_count: 2_000, click_count: 5_000 }),
    );
    // Both inside 0–100, viral only modestly above medium (no runaway).
    expect(viral).toBeLessThanOrEqual(100);
    expect(viral).toBeGreaterThan(medium);
    expect(viral / medium).toBeLessThan(3);
  });

  it("surfaces in-demand products first in a single-shop For You feed", () => {
    // Same freshness so the popularity signal (orders + clicks) decides.
    const popular = product({ id: "pop", shop_id: "s1", name: "Pop", orders_count: 300, click_count: 900, created_at: "2026-01-01T00:00:00Z" });
    const fresh = product({
      id: "fresh",
      shop_id: "s1",
      name: "Fresh",
      orders_count: 0,
      click_count: 0,
      created_at: "2026-01-01T00:00:00Z",
    });
    const feed = diversifyMarketplaceFeed([fresh, popular], "for_you");
    expect(feed[0]?.id).toBe("pop");
  });

  it("prefers a product's own rating over the parent shop rating", () => {
    const productRated = product({
      id: "pr",
      shop_id: "s1",
      name: "Rated product",
      avg_rating: 4.9,
      review_count: 40,
      shop_avg_rating: 2.1,
      shop_review_count: 200,
      orders_count: 10,
      click_count: 10,
    });
    const shopOnly = product({
      id: "so",
      shop_id: "s1",
      name: "Shop only",
      avg_rating: null,
      review_count: 0,
      shop_avg_rating: 2.1,
      shop_review_count: 200,
      orders_count: 10,
      click_count: 10,
    });
    expect(scoreProductPopularity(productRated)).toBeGreaterThan(
      scoreProductPopularity(shopOnly),
    );
    expect(scoreProductForSort(productRated, "popular")).toBeGreaterThan(
      scoreProductForSort(shopOnly, "popular"),
    );
  });
});
