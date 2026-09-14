import type { PosCategoryPack } from "@/lib/pos/types";

/** Map shop category → suggested POS pack (merchant can override). */
export function suggestPosPack(shopCategory?: string | null): PosCategoryPack {
  const c = (shopCategory ?? "").toLowerCase();
  if (c.includes("grocery") || c.includes("kiryana") || c.includes("fruit") || c.includes("meat")) {
    return "grocery";
  }
  if (c.includes("fashion") || c.includes("apparel") || c.includes("boutique")) {
    return "fashion";
  }
  if (c.includes("beauty") || c.includes("cosmetic") || c.includes("salon")) {
    return "beauty";
  }
  if (c.includes("electronic") || c.includes("mobile") || c.includes("gadget")) {
    return "electronics";
  }
  if (c.includes("bakery") || c.includes("sweet")) {
    return "bakery";
  }
  if (c.includes("cafe") || c.includes("beverage")) {
    return "cafe";
  }
  if (c.includes("fast food") || c.includes("restaurant")) {
    return "food";
  }
  if (c.includes("pharmacy") || c.includes("medical")) {
    return "pharmacy";
  }
  if (
    c.includes("service") ||
    c.includes("repair") ||
    c.includes("tech & it") ||
    c.includes("security")
  ) {
    return "services";
  }
  return "general";
}

export const POS_PACK_OPTIONS: PosCategoryPack[] = [
  "general",
  "grocery",
  "fashion",
  "beauty",
  "electronics",
  "food",
  "cafe",
  "bakery",
  "pharmacy",
  "services",
];

export function posPackLabel(pack: PosCategoryPack): string {
  switch (pack) {
    case "grocery":
      return "Grocery / Meat / Kiryana";
    case "fashion":
      return "Fashion / Boutique";
    case "beauty":
      return "Beauty / Cosmetics";
    case "electronics":
      return "Electronics / Mobiles";
    case "food":
      return "Restaurant / Fast food";
    case "cafe":
      return "Cafe";
    case "bakery":
      return "Bakery / Sweets";
    case "pharmacy":
      return "Pharmacy";
    case "services":
      return "Services / Repair";
    default:
      return "General retail";
  }
}

export function posPackHints(pack: PosCategoryPack): string[] {
  switch (pack) {
    case "grocery":
      return [
        "Excel billing: search + Enter",
        "Soft stock warns (negative OK)",
        "Decimal qty · barcode/expiry optional",
      ];
    case "fashion":
      return ["Excel billing · variants", "Soft stock warns", "Barcode / size notes optional"];
    case "beauty":
      return ["Excel search billing", "Soft stock · batch/expiry optional", "Cost price for profit"];
    case "electronics":
      return ["Excel + optional barcode", "IMEI notes · soft stock", "Credit / udhaar ready"];
    case "food":
      return [
        "Menu tiles + recipes (raw → dish)",
        "Kitchen KOT · soft stock",
        "Token / variants on tap",
      ];
    case "cafe":
      return ["Menu + recipes", "Soft stock · token mode", "Expenses + profit reports"];
    case "bakery":
      return ["Excel + recipes", "Soft stock · expiry optional", "Token + decimal"];
    case "pharmacy":
      return [
        "Excel medical-store billing",
        "Barcode / expiry optional",
        "Soft stock · phone optional",
      ];
    case "services":
      return ["Excel quick bill", "Inventory usually off", "Credit + expenses"];
    default:
      return ["Excel search+Enter", "Soft stock warns", "Turn on barcode/expiry in Setup if needed"];
  }
}
