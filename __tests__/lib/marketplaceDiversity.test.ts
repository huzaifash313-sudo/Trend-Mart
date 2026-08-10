import {
  diversifyMarketplaceFeed,
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

  it("single shop: best (discounted) first, then the rest", () => {
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
    expect(out[0].id).toBe("b"); // highest discount first
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
    const earlyS1 = early.filter((p) => p.shop_id === "s1").length;
    const earlyS2 = early.filter((p) => p.shop_id === "s2").length;
    expect(earlyS1).toBe(3);
    expect(earlyS2).toBe(3);

    // First two slots should be different shops (round-robin)
    expect(early[0].shop_id).not.toBe(early[1].shop_id);

    // Overflow still present and still mixed (not one shop block)
    expect(out.length).toBe(12);
    const late = out.slice(6);
    expect(late.some((p) => p.shop_id === "s1")).toBe(true);
    expect(late.some((p) => p.shop_id === "s2")).toBe(true);
  });

  it("score prefers discount for for_you", () => {
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
