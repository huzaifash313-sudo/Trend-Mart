/* Multilingual normalize — English / Roman Urdu / Urdu / Punjabi → searchable form */

/** Common Urdu + Hindi (Arabic/Devanagari script) → Roman/English marketplace terms */
const URDU_SCRIPT_MAP: Record<string, string> = {
  // ── Devices ───────────────────────────────────────────────────────────
  "موبائل": "mobile",
  "فون": "phone",
  "لیپٹاپ": "laptop",
  "کمپیوٹر": "computer",
  "گھڑی": "watch",
  "گھري": "watch",
  "ایئرفون": "earphone",
  "کان": "earphone",
  "ہیڈفون": "headphone",
  "ٹیبلٹ": "tablet",
  "چارجر": "charger",
  "کیمرہ": "camera",

  // ── Food ──────────────────────────────────────────────────────────────
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
  "دہی": "yogurt",
  "چائے": "tea",
  "لسی": "lassi",

  // ── Fashion ───────────────────────────────────────────────────────────
  "جوتے": "shoes",
  "قمیض": "shirt",
  "شلوار": "shalwar",
  "کرتی": "kurti",
  "کپڑے": "clothes",
  "پرفیوم": "perfume",
  "میک اپ": "makeup",
  "بیگ": "bag",
  "چشمہ": "glasses",

  // ── Health ────────────────────────────────────────────────────────────
  "دوا": "medicine",
  "فارمیسی": "pharmacy",
  "دواخانہ": "pharmacy",

  // ── Shopping intent ───────────────────────────────────────────────────
  "دکان": "shop",
  "دکاندار": "shop",
  "دکانیں": "shops",
  "بازار": "market",
  "سستا": "sasta",
  "سستی": "sasta",
  "بہترین": "best",
  "کہاں": "kahan",
  "کہاں ملے گا": "kahan milega",
  "چاہیے": "chahiye",
  "دکھاؤ": "dikhao",
  "بتائیں": "batao",
  "ڈھونڈو": "dhundo",
  "تلاش": "search",
  "مدد": "help",
  "قریب": "qareeb",
  "قریبی": "nearby",

  // ── App terms ─────────────────────────────────────────────────────────
  "آرڈر": "order",
  "آرڈرز": "orders",
  "کارٹ": "cart",
  "ڈیلیوری": "delivery",
  "قیمت": "price",
  "ریٹ": "rate",
  "لنک": "link",
  "خواہش": "wishlist",
  "ادائیگی": "payment",
  "واپسی": "refund",
  "منسوخ": "cancel",

  // ── Punjabi (Shahmukhi script) ────────────────────────────────────────
  "کیتھے": "kahan",
  "دسو": "batao",
  "ویکھو": "dikhao",
  "لبھو": "dhundo",
  "چاہیدا": "chahiye",
  "سستا": "sasta",
  "چنگا": "best",
  "وਧੀਆ": "best",
};

/** Punjabi / Saraiki / Hindi / common local roman → English marketplace terms */
const LOCAL_ROMAN_MAP: Record<string, string> = {
  // ── Devices (Punjabi/Hindi typos) ─────────────────────────────────────
  mobil: "mobile",
  mobail: "mobile",
  moble: "mobile",
  fon: "phone",
  phonee: "phone",
  leptoop: "laptop",
  leptop: "laptop",
  labtop: "laptop",
  laptoop: "laptop",
  kammputer: "computer",
  komputer: "computer",
  ghari: "watch",
  ghadi: "watch",
  ghori: "watch",
  kanwale: "earphone",
  handsfree: "earphone",
  earfone: "earphone",
  headfone: "headphone",

  // ── Food (Punjabi/Hindi) ───────────────────────────────────────────────
  bargar: "burger",
  bugger: "burger",
  peza: "pizza",
  piza: "pizza",
  biryaniyan: "biryani",
  biriyani: "biryani",
  karahi: "karahi",
  kadhai: "karahi",
  chawal: "rice",
  chaawal: "rice",
  aata: "atta",
  doodh: "milk",
  dudh: "milk",
  murgi: "chicken",
  murghi: "chicken",
  chicken: "chicken",
  goshat: "gosht",
  maas: "gosht",
  maas: "gosht",
  dahi: "yogurt",
  lassi: "lassi",
  chai: "tea",

  // ── Fashion ───────────────────────────────────────────────────────────
  jutay: "shoes",
  jootay: "shoes",
  jutte: "shoes",
  joote: "shoes",
  kapray: "clothes",
  kapre: "clothes",
  kaprhy: "clothes",
  qameez: "shirt",
  kameez: "shirt",
  shalwar: "shalwar",
  dupatta: "dupatta",
  kurta: "kurta",

  // ── Intent words — Punjabi ─────────────────────────────────────────────
  chahida: "chahiye",
  chahidi: "chahiye",
  chahiday: "chahiye",
  chaida: "chahiye",
  daso: "batao",
  dasso: "batao",
  das: "batao",
  vekhao: "dikhao",
  vikhao: "dikhao",
  vekh: "dekho",
  labbo: "dhundo",
  labo: "dhundo",
  labb: "dhundo",
  kithe: "kahan",
  kithay: "kahan",
  kidhar: "kahan",
  kidhar: "kahan",
  sasta: "sasta",
  sasti: "sasta",
  sastay: "sasta",
  saste: "sasta",
  changa: "best",
  changi: "best",
  changay: "best",
  vadhia: "best",
  wadhia: "best",
  mila: "milega",
  miluga: "milega",
  miluga: "milega",

  // ── Intent words — Hindi ───────────────────────────────────────────────
  chahiye: "chahiye",
  chaahiye: "chahiye",
  dikhana: "dikhao",
  dikhaao: "dikhao",
  batana: "batao",
  bataao: "batao",
  dhundhna: "dhundo",
  dhundhein: "dhundo",
  kharidna: "khareedna",
  khareedna: "order",
  lena: "chahiye",
  lelo: "chahiye",
  sabse: "sab se",
  sabase: "sab se",
  sasta: "sasta",
  ucheema: "best",
  behtareen: "best",
  behtarin: "best",
  sahi: "best",

  // ── Category shorthand ────────────────────────────────────────────────
  kiryana: "kiryana",
  karyana: "kiryana",
  kirana: "kiryana",
  sabzi: "vegetables",
  sabziyan: "vegetables",
  tarkari: "vegetables",
  mithai: "sweets",
  dawai: "medicine",
  dawa: "medicine",
  dawakhana: "pharmacy",
  chemist: "pharmacy",
  dawaee: "medicine",
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
