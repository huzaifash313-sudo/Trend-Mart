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
  if (c.includes("beauty") || c.includes("cosmetic") || c.includes("salon") || c.includes("health & beauty")) {
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
    c.includes("sanitary") ||
    c.includes("fitting") ||
    c.includes("ceramic") ||
    c.includes("plumbing") ||
    c.includes("hardware") ||
    c.includes("tiles") ||
    c.includes("automotive") ||
    c.includes("auto ")
  ) {
    return "hardware";
  }
  if (
    c.includes("service") ||
    c.includes("repair") ||
    c.includes("tech & it") ||
    c.includes("security") ||
    c.includes("maintenance")
  ) {
    return "services";
  }
  // Previously orphaned → deliberate general retail (excel + stock)
  if (
    c.includes("home & living") ||
    c.includes("home and living") ||
    c.includes("furniture") ||
    c.includes("books") ||
    c.includes("stationery") ||
    c.includes("sports") ||
    c.includes("fitness") ||
    c.includes("toys") ||
    c.includes("baby") ||
    c.includes("handmade") ||
    c.includes("craft") ||
    c.includes("others") ||
    c.includes("universal")
  ) {
    return "general";
  }
  return "general";
}

/** Human-readable: which shop categories this pack is meant for. */
export const POS_PACK_CATEGORY_COVERAGE: Record<PosCategoryPack, string[]> = {
  grocery: ["Grocery & Kiryana", "Fruits & Vegetables", "Meat & Seafood"],
  fashion: ["Fashion & Apparel"],
  beauty: ["Health & Beauty"],
  electronics: ["Electronics & Gadgets"],
  bakery: ["Bakery & Sweets"],
  cafe: ["Cafe & Beverages"],
  food: ["Fast Food & Restaurants"],
  pharmacy: ["Pharmacy & Medical"],
  hardware: ["Sanitary and Fittings", "Automotive Accessories"],
  services: [
    "Home Maintenance & Repair",
    "Security & Surveillance",
    "Tech & IT Services",
    "Personal & Professional Services",
  ],
  general: [
    "Home & Living",
    "Books & Stationery",
    "Sports & Fitness",
    "Toys & Baby Care",
    "Handmade & Crafts",
    "Others / Universal",
    "Custom categories (no keyword match)",
  ],
};

export const POS_PACK_OPTIONS: PosCategoryPack[] = [
  "general",
  "grocery",
  "fashion",
  "beauty",
  "electronics",
  "hardware",
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
    case "hardware":
      return "Sanitary / Ceramics / Auto / Hardware";
    case "food":
      return "Restaurant / Fast food";
    case "cafe":
      return "Cafe";
    case "bakery":
      return "Bakery / Sweets";
    case "pharmacy":
      return "Pharmacy (batch + expiry)";
    case "services":
      return "Services / Repair";
    default:
      return "General retail (home, books, toys…)";
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
      return ["Excel + barcode on", "IMEI notes · block oversell", "Credit / udhaar ready"];
    case "hardware":
      return [
        "Excel counter: search + Enter",
        "Decimal qty (pipes / tiles by m)",
        "Soft stock · credit / udhaar ready",
      ];
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
        "Batch + expiry ON · barcode ON",
        "Block oversell · phone preferred",
      ];
    case "services":
      return ["Excel quick bill", "Inventory usually off", "Credit + expenses"];
    default:
      return [
        "Excel search+Enter for home / books / toys / crafts",
        "Soft stock warns",
        "Turn on barcode/expiry in Setup if needed",
      ];
  }
}
