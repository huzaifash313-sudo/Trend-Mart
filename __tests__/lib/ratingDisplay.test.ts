import { formatReviewCount, hasShopRating } from "@/components/CompactRating";

describe("rating display helpers", () => {
  it("formats compact review counts", () => {
    expect(formatReviewCount(12)).toBe("12");
    expect(formatReviewCount(4200)).toBe("4.2k");
    expect(formatReviewCount(1000)).toBe("1k");
    expect(formatReviewCount(15_000)).toBe("15k");
  });

  it("requires positive avg and count", () => {
    expect(hasShopRating(4.5, 12)).toBe(true);
    expect(hasShopRating(0, 0)).toBe(false);
    expect(hasShopRating(4.5, 0)).toBe(false);
  });
});
