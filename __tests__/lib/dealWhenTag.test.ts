import {
  formatDealWhenTag,
  formatDealDisplayLabel,
  dealSearchHaystack,
  type ShopDeal,
} from "@/lib/dealSchedule";

function deal(partial: Partial<ShopDeal>): ShopDeal {
  return {
    id: "1",
    shop_id: "s1",
    title: "Biryani Special",
    description: null,
    schedule_type: "weekly",
    weekdays: [1],
    starts_on: null,
    ends_on: null,
    day_of_month: null,
    is_active: true,
    created_at: "2026-01-01",
    ...partial,
  };
}

describe("formatDealWhenTag", () => {
  it("formats single weekday as Monday deal", () => {
    expect(formatDealWhenTag(deal({ weekdays: [1] }))).toBe("Monday deal");
  });

  it("formats date range as 14 August deal", () => {
    expect(
      formatDealWhenTag(
        deal({
          schedule_type: "date_range",
          weekdays: null,
          starts_on: "2026-08-14",
          ends_on: "2026-08-14",
        }),
      ),
    ).toBe("14 August deal");
  });

  it("includes when-tag in display label with badge", () => {
    expect(formatDealDisplayLabel(deal({ badge_text: "20% OFF", weekdays: [5] }))).toBe(
      "20% OFF · Friday deal",
    );
  });

  it("haystack includes weekday words for search", () => {
    const hay = dealSearchHaystack(deal({ weekdays: [1] })).toLowerCase();
    expect(hay).toContain("monday");
  });
});
