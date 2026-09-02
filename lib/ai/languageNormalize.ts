/* Multilingual normalize — English / Roman Urdu / Urdu / Punjabi → searchable form */

/** Common Urdu (Arabic script) → Roman / English marketplace terms */
const URDU_SCRIPT_MAP: Record<string, string> = {
  "موبائل": "mobile",
  "فون": "phone",
  "لیپٹاپ": "laptop",
  "کمپیوٹر": "computer",
  "گھڑی": "watch",
  "گھري": "watch",
  "کان": "earphone",
  "ہیڈفون": "headphone",
  "برگر": "burger",
  "پزا": "pizza",
  "پیزا": "pizza",
  "بریانی": "biryani",
  "کڑاہی": "karahi",
  "چاول": "rice",
  "آٹا": "atta",
  "دودھ": "milk",
  "مرغی": "chicken",
  "گوشت": "gosht",
  "جوتے": "shoes",
  "قمیض": "shirt",
  "شلوار": "shalwar",
  "کرتی": "kurti",
  "کپڑے": "clothes",
  "پرفیوم": "perfume",
  "میک اپ": "makeup",
  "دوا": "medicine",
  "فارمیسی": "pharmacy",
  "دکان": "shop",
  "دکاندار": "shop",
  "سستا": "sasta",
  "بہترین": "best",
  "کہاں": "kahan",
  "چاہیے": "chahiye",
  "دکھاؤ": "dikhao",
  "بتائیں": "batao",
  "آرڈر": "order",
  "کارٹ": "cart",
  "ڈیلیوری": "delivery",
  "قیمت": "price",
  "ریٹ": "rate",
  "لنک": "link",
  "تلاش": "search",
  "مدد": "help",
  "آرڈرز": "orders",
  "خواہش": "wishlist",
};

/** Punjabi / Saraiki / common local roman → English marketplace terms */
const LOCAL_ROMAN_MAP: Record<string, string> = {
  // Punjabi-ish / colloquial
  mobil: "mobile",
  mobail: "mobile",
  fon: "phone",
  phonee: "phone",
  leptoop: "laptop",
  leptop: "laptop",
  labtop: "laptop",
  kammputer: "computer",
  ghari: "watch",
  ghadi: "watch",
  kanwale: "earphone",
  handsfree: "earphone",
  // food
  bargar: "burger",
  peza: "pizza",
  piza: "pizza",
  biryaniyan: "biryani",
  karahi: "karahi",
  kadhai: "karahi",
  chawal: "rice",
  aata: "atta",
  doodh: "milk",
  murgi: "chicken",
  murghi: "chicken",
  goshat: "gosht",
  // fashion
  jutay: "shoes",
  jootay: "shoes",
  jutte: "shoes",
  kapray: "clothes",
  kapre: "clothes",
  qameez: "shirt",
  kameez: "shirt",
  // intent words
  chahida: "chahiye",
  chahidi: "chahiye",
  chahiday: "chahiye",
  daso: "batao",
  dasso: "batao",
  vekhao: "dikhao",
  vikhao: "dikhao",
  labbo: "dhundo",
  labo: "dhundo",
  kithe: "kahan",
  kithay: "kahan",
  sasta: "sasta",
  sasti: "sasta",
  sastay: "sasta",
  changa: "best",
  changi: "best",
  vadhia: "best",
  // categories shorthand
  kiryana: "kiryana",
  karyana: "kiryana",
  sabzi: "vegetables",
  sabziyan: "vegetables",
  mithai: "sweets",
  dawai: "medicine",
  dawakhana: "pharmacy",
};

const CATEGORY_ALIASES: Record<string, string> = {
  grocery: "Grocery & Kiryana",
  kiryana: "Grocery & Kiryana",
  karyana: "Grocery & Kiryana",
  ration: "Grocery & Kiryana",
  sabzi: "Fruits & Vegetables",
  vegetables: "Fruits & Vegetables",
  fruit: "Fruits & Vegetables",
  fruits: "Fruits & Vegetables",
  bakery: "Bakery & Sweets",
  sweets: "Bakery & Sweets",
  mithai: "Bakery & Sweets",
  cake: "Bakery & Sweets",
  food: "Fast Food & Restaurants",
  restaurant: "Fast Food & Restaurants",
  fastfood: "Fast Food & Restaurants",
  burger: "Fast Food & Restaurants",
  pizza: "Fast Food & Restaurants",
  biryani: "Fast Food & Restaurants",
  pharmacy: "Pharmacy & Medical",
  medical: "Pharmacy & Medical",
  medicine: "Pharmacy & Medical",
  dawai: "Pharmacy & Medical",
  fashion: "Fashion & Apparel",
  clothes: "Fashion & Apparel",
  kapray: "Fashion & Apparel",
  apparel: "Fashion & Apparel",
  electronics: "Electronics & Gadgets",
  gadgets: "Electronics & Gadgets",
  mobile: "Electronics & Gadgets",
  phone: "Electronics & Gadgets",
  laptop: "Electronics & Gadgets",
  home: "Home & Living",
  furniture: "Home & Living",
  beauty: "Health & Beauty",
  makeup: "Health & Beauty",
  books: "Books & Stationery",
  stationery: "Books & Stationery",
  sports: "Sports & Fitness",
  gym: "Sports & Fitness",
  toys: "Toys & Baby Care",
  baby: "Toys & Baby Care",
  car: "Automotive Accessories",
  auto: "Automotive Accessories",
  handmade: "Handmade & Crafts",
  craft: "Handmade & Crafts",
  repair: "Home Maintenance & Repair",
  plumber: "Home Maintenance & Repair",
  electrician: "Home Maintenance & Repair",
  security: "Security & Surveillance",
  cctv: "Security & Surveillance",
  it: "Tech & IT Services",
  laptoprepair: "Tech & IT Services",
  salon: "Personal & Professional Services",
  parlor: "Personal & Professional Services",
  service: "Personal & Professional Services",
};

export interface NormalizedQuery {
  original: string;
  normalized: string;
  script: "latin" | "urdu" | "mixed";
  likelyCategory?: string;
  confidence: number;
}

function hasUrduScript(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function normalizeUserLanguage(message: string): NormalizedQuery {
  const original = message.trim();
  let text = original;
  const urdu = hasUrduScript(text);

  if (urdu) {
    for (const [src, dest] of Object.entries(URDU_SCRIPT_MAP)) {
      text = text.split(src).join(dest);
    }
    // Strip remaining Arabic-script letters we couldn't map (avoid garbage search)
    text = text.replace(/[\u0600-\u06FF]+/g, " ");
  }

  text = text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = text.split(/\s+/).filter(Boolean);
  const mapped = words.map((w) => LOCAL_ROMAN_MAP[w] ?? w);
  const normalized = mapped.join(" ").replace(/\s+/g, " ").trim() || original.toLowerCase();

  let likelyCategory: string | undefined;
  let catHits = 0;
  for (const w of mapped) {
    const cat = CATEGORY_ALIASES[w];
    if (cat) {
      likelyCategory = cat;
      catHits += 1;
    }
  }

  // Confidence: mapped something useful or clear latin product words
  let confidence = 0.55;
  if (mapped.some((w) => w !== words[mapped.indexOf(w)] || LOCAL_ROMAN_MAP[w])) confidence += 0.15;
  if (urdu && mapped.length > 0) confidence += 0.1;
  if (catHits > 0) confidence += 0.1;
  if (normalized.length >= 3) confidence += 0.05;

  return {
    original,
    normalized,
    script: urdu ? ( /[a-z]/i.test(normalized) ? "mixed" : "urdu") : "latin",
    likelyCategory,
    confidence: Math.min(0.95, confidence),
  };
}

export function detectLikelyCategory(message: string): string | undefined {
  return normalizeUserLanguage(message).likelyCategory;
}
