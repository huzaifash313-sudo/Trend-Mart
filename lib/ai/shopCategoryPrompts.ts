/* Category-aware TrendBot prompts per shop type */

const CATEGORY_PROMPTS: Record<string, string[]> = {
  grocery: [
    "Aaj ki deals kya hain?",
    "Basmati chawal ka price?",
    "Free delivery kitne par?",
    "Min order kitna hai?",
  ],
  food: [
    "Menu aur prices?",
    "Aaj kya special hai?",
    "Delivery time kitna?",
    "Order kaise karun?",
  ],
  restaurant: [
    "Best seller dish?",
    "Karahi ka price?",
    "Kab tak khula hai?",
    "Order WhatsApp se?",
  ],
  electronics: [
    "Best mobile ka link do",
    "Samsung phone available?",
    "Sasta laptop dhundo",
    "Warranty hai?",
  ],
  mobile: [
    "Best mobile ka link do",
    "iPhone available?",
    "Sasta phone dhundo",
    "Exchange offer?",
  ],
  boutique: [
    "New arrivals?",
    "Shalwar kameez price?",
    "Size guide?",
    "Delivery available?",
  ],
  fashion: [
    "Latest collection?",
    "Kurti ka price?",
    "Sale chal rahi hai?",
    "Order kaise karun?",
  ],
  pharmacy: [
    "Dawa available hai?",
    "Panadol ka price?",
    "Home delivery?",
    "Prescription chahiye?",
  ],
  bakery: [
    "Fresh cake price?",
    "Custom order?",
    "Aaj kya bake hua?",
    "Delivery time?",
  ],
  services: [
    "Services list?",
    "Booking kaise karun?",
    "Rates kya hain?",
    "Portfolio dikhao",
  ],
};

function normalizeCategory(category: string | null | undefined): string {
  return (category ?? "").toLowerCase().trim();
}

function matchCategoryKey(category: string): string | null {
  if (!category) return null;
  if (category.includes("grocery") || category.includes("kiryana") || category.includes("super store"))
    return "grocery";
  if (category.includes("restaurant") || category.includes("food") || category.includes("fast food"))
    return "food";
  if (category.includes("electronic") || category.includes("mobile") || category.includes("phone"))
    return category.includes("mobile") ? "mobile" : "electronics";
  if (category.includes("boutique") || category.includes("fashion") || category.includes("clothing"))
    return category.includes("boutique") ? "boutique" : "fashion";
  if (category.includes("pharmacy") || category.includes("medical")) return "pharmacy";
  if (category.includes("bakery") || category.includes("sweets")) return "bakery";
  if (category.includes("service")) return "services";
  return null;
}

export function getShopCategoryPrompts(
  category: string | null | undefined,
  shopName?: string,
): string[] {
  const norm = normalizeCategory(category);
  const key = matchCategoryKey(norm);
  const base = key ? [...(CATEGORY_PROMPTS[key] ?? [])] : [];

  if (base.length === 0) {
    base.push(
      "Products aur prices?",
      "Best deals?",
      "Kab khulte hain?",
      "Order kaise karun?",
    );
  }

  if (shopName && base.length < 5) {
    base.unshift(`${shopName} ki best cheez?`);
  }

  return [...new Set(base)].slice(0, 5);
}

export function getShopWelcomeExtras(category: string | null | undefined): string {
  const key = matchCategoryKey(normalizeCategory(category));
  switch (key) {
    case "grocery":
      return "Grocery, deals, delivery — sab bata sakta hoon.";
    case "food":
    case "restaurant":
      return "Menu, specials, timings — pooch lo.";
    case "electronics":
    case "mobile":
      return "Phones, gadgets — links ke sath dhundh ke dunga.";
    case "boutique":
    case "fashion":
      return "Fashion items, sizes, prices — main help karunga.";
    case "pharmacy":
      return "Medicines aur availability check kar sakta hoon.";
    default:
      return "Products, prices, order help — sab yahan.";
  }
}
