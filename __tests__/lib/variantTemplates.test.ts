import {
  createGroupFromPreset,
  mergeVariantGroups,
  getQuickGroupNamesForCategory,
  getSimpleTemplates,
  getComboTemplates,
  categoryVariantHint,
  missingVariantTemplateCategories,
} from "@/lib/variantTemplates";
import { PRODUCT_CATEGORIES } from "@/types";

describe("mergeVariantGroups", () => {
  it("adds new groups without removing existing ones", () => {
    const existing = [
      {
        name: "Portion",
        options: [{ label: "Small", is_available: true }],
      },
    ];
    const incoming = [
      {
        name: "Spice Level",
        options: [{ label: "Mild", is_available: true }],
      },
    ];
    const merged = mergeVariantGroups(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged.map((g) => g.name)).toEqual(["Portion", "Spice Level"]);
  });

  it("skips duplicate group names", () => {
    const existing = [
      {
        name: "Portion",
        options: [{ label: "Small", is_available: true }],
      },
    ];
    const incoming = [
      {
        name: "Portion",
        options: [{ label: "Large", is_available: true }],
      },
      {
        name: "Add-ons",
        options: [{ label: "Extra cheese", is_available: true }],
      },
    ];
    const merged = mergeVariantGroups(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.options[0]?.label).toBe("Small");
    expect(merged[1]?.name).toBe("Add-ons");
  });
});

describe("createGroupFromPreset", () => {
  it("builds a portion group with default chips", () => {
    const group = createGroupFromPreset("Portion");
    expect(group?.name).toBe("Portion");
    expect(group?.options.length).toBeGreaterThan(0);
  });
});

describe("getQuickGroupNamesForCategory", () => {
  it("lists unique food groups for Fast Food & Restaurants", () => {
    const names = getQuickGroupNamesForCategory("Fast Food & Restaurants");
    expect(names).toContain("Portion");
    expect(names).toContain("Spice Level");
    expect(names).toContain("Add-ons");
  });
});

describe("category templates", () => {
  it("covers every product category", () => {
    expect(missingVariantTemplateCategories()).toEqual([]);
  });

  it("offers at least one simple pack per category", () => {
    for (const cat of PRODUCT_CATEGORIES) {
      expect(getSimpleTemplates(cat).length).toBeGreaterThan(0);
    }
  });

  it("keeps mix packs optional (not required)", () => {
    const foodMix = getComboTemplates("Fast Food & Restaurants");
    const foodSimple = getSimpleTemplates("Fast Food & Restaurants");
    expect(foodSimple.some((p) => p.label.toLowerCase().includes("portion"))).toBe(
      true,
    );
    expect(foodMix.length).toBeGreaterThan(0);
  });

  it("gives a short hint for fashion and grocery", () => {
    expect(categoryVariantHint("Fashion & Apparel")).toMatch(/size/i);
    expect(categoryVariantHint("Grocery & Kiryana")).toMatch(/weight|flavour|pack/i);
  });
});
