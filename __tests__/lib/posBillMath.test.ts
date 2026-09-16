/**
 * POS bill arithmetic — the money path.
 *
 * These are the numbers a customer is charged and the shop's books are built
 * from, so the edge cases (clamping, rounding, order of operations) matter more
 * than the happy path.
 */

import {
  computeBillTotals,
  resolveDiscount,
  round2,
} from "@/lib/pos/billMath";

describe("round2", () => {
  it("avoids floating-point drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
  });

  it("treats non-finite values as zero", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("resolveDiscount", () => {
  it("passes a flat rupee discount through", () => {
    expect(resolveDiscount(1000, 150, "flat")).toBe(150);
  });

  it("computes a percent discount against the subtotal", () => {
    expect(resolveDiscount(1000, 10, "percent")).toBe(100);
    expect(resolveDiscount(750, 12.5, "percent")).toBe(93.75);
  });

  it("clamps to the subtotal so a bill can never go negative", () => {
    expect(resolveDiscount(500, 900, "flat")).toBe(500);
    expect(resolveDiscount(500, 150, "percent")).toBe(500);
  });

  it("treats missing/invalid discounts as zero", () => {
    expect(resolveDiscount(500, undefined)).toBe(0);
    expect(resolveDiscount(500, -100, "flat")).toBe(0);
    expect(resolveDiscount(500, NaN, "flat")).toBe(0);
  });

  it("defaults to flat mode", () => {
    expect(resolveDiscount(1000, 50)).toBe(50);
  });
});

describe("computeBillTotals", () => {
  it("computes a plain bill with no discount, tax, or delivery", () => {
    expect(computeBillTotals({ subtotal: 1200 })).toEqual({
      subtotal: 1200,
      discount: 0,
      tax: 0,
      fee: 0,
      total: 1200,
    });
  });

  it("applies tax to the discounted amount, not the raw subtotal", () => {
    // 1000 − 200 = 800 taxable; 10% tax = 80; total 880.
    const bill = computeBillTotals({
      subtotal: 1000,
      discountValue: 200,
      discountMode: "flat",
      taxRatePercent: 10,
    });
    expect(bill.discount).toBe(200);
    expect(bill.tax).toBe(80);
    expect(bill.total).toBe(880);
  });

  it("adds delivery on top, untaxed", () => {
    // 1000 taxable, 10% tax = 100, + 150 delivery = 1250.
    const bill = computeBillTotals({
      subtotal: 1000,
      taxRatePercent: 10,
      deliveryFee: 150,
    });
    expect(bill.tax).toBe(100);
    expect(bill.fee).toBe(150);
    expect(bill.total).toBe(1250);
  });

  it("handles a percent discount end to end", () => {
    // 2000 − 15% (300) = 1700; 5% tax = 85; + 100 delivery = 1885.
    const bill = computeBillTotals({
      subtotal: 2000,
      discountValue: 15,
      discountMode: "percent",
      taxRatePercent: 5,
      deliveryFee: 100,
    });
    expect(bill).toEqual({
      subtotal: 2000,
      discount: 300,
      tax: 85,
      fee: 100,
      total: 1885,
    });
  });

  it("a 100% discount zeroes the goods but still bills delivery", () => {
    const bill = computeBillTotals({
      subtotal: 800,
      discountValue: 100,
      discountMode: "percent",
      taxRatePercent: 10,
      deliveryFee: 120,
    });
    expect(bill.discount).toBe(800);
    expect(bill.tax).toBe(0);
    expect(bill.total).toBe(120);
  });

  it("an over-sized flat discount never produces a negative total", () => {
    const bill = computeBillTotals({ subtotal: 300, discountValue: 5000 });
    expect(bill.discount).toBe(300);
    expect(bill.total).toBe(0);
  });

  it("keeps paisa-level amounts exact", () => {
    // 3 × 33.33 = 99.99; 17% tax = 16.9983 → 17.00
    const bill = computeBillTotals({ subtotal: 99.99, taxRatePercent: 17 });
    expect(bill.subtotal).toBe(99.99);
    expect(bill.tax).toBe(17);
    expect(bill.total).toBe(116.99);
  });

  it("ignores negative or malformed inputs rather than corrupting the bill", () => {
    const bill = computeBillTotals({
      subtotal: -500,
      discountValue: -10,
      taxRatePercent: -5,
      deliveryFee: -50,
    });
    expect(bill).toEqual({ subtotal: 0, discount: 0, tax: 0, fee: 0, total: 0 });
  });
});
