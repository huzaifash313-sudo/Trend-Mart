import { matchBrandKnowledge } from "@/lib/ai/brandKnowledge";

describe("matchBrandKnowledge", () => {
  it("does not treat product queries with 'ka' as owner FAQ", () => {
    const hit = matchBrandKnowledge("best mobile ka link do", "customer");
    expect(hit).toBeNull();
  });

  it("answers clear owner questions", () => {
    const hit = matchBrandKnowledge("TrendsMart ka owner kaun hai?", "customer");
    expect(hit).not.toBeNull();
    expect(hit?.intent).toBe("brand_owner");
    expect(hit?.reply).toMatch(/Huzaifa/i);
  });

  it("answers founder / who made questions", () => {
    const hit = matchBrandKnowledge("who made this app?", "customer");
    expect(hit?.intent).toBe("brand_owner");
  });

  it("does not match bare shopping phrases", () => {
    expect(matchBrandKnowledge("sasta burger chahiye", "customer")).toBeNull();
    expect(matchBrandKnowledge("biryani dikhao", "customer")).toBeNull();
  });
});
