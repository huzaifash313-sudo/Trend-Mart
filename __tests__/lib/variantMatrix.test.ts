import {
  comboCount,
  customerVariantGroups,
  expandComboRows,
  isComboUnavailable,
  setOptionAvailable,
  upsertSku,
} from "@/lib/variantMatrix";
import { computeVariantPrice } from "@/lib/variantPricing";
import { computePooledLineTotals } from "@/lib/priceTiers";

const groups = [
  {
    name: "Flavour",
    options: [
      { label: "Onion", is_available: true },
      { label: "Apple", is_available: true },
    ],
  },
  {
    name: "Size",
    options: [
      { label: "200ml", is_available: true, price: 200 },
      { label: "400ml", is_available: true, price: 350 },
    ],
  },
];

describe("variant matrix", () => {
  it("counts flavour × size combos", () => {
    expect(comboCount(groups)).toBe(4);
    expect(expandComboRows(groups)).toHaveLength(4);
  });

  it("hides the sku group from customers", () => {
    const withSku = upsertSku(groups, "Flavour: Onion · Size: 200ml", { price: 180 });
    expect(customerVariantGroups(withSku)).toHaveLength(2);
    expect(computeVariantPrice(200, withSku, "Flavour: Onion · Size: 200ml")).toBe(180);
    expect(computeVariantPrice(200, withSku, "Flavour: Apple · Size: 200ml")).toBe(200);
  });

  it("sells out one flavour without killing other flavours", () => {
    const next = setOptionAvailable(groups, "Flavour", "Onion", false);
    expect(isComboUnavailable(next, "Flavour: Onion · Size: 200ml")).toBe(true);
    expect(isComboUnavailable(next, "Flavour: Apple · Size: 200ml")).toBe(false);
  });

  it("sells out one combo only", () => {
    const next = upsertSku(groups, "Flavour: Onion · Size: 200ml", { is_available: false });
    expect(isComboUnavailable(next, "Flavour: Onion · Size: 200ml")).toBe(true);
    expect(isComboUnavailable(next, "Flavour: Onion · Size: 400ml")).toBe(false);
  });
});

describe("pack deals across mixed flavours", () => {
  it("applies a 6-pack when qty is split across flavours at the same unit price", () => {
    const totals = computePooledLineTotals([
      {
        id: "a",
        productId: "sunsilk",
        quantity: 4,
        price: 200,
        basePrice: 200,
        priceTiers: [{ min_qty: 6, price: 1100, mode: "pack" }],
      },
      {
        id: "b",
        productId: "sunsilk",
        quantity: 2,
        price: 200,
        basePrice: 200,
        priceTiers: [{ min_qty: 6, price: 1100, mode: "pack" }],
      },
    ]);
    expect(totals.get("a")! + totals.get("b")!).toBe(1100);
  });
});
