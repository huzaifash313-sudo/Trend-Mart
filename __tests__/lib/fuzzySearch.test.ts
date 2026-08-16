import {
  expandSearchQuery,
  fuzzyFilterAndRank,
  scoreTextMatch,
  suggestSearchCorrections,
} from "@/lib/fuzzySearch";

describe("fuzzySearch", () => {
  it("ranks exact above contains above typo", () => {
    const exact = scoreTextMatch("biryani", "Biryani");
    const contains = scoreTextMatch("biryani", "Chicken Biryani Special");
    const typo = scoreTextMatch("biryani", "Birayni");
    expect(exact).toBeGreaterThan(contains);
    expect(contains).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(40);
  });

  it("understands common local synonyms", () => {
    expect(scoreTextMatch("doodh", "Fresh Milk 1L")).toBeGreaterThan(50);
    expect(scoreTextMatch("chawal", "Basmati Rice")).toBeGreaterThan(50);
  });

  it("filters and sorts a list with typos", () => {
    const items = [
      { name: "Zinger Burger" },
      { name: "Chicken Karahi" },
      { name: "Laptop Charger" },
      { name: "Zingr Burger Combo" },
    ];
    const ranked = fuzzyFilterAndRank(items, "zingger", (i) => [i.name]);
    expect(ranked.length).toBeGreaterThanOrEqual(1);
    expect(ranked[0].item.name.toLowerCase()).toContain("zing");
  });

  it("expands query with phonetic variants", () => {
    const tokens = expandSearchQuery("fone");
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.some((t) => t.includes("f") || t.includes("ph"))).toBe(true);
  });

  it("ranks titles with more matching words higher", () => {
    const both = scoreTextMatch("care soap", "Care Soap (6 in 1)");
    const one = scoreTextMatch("care soap", "Soap Dish");
    const none = scoreTextMatch("care soap", "Laptop Charger");
    expect(both).toBeGreaterThan(one);
    expect(one).toBeGreaterThan(none);
    expect(both).toBeGreaterThan(60);
  });

  it("matches local produce synonyms", () => {
    expect(scoreTextMatch("tamatar", "Tomatoes/tamatar")).toBeGreaterThan(70);
    expect(scoreTextMatch("tomato", "Fresh Tamatar 1kg")).toBeGreaterThan(50);
  });
});
