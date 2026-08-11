import {
  paginateReviews,
  lockedDisplayName,
  phonesMatch,
  REVIEW_PAGE_SIZE,
} from "@/lib/reviewRules";

describe("paginateReviews", () => {
  const items = Array.from({ length: 20 }, (_, i) => i + 1);

  it("returns the first page by default", () => {
    const result = paginateReviews(items, 1);
    expect(result.items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(3);
    expect(result.hasNext).toBe(true);
    expect(result.hasPrev).toBe(false);
    expect(result.pageSize).toBe(REVIEW_PAGE_SIZE);
  });

  it("clamps out-of-range pages", () => {
    const result = paginateReviews(items, 99);
    expect(result.page).toBe(3);
    expect(result.items).toEqual([17, 18, 19, 20]);
    expect(result.hasNext).toBe(false);
    expect(result.hasPrev).toBe(true);
  });
});

describe("lockedDisplayName", () => {
  it("prefers the account profile name", () => {
    expect(lockedDisplayName("Ali Khan", "Other", "ali@example.com")).toBe("Ali Khan");
  });

  it("falls back to metadata then email local-part", () => {
    expect(lockedDisplayName("", "Sara", "sara@example.com")).toBe("Sara");
    expect(lockedDisplayName("", "", "guest@example.com")).toBe("guest");
  });

  it("returns empty when nothing usable exists", () => {
    expect(lockedDisplayName("", "", "")).toBe("");
  });
});

describe("phonesMatch", () => {
  it("matches Pakistani numbers ignoring formatting", () => {
    expect(phonesMatch("+92 300 1234567", "03001234567")).toBe(true);
  });

  it("rejects empty or mismatched numbers", () => {
    expect(phonesMatch("", "03001234567")).toBe(false);
    expect(phonesMatch("03001111111", "03002222222")).toBe(false);
  });
});
