/* Natural-language → product search query (Urdu / English) */

const STOP_PHRASES = [
  /\b(best|sasta|sasti|cheap|top|achha|achhi|behtarin|konsa|kon sa|konsi|kon si|recommended)\b/gi,
  /\b(link|url|de do|dedo|batao|batado|dikhao|dhundo|dhund|find|search|milega|milta|milenge|chahiye|chahye)\b/gi,
  /\b(kahan|kaha|where|shop|dukan|dukaan|store|se|par|mein|main|hai|ho|ka|ki|ke|ko)\b/gi,
  /\b(mujhe|mujhay|mujhy|i need|i want|give me|show me|please|plz|yar|yaar|bhai)\b/gi,
  /\b(product|item|cheez|saman|brand)\b/gi,
];

/** Category / product keywords that imply a product search. */
const PRODUCT_SIGNALS = new Set([
  "mobile",
  "phone",
  "smartphone",
  "iphone",
  "samsung",
  "oppo",
  "vivo",
  "infinix",
  "tecno",
  "laptop",
  "computer",
  "earphone",
  "earbuds",
  "headphone",
  "charger",
  "cable",
  "watch",
  "tablet",
  "burger",
  "biryani",
  "pizza",
  "karahi",
  "zinger",
  "shalwar",
  "kurti",
  "shirt",
  "jeans",
  "shoes",
  "perfume",
  "cream",
  "makeup",
  "aata",
  "atta",
  "chawal",
  "rice",
  "doodh",
  "milk",
  "chicken",
  "gosht",
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
    /(link|url|kahan|dhund|find|search|milega|milta|chahiye|dedo|de do|dikhao|recommend)/i.test(
      lower,
    )
  ) {
    return true;
  }

  if (/(best|sasta|top|cheap|behtarin)\s+\w+/i.test(lower)) {
    return true;
  }

  const words = lower.split(/\s+/);
  return words.some((w) => PRODUCT_SIGNALS.has(w.replace(/[^a-z0-9]/g, "")));
}

export function shouldRunProductSearch(message: string, role: "customer" | "merchant" | "shop"): boolean {
  if (looksLikeProductSearch(message)) return true;
  const q = extractProductQuery(message);
  if (!q || q.length < 2) return false;
  if (role === "shop") return true;
  const tokens = q.split(" ").filter(Boolean);
  return tokens.some((t) => PRODUCT_SIGNALS.has(t) || t.length >= 3);
}
