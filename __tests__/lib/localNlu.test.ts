import { runLocalNlu } from "@/lib/ai/localNlu";
import { extractProductQuery } from "@/lib/ai/queryExtract";

describe("runLocalNlu product vs deals", () => {
  it("routes sasta mobile to product_search not deals", () => {
    const nlu = runLocalNlu("sasta mobile chahiye");
    expect(nlu.intent).toBe("product_search");
    expect(nlu.searchQuery.toLowerCase()).toMatch(/mobile/);
  });

  it("routes cheap shoes to product_search", () => {
    const nlu = runLocalNlu("cheap shoes dikhao");
    expect(nlu.intent).toBe("product_search");
  });

  it("keeps pure deal questions as deals", () => {
    const nlu = runLocalNlu("aaj ke best deals dikhao");
    expect(nlu.intent).toBe("deals");
  });

  it("routes best mobile ka link do to product_search", () => {
    const nlu = runLocalNlu("best mobile ka link do");
    expect(nlu.intent).toBe("product_search");
  });
});

describe("extractProductQuery", () => {
  it("strips filler and keeps product token", () => {
    expect(extractProductQuery("best mobile ka link do")?.toLowerCase()).toBe("mobile");
  });
});
