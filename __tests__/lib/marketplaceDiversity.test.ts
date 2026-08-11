import {
  diversifyMarketplaceFeed,
  scoreForYouBalanced,
  scoreProductForSort,
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
