import {
  computeDeliveryFee,
  computeDeliveryFeeBreakdown,
  describeDeliveryPricing,
} from "@/lib/deliveryFee";

describe("computeDeliveryFee", () => {
  it("returns 0 for pickup even when fees are set", () => {
    expect(
      computeDeliveryFee({
        flat: 100,
        perKm: 40,
        distanceKm: 3,
        freeThreshold: 2000,
        subtotal: 500,
        isPickup: true,
      }),
    ).toBe(0);
  });

  it("returns 0 when free threshold is met (priority over flat+perKm)", () => {
    expect(
      computeDeliveryFee({
        flat: 100,
        perKm: 40,
        distanceKm: 5,
        freeThreshold: 2000,
        subtotal: 2000,
      }),
    ).toBe(0);
  });

  it("charges flat + per-km when below free threshold", () => {
    // 100 + 40 * 2.2 = 100 + 88 = 188
    expect(
      computeDeliveryFee({
        flat: 100,
        perKm: 40,
        distanceKm: 2.2,
        freeThreshold: 2000,
        subtotal: 500,
      }),
    ).toBe(188);
  });

  it("charges flat only when per-km is zero", () => {
    expect(
      computeDeliveryFee({
        flat: 150,
        perKm: 0,
        distanceKm: 8,
        subtotal: 100,
      }),
    ).toBe(150);
  });

  it("does not invent partial fee when per-km set without GPS", () => {
    const b = computeDeliveryFeeBreakdown({
      flat: 80,
      perKm: 30,
      distanceKm: null,
      subtotal: 100,
    });
    expect(b.fee).toBe(0);
    expect(b.isFinal).toBe(false);
    expect(b.incompleteDistance).toBe(true);
    expect(b.distancePart).toBe(0);
  });

  it("marks unconfigured when no fees set (not FREE)", () => {
    const b = computeDeliveryFeeBreakdown({
      flat: 0,
      perKm: 0,
      distanceKm: 2,
      subtotal: 100,
    });
    expect(b.unconfigured).toBe(true);
    expect(b.isFinal).toBe(false);
    expect(b.freeReason).toBeNull();
    expect(b.fee).toBe(0);
  });

  it("describeDeliveryPricing shows free + paid rates together", () => {
    expect(
      describeDeliveryPricing({
        freeDeliveryThreshold: 2000,
        deliveryFeeFlat: 100,
        deliveryFeePerKm: 20,
      }),
    ).toBe("Free over Rs. 2,000 · Else Rs. 100 + Rs. 20/km");
  });
});
