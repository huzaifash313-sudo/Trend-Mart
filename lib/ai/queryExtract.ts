/* Natural-language → product search query (Urdu / English) */

const STOP_PHRASES = [
  /\b(best|sasta|sasti|cheap|top|achha|achhi|behtarin|konsa|kon sa|konsi|kon si|recommended|suggest|recommend)\b/gi,
  /\b(link|url|de do|dedo|batao|batado|dikhao|dhundo|dhund|find|search|milega|milta|milenge|chahiye|chahye|chaye)\b/gi,
  /\b(kahan|kaha|where|shop|dukan|dukaan|store|se|par|mein|main|hai|ho|ka|ki|ke|ko|wala|wali)\b/gi,
  /\b(mujhe|mujhay|mujhy|i need|i want|give me|show me|please|plz|yar|yaar|bhai|bro)\b/gi,
  /\b(product|item|cheez|saman|brand|option|options)\b/gi,
];

/** Category / product keywords that imply a product search. */
const PRODUCT_SIGNALS = new Set([
  "mobile",
  "mobail",
  "mobil",
  "phone",
  "smartphone",
  "iphone",
  "samsung",
  "oppo",
  "vivo",
  "infinix",
  "tecno",
  "xiaomi",
  "redmi",
  "realme",
  "nokia",
  "laptop",
  "leptop",
  "labtop",
  "computer",
  "pc",
  "earphone",
  "earbuds",
  "headphone",
  "charger",
  "cable",
  "watch",
  "ghadi",
  "smartwatch",
  "tablet",
  "powerbank",
  "speaker",
  "camera",
  "burger",
  "bargar",
  "biryani",
  "pizza",
  "peza",
  "karahi",
  "zinger",
  "pasta",
  "shawarma",
  "fries",
  "roll",
  "paratha",
  "nihari",
  "pulao",
  "samosa",
  "chai",
  "coffee",
  "juice",
  "shalwar",
  "kurti",
  "shirt",
  "jeans",
  "shoes",
  "jutay",
  "sneakers",
  "sandals",
  "abaya",
  "dupatta",
  "perfume",
  "cream",
  "makeup",
  "lipstick",
  "foundation",
  "aata",
  "atta",
  "chawal",
  "rice",
  "doodh",
  "milk",
  "chicken",
  "gosht",
  "mutton",
  "beef",
  "fish",
  "egg",
  "anda",
  "oil",
  "sugar",
  "cheeni",
  "tea",
  "soap",
  "shampoo",
  "detergent",
  "toy",
  "bag",
  "wallet",
  "glasses",
  "specs",
  "medicine",
  "dawai",
  "vitamin",
  "furniture",
  "sofa",
  "bed",
  "fan",
  "ac",
  "cooler",
  "fridge",
  "washing",
  "iron",
  "kiryana",
  "sabzi",
  "mithai",
]);

export function extractProductQuery(message: string): string | null {
  let text = message
    .replace(/[^\w\s\u0600-\u06FF-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const re of STOP_PHRASES) {
    text = text.replace(re, " ");
  }

  text = text.replace(/\s+/g, " ").trim();
  if (text.length < 2) return null;
  if (text.split(" ").length > 6) {
    text = text.split(" ").slice(0, 6).join(" ");
  }
  return text;
}

export function looksLikeProductSearch(message: string): boolean {
  const lower = message.toLowerCase();

  if (
    /(link|url|kahan|dhund|find|search|milega|milta|chahiye|dedo|de do|dikhao|recommend|suggest|available|stock|price|kitna|rate)/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (/(best|sasta|top|cheap|behtarin|achha|achhi)\s+\w+/i.test(lower)) {
    return true;
  }

  const words = lower.split(/\s+/);
  return words.some((w) => PRODUCT_SIGNALS.has(w.replace(/[^a-z0-9]/g, "")));
}

export function shouldRunProductSearch(
  message: string,
  role: "customer" | "merchant" | "shop",
): boolean {
  if (looksLikeProductSearch(message)) return true;
  const q = extractProductQuery(message);
  if (!q || q.length < 2) return false;
  // Shop storefront: almost any product-ish phrase is searchable
  if (role === "shop") return true;
  const tokens = q.split(" ").filter(Boolean);
  // Customer: any 3+ letter token is enough to try catalog (never miss a product ask)
  if (role === "customer") {
    return tokens.some((t) => PRODUCT_SIGNALS.has(t) || t.length >= 3);
  }
  // Merchant: catalog lookup on product-like tokens
  return tokens.some((t) => PRODUCT_SIGNALS.has(t) || t.length >= 3);
}
