/* eslint-disable */
// =============================================================================
// TrendsMart — FULL TEST SEED (50 shops · 2000 products · 300 deals)
// -----------------------------------------------------------------------------
// Directly seeds the Supabase project configured in .env.local using the
// service-role key (bypasses RLS). ADDITIVE + IDEMPOTENT:
//   • deterministic UUIDs (MD5-based)
//   • all inserts are idempotent (upsert / skip existing)
//   • existing data is never deleted — safe to re-run
//
// Coverage (whole-system test):
//   • 50 live/approved shops spanning every store category
//   • 2000 products — 700 with 3 images + variants · 500 with 2 images +
//     variants · 800 with >=1 image (most with variants / pack tiers)
//   • 300 deals — 100 with 4–5 images, mixed weekly/date-range/monthly
//   • coupons (codes), active stories, reviews (shop + product),
//     sponsored ads, real geo pins / zones / delivery fees
//   • test accounts: 50 merchants + 8 customers (password Trend@123)
//
// Images: real, keyword-matched, deterministic real-photo URLs.
//   primary -> loremflickr keyword feed (stable via ?lock=N)
//   fallback-> curated Unsplash pools (already verified in earlier demo seed)
//
// Run:
//   node scripts/seed-full-test-data.mjs --dry      # print counts only
//   node scripts/seed-full-test-data.mjs            # full seed
//   node scripts/seed-full-test-data.mjs --limit 20 # smoke test (2 shops)
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── env load (lightweight dotenv) ───────────────────────────────────────────
if (existsSync(join(ROOT, ".env.local"))) {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "Trend@123";
const DRY = process.argv.includes("--dry");
const LIMIT_SHOPS = (() => {
  const idx = process.argv.indexOf("--limit");
  if (idx > -1 && process.argv[idx + 1]) return Number(process.argv[idx + 1]) || 50;
  return 50;
})();

/* ── deterministic id + helpers ────────────────────────────────────────────── */
function uuid5(seed) {
  const h = createHash("md5").update(String(seed)).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const esc = (s) => String(s ?? "").replace(/'/g, "''");
const P = (n) => Math.max(1, Math.round(n));
const origP = (p) => Math.max(p + 1, Math.ceil((p * 1.12) / 10) * 10);
const today = new Date();
const addDays = (d, n) => new Date(d.getTime() + n * 86400000).toISOString();
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── variant builders ──────────────────────────────────────────────────────── */
const sizeOpts = (base, map = { Small: -120, Medium: 0, Large: 130, Family: 320 }) => ({
  name: "Size",
  options: Object.entries(map).map(([label, adj]) => ({
    label, price: P(base + adj), original_price: origP(P(base + adj)),
  })),
});
const weightOpts = (base) => sizeOpts(base, { "250g": P(base * 0.3), "500g": P(base * 0.55), "1kg": base, "2kg": P(base * 1.9) });
const volOpts = (base) => sizeOpts(base, { "250ml": P(base * 0.45), "500ml": P(base * 0.8), "1L": base, "1.5L": P(base * 1.35) });
const pcsOpts = (base) => sizeOpts(base, { "6 pc": P(base * 0.7), "12 pc": base, "24 pc": P(base * 1.8), "50 pc": P(base * 3.4) });
/* Clothing size with real-world price deltas — bigger sizes cost more, and the
   smallest size is slightly cheaper, so selecting XL/XXL changes the price. */
const garmentSizeOpts = (base) => sizeOpts(base, {
  S: P(base * -0.05), M: 0, L: P(base * 0.05), XL: P(base * 0.12), XXL: P(base * 0.2),
});
/* Kids clothing: bigger age ranges carry a small premium. */
const kidSizeOpts = (base) => sizeOpts(base, {
  "2-3Y": P(base * -0.08), "4-5Y": 0, "6-8Y": P(base * 0.08), "9-11Y": P(base * 0.15),
});
/* Footwear is flat across sizes (real shops price UK6–UK11 the same). */
const shoeSizes = { name: "Size (UK)", options: ["UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11"].map((l) => ({ label: l })) };
const colorOpts = (cols, priced = {}) => ({
  name: "Color",
  options: cols.map((c) => (priced[c] ? { label: c, price: P(priced[c]), original_price: origP(P(priced[c])) } : { label: c })),
});
const flavorOpts = (base, flavs) => ({ name: "Flavour", options: flavs.map((f) => ({ label: f, price: P(base), original_price: origP(P(base)) })) });
const spiceOpts = { name: "Spice Level", options: ["Mild", "Medium", "Hot"].map((l) => ({ label: l })) };
const packs = (arr) => arr.map(([q, price]) => ({ min_qty: q, price: P(price) }));
const json = (v) => (v ? JSON.stringify(v) : null);

/* ── image URLs (Unsplash only — Flickr/loremflickr are blocked in PK) ───── */
const US = (id, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

/* Verified-good photo ids (written by scripts/repair-images.mjs). When the
   cache is present we ONLY use ids that were live-checked, so re-running this
   seed never reintroduces broken/blocked images. */
const _vCache = join(ROOT, "scripts", ".verified-unsplash.json");
const VERIFIED_GOOD = (() => {
  try {
    if (existsSync(_vCache)) {
      const { good } = JSON.parse(readFileSync(_vCache, "utf8"));
      if (Array.isArray(good) && good.length > 20) return new Set(good);
    }
  } catch { /* ignore */ }
  return null;
})();

const POOLS = {
  food: ["1513104890138-7c749659a591", "1568901346375-23c9450c58cd", "1571091718767-18b5b1457add", "1565299624946-b28f40a0ae38", "1594212699903-ec8a3eca50f5", "1604382354936-07c5d9983bd3", "1589302168068-964664d93dc0", "1563379091339-03b21ab4a4f8"],
  grocery: ["1542838132-92c53300491e", "1573246123716-6b1782bfc499", "1587049352846-4a222e784d38", "1543168256-418811576931", "1591343395082-e120087004b4", "1590425561156-c9e6f96d1f98"],
  veg: ["1540420773420-3366772f4999", "1566385101042-1a0aa0c1268c", "1518843407714-874aee04c332", "1597362922223-fc74da0f3d86", "1495482000893-4e6a64b10f3b", "1598033129183-c4f50c736f10"],
  fruits: ["1619566636858-adf3ef46400b", "1528825879975-d97ae9a9b740", "1610832958506-aa56368176cf", "1587049352846-4a222e784d38"],
  bakery: ["1509440159596-0249088772ff", "1549931319-a545dcf3bc73", "1555507036-ab1f4038808a", "1586444248902-2f64eddc13df", "1509365465985-25d11c17e812", "1517433670267-08bbd4be890f"],
  cake: ["1578985545062-69928b1d9587", "1551024506-0bccd828d307", "1587668178277-295251f900ce", "1571115177098-24ec42ed204d"],
  pharmacy: ["1587854692152-cbe660dbde88", "1584308666744-24d5c474f2ae", "1576602976047-174e57a47881", "1607619056574-7b8d3ee536b2"],
  clothes: ["1441986300917-64674bd600d8", "1523381210434-271e8be1f52b", "1576566588028-4147f3842f27", "1620799140408-edc6dcb6d633", "1618354691373-d851c5c3a990", "1596755094514-f87e34085b2c"],
  kurta: ["1583391733956-6c78276477e2", "1623228371602-4dfe1e9e11f1", "1599491391765-77db7d5ffbe2", "1621435454194-9b3f9d60a3a2"],
  shoes: ["1542291026-7eec264c27ff", "1595950653106-6c9ebd614d3a", "1600185365926-3a2ce3cdb9eb", "1560343090-f0409e92791a"],
  electronics: ["1526738549147-8e07eca6c147", "1550009158-9ebf69173e03", "1601524907652-b8277d3e6cc0", "1588872657578-7efd1f1555ed", "1588508065123-287b28e013da", "1512499617640-c74ae3a79d37"],
  home: ["1556228453-efd6c1ff04f6", "1524758631624-e2822e304c36", "1586023492125-27b2c045efd7", "1538688525198-9b88f6f53126", "1493663284031-b7e3aefcae8e", "1519710164239-da123dc03ef4"],
  beauty: ["1596462502278-27bfdc403348", "1522335789203-aabd1fc54bc9", "1556228720-195a672e8a03", "1571781926291-c477ebfd024b", "1586495777744-4413f21062fa"],
  books: ["1481627834876-b7833e8f5570", "1512820790803-83ca734da794", "1524578271613-d550eacf6090", "1544947950-fa07a98d237f", "1532012197219-4773d8222d41"],
  sports: ["1517649763962-0c623066013b", "1571019613454-1cb2f99b2d8b", "1530549387789-4c1017266635", "1546519638-68e109498ffc", "1461896836934-ffe607ba8211"],
  toys: ["1558060370-d644479cb6f7", "1566576912321-d58ddd7a6088", "1596461404969-9ae70f2830c1", "1515488042361-ee00e0ddd4e4", "1566159385152-da28a566e80d", "1559487950-9b5f5b4d8c1f"],
  auto: ["1486262715619-67b85e0b08d3", "1503376780353-7e6692767b70", "1568605117036-5fe5e7bab0b7", "1552519507-da3b142c6e3d", "1601362840469-51e4d8d58785"],
  craft: ["1544776193-351d6c712a24", "1563013544-824ae1b704d3", "1513364776144-60967b0f800f", "1585314614250-d2038769659d"],
  generic: ["1513104890138-7c749659a591", "1546069901-ba9599a7e63c"],
};
const CAT_META = {
  "Fast Food & Restaurants": { kw: "restaurant,food", pool: "food" },
  "Grocery & Kiryana": { kw: "grocery,supermarket", pool: "grocery" },
  "Fruits & Vegetables": { kw: "vegetable,fruit", pool: "veg" },
  "Bakery & Sweets": { kw: "bakery,cake", pool: "bakery" },
  "Pharmacy & Medical": { kw: "pharmacy,medicine", pool: "pharmacy" },
  "Fashion & Apparel": { kw: "clothing,fashion", pool: "clothes" },
  "Electronics & Gadgets": { kw: "electronics,gadget", pool: "electronics" },
  "Home & Living": { kw: "home,decor", pool: "home" },
  "Health & Beauty": { kw: "cosmetics,beauty", pool: "beauty" },
  "Books & Stationery": { kw: "books,stationery", pool: "books" },
  "Sports & Fitness": { kw: "sports,fitness", pool: "sports" },
  "Toys & Baby Care": { kw: "toys,children", pool: "toys" },
  "Automotive Accessories": { kw: "car,accessories", pool: "auto" },
  "Handmade & Crafts": { kw: "handmade,craft", pool: "craft" },
  "Others / Universal": { kw: "products,store", pool: "generic" },
};

/** Pick deterministic verified Unsplash ids for a category + seed offset. */
function pickId(cat, seed, offset = 0) {
  const meta = CAT_META[cat] || CAT_META["Others / Universal"];
  const pool = POOLS[meta.pool] || POOLS.generic;
  // When a verified-good cache exists, restrict to live-checked ids only.
  const usable = VERIFIED_GOOD ? pool.filter((id) => VERIFIED_GOOD.has(id)) : pool;
  const arr = usable.length > 0 ? usable : pool;
  if (arr.length === 0) return null;
  return arr[(Math.abs(seed) + offset * 7) % arr.length];
}

/** Build a gallery of `count` distinct verified Unsplash URLs. */
function buildImages(cat, productSeed, count) {
  const ids = [];
  let off = 0;
  let stuck = 0;
  while (ids.length < count) {
    const id = pickId(cat, productSeed, off++);
    if (!id) break;
    if (!ids.includes(id)) {
      ids.push(id);
      stuck = 0;
    } else {
      // no new id found — don't spin forever on tiny pools
      if (++stuck > (POOLS[CAT_META[cat]?.pool] || []).length + 4) break;
    }
  }
  return ids.map((id) => US(id, 800));
}

/** Single deterministic verified image URL for shops/stories/ads. */
function imgFor(cat, seed, w = 800) {
  const id = pickId(cat, seed, 3);
  return id ? US(id, w) : US("1513104890138-7c749659a591", w);
}

/* ── store registry (50) ───────────────────────────────────────────────────── */
const STORES = [
  // [name, category]
  ["Burger Lab", "Fast Food & Restaurants"],
  ["Pizza Crust Co.", "Fast Food & Restaurants"],
  ["Roll & Grill", "Fast Food & Restaurants"],
  ["Spice Route Kitchen", "Fast Food & Restaurants"],
  ["Broast Town", "Fast Food & Restaurants"],
  ["Cafe Daylight", "Fast Food & Restaurants"],
  ["Daily Needs Mart", "Grocery & Kiryana"],
  ["Green Basket Store", "Grocery & Kiryana"],
  ["City Kiryana", "Grocery & Kiryana"],
  ["Bismillah Super Store", "Grocery & Kiryana"],
  ["Fresh & Save", "Grocery & Kiryana"],
  ["HomePoint Grocers", "Grocery & Kiryana"],
  ["Sabzi Mandi Fresh", "Fruits & Vegetables"],
  ["Fruit Basket Hub", "Fruits & Vegetables"],
  ["Green Valley Produce", "Fruits & Vegetables"],
  ["Oven Fresh Bakers", "Bakery & Sweets"],
  ["Mithai Ghar", "Bakery & Sweets"],
  ["Cake Studio", "Bakery & Sweets"],
  ["Daily Bread & Butter", "Bakery & Sweets"],
  ["Al-Shifa Pharmacy", "Pharmacy & Medical"],
  ["MediPlus Drug Store", "Pharmacy & Medical"],
  ["HealthCare Point", "Pharmacy & Medical"],
  ["Urban Threads", "Fashion & Apparel"],
  ["Kurti House", "Fashion & Apparel"],
  ["Denim District", "Fashion & Apparel"],
  ["Classic Tailors", "Fashion & Apparel"],
  ["Stride Footwear", "Fashion & Apparel"],
  ["Volt Electronics", "Electronics & Gadgets"],
  ["Gadget Zone", "Electronics & Gadgets"],
  ["Mobile Care", "Electronics & Gadgets"],
  ["Sound & Vision", "Electronics & Gadgets"],
  ["Home Elegance", "Home & Living"],
  ["Decor Studio", "Home & Living"],
  ["Kitchen Essentials Co.", "Home & Living"],
  ["Glow Beauty Store", "Health & Beauty"],
  ["Skin & Hair Studio", "Health & Beauty"],
  ["BodyCare Plus", "Health & Beauty"],
  ["Readers' Nook", "Books & Stationery"],
  ["Paper & Pen Stationers", "Books & Stationery"],
  ["Active Sports", "Sports & Fitness"],
  ["Fit Zone Store", "Sports & Fitness"],
  ["Little Wonders Toys", "Toys & Baby Care"],
  ["BabyJoy", "Toys & Baby Care"],
  ["AutoGlow Accessories", "Automotive Accessories"],
  ["DriveRight", "Automotive Accessories"],
  ["Craft & Clay", "Handmade & Crafts"],
  ["Thread & Bead", "Handmade & Crafts"],
  ["Bargain Bazaar", "Others / Universal"],
  ["OneStop Shop", "Others / Universal"],
  ["Best Price Mart", "Others / Universal"],
];

const CITIES = ["Gujranwala", "Lahore", "Islamabad", "Karachi"];
const AREAS = {
  Gujranwala: ["Satellite Town", "Civil Lines", "Model Town", "Peoples Colony", "Kohinoor Town", "Cantt", "Rasoolpura", "Azizabad"],
  Lahore: ["Gulberg", "DHA", "Model Town", "Johar Town", "Cantt", "Iqbal Town", "Wapda Town", "Faisal Town"],
  Islamabad: ["F-7", "F-8", "G-9", "I-8", "G-11", "E-11", "Bahria", "DHA 2"],
  Karachi: ["Clifton", "Defence", "Gulshan-e-Iqbal", "North Nazimabad", "Saddar", "Malir", "Korangi", "FB Area"],
};
const LAT = { Gujranwala: [32.15, 32.18], Lahore: [31.45, 31.59], Islamabad: [33.6, 33.72], Karachi: [24.82, 24.95] };
const LNG = { Gujranwala: [74.17, 74.22], Lahore: [74.26, 74.4], Islamabad: [72.9, 73.12], Karachi: [66.99, 67.14] };

function shopGeo(i) {
  const city = CITIES[i % CITIES.length];
  const areas = AREAS[city];
  const area = areas[i % areas.length];
  const [la, lb] = LAT[city];
  const [na, nb] = LNG[city];
  const lat = +(la + ((i * 37) % 97) / 97 * (lb - la)).toFixed(5);
  const lng = +(na + ((i * 53) % 97) / 97 * (nb - na)).toFixed(5);
  return { city, area, lat, lng, zones: [`__pk_city__:${city}`, area, areas[(i + 3) % areas.length], areas[(i + 5) % areas.length]] };
}
const ACCENTS = ["#10b981", "#14b8a6", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#f97316", "#84cc16"];

/* ── per-category product templates ────────────────────────────────────────── */
// Each entry: [name, price, variantKind, extra?] where variantKind:
//   "size" | "weight" | "vol" | "pcs" | "garment" | "kid" | "shoe" |
//   "color:<a,b,c>" | "flavor:<a,b,c>" | "none"
// Prices are PKR. Names are realistic for Pakistani marketplaces.
const MENUS = {
  "Fast Food & Restaurants": [
    ["Chicken Zinger Burger", 449, "size"], ["Beef Cheese Burger", 549, "size"], ["Crispy Chicken Burger", 399, "size"],
    ["Tandoori Chicken Burger", 479, "size"], ["Chicken Tikka Pizza", 749, "size"], ["Fajita Pizza", 729, "size"],
    ["Pepperoni Pizza", 799, "size"], ["BBQ Chicken Pizza", 769, "size"], ["Margherita Pizza", 599, "size"],
    ["Chicken Shawarma Roll", 349, "none"], ["Zinger Wrap", 379, "none"], ["Club Sandwich", 429, "none"],
    ["Grilled Chicken Sandwich", 389, "none"], ["Chicken Tikka (4 pc)", 599, "size"], ["Malai Boti (8 pc)", 749, "size"],
    ["Seekh Kebab (6 pc)", 549, "size"], ["Chicken Wings (8 pc)", 649, "size"], ["Chicken Biryani", 449, "size"],
    ["Mutton Biryani", 699, "size"], ["Chicken Karahi", 1499, "size"], ["Mutton Karahi", 2499, "size"],
    ["Beef Nihari", 1299, "size"], ["Chicken Pulao", 399, "size"], ["Loaded Fries", 349, "size"],
    ["French Fries", 249, "size"], ["Chicken Nuggets (8 pc)", 379, "none"], ["Garlic Bread", 329, "none"],
    ["Cheese Garlic Bread", 399, "none"], ["Chocolate Brownie", 300, "none"], ["Molten Lava Cake", 399, "none"],
    ["Ice Cream Sundae", 349, "none"], ["Cold Coffee", 399, "flavor:Caramel,Mocha,Classic"], ["Mango Lassi", 299, "none"],
    ["Fresh Lemonade", 249, "none"], ["Soft Drink 500ml", 150, "flavor:Coke,Sprite,Dew"], ["Mineral Water 1.5L", 150, "none"],
    ["Green Tea", 150, "none"], ["Chicken Fried Rice", 549, "size"], ["Chicken Chowmein", 499, "size"],
    ["Family Zinger Deal", 1999, "none"], ["BBQ Family Box", 1899, "size"], ["Tandoori Feast", 2199, "none"],
  ],
  "Grocery & Kiryana": [
    ["Basmati Rice", 1250, "weight"], ["Wheat Flour", 1150, "weight"], ["Cooking Oil", 620, "vol"],
    ["Desi Ghee", 750, "weight"], ["Sugar", 175, "weight"], ["Milk (Fresh)", 260, "vol"],
    ["Yogurt (Dahi)", 220, "weight"], ["Butter", 450, "weight"], ["Cheddar Cheese", 550, "weight"],
    ["Eggs (Farm)", 420, "pcs"], ["Tea (Lipton-style)", 700, "weight"], ["Instant Coffee", 450, "weight"],
    ["Nescafe", 1650, "weight"], ["Salt", 120, "weight"], ["Red Chilli Powder", 320, "weight"],
    ["Turmeric Powder", 180, "weight"], ["Cumin Seeds", 250, "weight"], ["Coriander Powder", 240, "weight"],
    ["Garam Masala", 350, "weight"], ["Chana Dal", 380, "weight"], ["Masoor Dal", 340, "weight"],
    ["Moong Dal", 360, "weight"], ["Chickpeas", 350, "weight"], ["Kidney Beans", 420, "weight"],
    ["Pasta (Penne)", 420, "weight"], ["Instant Noodles", 150, "pcs"], ["Ketchup", 480, "weight"],
    ["Mayonnaise", 520, "weight"], ["Mineral Water (Case)", 550, "pcs"], ["Coke 1.5L", 350, "none"],
    ["Orange Juice", 650, "vol"], ["Apple Juice", 680, "vol"], ["Biscuits (Assorted)", 220, "weight"],
    ["Potato Chips (Family)", 350, "flavor:Plain,BBQ,Salt&Vinegar"], ["Wafers", 200, "weight"], ["Cornflakes", 550, "weight"],
    ["Oats", 780, "weight"], ["Dates (Premium)", 650, "weight"], ["Honey", 900, "weight"],
    ["Soap Bar (4-pack)", 360, "none"], ["Shampoo", 780, "vol"], ["Toothpaste", 420, "weight"],
    ["Detergent Powder", 620, "weight"], ["Dishwash Liquid", 450, "vol"], ["Handwash", 380, "vol"],
  ],
  "Fruits & Vegetables": [
    ["Tomatoes (Desi)", 120, "weight"], ["Potatoes", 100, "weight"], ["Onions", 140, "weight"],
    ["Bananas (12 pc)", 260, "pcs"], ["Apples (Kinnow-style)", 300, "weight"], ["Kinnow (Orange)", 320, "weight"],
    ["Mangoes (Sindhri)", 850, "weight"], ["Grapes", 700, "weight"], ["Pomegranate", 900, "weight"],
    ["Watermelon", 150, "weight"], ["Guava", 240, "weight"], ["Carrots", 180, "weight"],
    ["Cucumber", 150, "weight"], ["Capsicum (Shimla Mirch)", 450, "weight"], ["Cauliflower", 200, "weight"],
    ["Cabbage", 120, "weight"], ["Spinach (Palak)", 160, "weight"], ["Coriander Leaves", 100, "weight"],
    ["Mint Leaves", 150, "weight"], ["Ginger", 350, "weight"], ["Garlic", 400, "weight"],
    ["Green Chilli", 200, "weight"], ["Lemon", 220, "weight"], ["Strawberries", 1100, "weight"],
    ["Peaches", 950, "weight"], ["Plums", 850, "weight"], ["Dates (Fresh)", 800, "weight"],
    ["Bitter Gourd (Karela)", 250, "weight"], ["Brinjal", 180, "weight"], ["Lady Finger (Bhindi)", 220, "weight"],
    ["Green Peas", 350, "weight"], ["Sweet Corn", 300, "weight"], ["Mushroom", 850, "weight"],
    ["Papaya", 350, "weight"], ["Pineapple", 550, "pcs"], ["Litchi", 1200, "weight"],
    ["Coconut", 300, "pcs"], ["Pears", 900, "weight"], ["Mixed Salad Box", 500, "none"], ["Fruit Chaat Box", 450, "none"],
  ],
  "Bakery & Sweets": [
    ["White Sandwich Bread", 200, "none"], ["Brown Bread", 250, "none"], ["Milk Bread Loaf", 240, "none"],
    ["Whole Wheat Bread", 280, "none"], ["Burger Buns (6 pc)", 220, "pcs"], ["Cupcakes (4 pc)", 500, "pcs"],
    ["Muffins (6 pc)", 600, "pcs"], ["Chocolate Brownie", 300, "weight"], ["Chocolate Chip Cookies", 650, "weight"],
    ["Butter Cookies", 600, "weight"], ["Cake Rusk", 450, "weight"], ["Bread Rusk", 380, "weight"],
    ["Croissant", 350, "pcs"], ["Danish Pastry", 400, "pcs"], ["Chocolate Truffle Slice", 480, "none"],
    ["Red Velvet Slice", 450, "none"], ["Black Forest Cake (1kg)", 1800, "weight"], ["Chocolate Cake (1kg)", 1800, "weight"],
    ["Pineapple Cake (1kg)", 1700, "weight"], ["Strawberry Cake (1kg)", 1900, "weight"], ["Custom Birthday Cake (1kg)", 2200, "weight"],
    ["Donuts (Assorted)", 250, "pcs"], ["Baklava Box", 1600, "weight"], ["Kalakand", 900, "weight"],
    ["Barfi (Assorted)", 850, "weight"], ["Gulab Jamun", 750, "weight"], ["Ras Malai (6 pc)", 900, "pcs"],
    ["Cream Roll", 200, "pcs"], ["Chicken Puff", 250, "pcs"], ["Veg Puff", 200, "pcs"],
    ["Sheermal (4 pc)", 500, "pcs"], ["Khara Naan", 450, "weight"], ["Roghni Naan (4 pc)", 500, "pcs"],
    ["Mathura", 400, "weight"], ["Jalebi", 550, "weight"], ["Ladoo", 650, "weight"],
    ["Halwa (Sooji)", 600, "weight"], ["Chai Cake", 800, "weight"], ["Baguette", 350, "none"], ["Focaccia", 450, "none"],
  ],
  "Pharmacy & Medical": [
    ["Panadol (Paracetamol) 24s", 150, "none"], ["Disprin 20s", 90, "none"], ["Brufen 400mg 20s", 130, "none"],
    ["Risek (Omeprazole) 14s", 380, "none"], ["Augmentin 625 14s", 1200, "none"], ["Klaricid 500 14s", 1350, "none"],
    ["Amoxil 500 12s", 250, "none"], ["Flagyl 400 20s", 140, "none"], ["Zentel 400 (single)", 180, "none"],
    ["ORS Sachet", 30, "pcs"], ["Calamine Lotion", 250, "none"], ["Savlon Antiseptic 250ml", 350, "vol"],
    ["Betadine 100ml", 300, "vol"], ["Thermometer (Digital)", 550, "none"], ["BP Monitor (Digital)", 4500, "none"],
    ["Glucometer Kit", 3200, "none"], ["Nebulizer Machine", 8500, "none"], ["Steam Inhaler", 1400, "none"],
    ["Dettol Soap", 180, "none"], ["Lifesaver Hand Sanitizer", 350, "vol"], ["Face Mask (Surgical 50s)", 700, "pcs"],
    ["Nitrile Gloves (100s)", 900, "pcs"], ["First Aid Box", 1200, "none"], ["Bandage Roll", 80, "none"],
    ["Cotton Roll 100g", 180, "weight"], ["Gauze 1m", 60, "none"], ["Antiseptic Cream", 220, "none"],
    ["Pain Relief Spray", 650, "none"], ["Digestive Tablets", 120, "none"], ["Vitamin C (Sachet)", 150, "none"],
    ["Multivitamin Syrup", 450, "vol"], ["Calcium + D3", 800, "none"], ["Omega-3 Fish Oil", 1400, "none"],
    ["Iron Folic", 350, "none"], ["Eye Drops (Lubricant)", 500, "none"], ["Saline Nasal Drops", 300, "none"],
    ["Cough Syrup", 280, "vol"], ["Allergy Syrup", 320, "vol"], ["Baby Gripe Water", 250, "vol"], ["Electrolyte Drink", 180, "none"],
  ],
  "Fashion & Apparel": [
    ["Classic Polo T-Shirt", 1499, "color:Black,White,Navy,Maroon"], ["Striped Cotton T-Shirt", 1299, "color:Grey,Blue,Green"],
    ["Graphic Print T-Shirt", 1699, "color:Black,White,Teal"], ["Slim Fit Formal Shirt", 2499, "color:White,Sky Blue,Navy,Black"],
    ["Regular Fit Shirt", 2299, "color:White,Blue,Grey"], ["Check Casual Shirt", 1999, "color:Red&Black,Blue&White"],
    ["Slim Fit Jeans", 2999, "color:Blue,Black,Grey"], ["Straight Cut Jeans", 2799, "color:Blue,Black,Navy"],
    ["Chino Pants", 2499, "color:Beige,Navy,Grey,Olive"], ["Cotton Kurta", 1799, "color:White,Beige,Light Blue"],
    ["Embroidered Kurta", 2499, "color:White,Off-White"], ["Kurta + Waistcoat Set", 3499, "color:White,Navy,Black"],
    ["Shalwar Kameez (Men)", 3499, "color:White,Blue,Grey"], ["Premium Cotton Suit", 4999, "color:White,Navy,Black"],
    ["Kids Polo T-Shirt", 899, "color:Red,Blue,Green"], ["Kids Jeans", 1499, "color:Blue,Black,Grey"],
    ["Kids Kurta Pajama", 1999, "color:White,Blue"], ["Boys Party Shirt", 1699, "color:White,Light Blue"],
    ["Sneakers (Unisex)", 3999, "shoe"], ["Running Shoes", 4999, "shoe"], ["Canvas Shoes", 2499, "shoe"],
    ["Formal Leather Shoes", 5999, "shoe"], ["Sandals (Men)", 1899, "shoe"], ["Slippers (Home)", 999, "shoe"],
    ["Embroidered Cap", 899, "color:Black,Navy,Maroon"], ["Socks (3-Pair)", 599, "color:Black,White,Grey"],
    ["Leather Belt", 1299, "color:Black,Brown"], ["Winter Hoodie", 2499, "color:Black,Grey,Maroon"],
    ["Light Jacket (Denim)", 3999, "color:Blue,Black"], ["Formal Waistcoat", 1999, "color:Black,Navy"],
    ["Polo (Pique)", 1799, "color:Navy,White,Maroon,Green"], ["Sweatshirt", 1899, "color:Grey,Black"],
    ["Turtleneck", 1999, "color:Black,Grey,Navy"], ["Henley Shirt", 1699, "color:White,Grey,Olive"],
    ["Linen Shirt", 2899, "color:White,Beige,Sky"], ["Ladies Kurti", 1799, "color:Red,Blue,Green"],
    ["Ladies Stitched Suit", 4999, "color:Maroon,Teal,Purple"], ["Ladies Dupatta", 799, "color:Multicolor"],
    ["Ladies Handbag", 2499, "color:Black,Brown,Red"], ["Unisex Perfume (Body)", 999, "none"],
  ],
  "Electronics & Gadgets": [
    ["Wireless Earbuds", 2499, "color:White,Black"], ["Bluetooth Speaker", 3999, "color:Black,Blue"],
    ["Smart Watch (Fitness)", 5999, "color:Black,Silver"], ["Power Bank 10000mAh", 2999, "color:Black,White"],
    ["USB-C Cable 2m", 599, "none"], ["Fast Charger 33W", 1499, "none"], ["Phone Case (Silicone)", 699, "color:Black,Clear,Blue"],
    ["Tempered Glass Guard", 399, "none"], ["Selfie Stick", 899, "none"], ["Phone Tripod", 1299, "none"],
    ["LED Ring Light", 2499, "none"], ["Webcam HD", 3499, "none"], ["USB Mouse", 1299, "color:Black,White"],
    ["Wireless Mouse", 1999, "color:Black,Silver"], ["Mechanical Keyboard", 5999, "color:Black,White"],
    ["USB Hub 4-Port", 1699, "none"], ["HDMI Cable 2m", 799, "none"], ["Memory Card 64GB", 1699, "none"],
    ["Pen Drive 32GB", 1299, "none"], ["External HDD 1TB", 14500, "none"], ["Laptop Sleeve 15.6", 1999, "color:Black,Grey"],
    ["Laptop Cooling Pad", 2499, "none"], ["Gaming Headset", 4999, "color:Black,Red"], ["Headphone Stand", 1299, "none"],
    ["Smart Plug (WiFi)", 1999, "none"], ["WiFi Repeater", 2999, "none"], ["Smart Bulb (RGB)", 1499, "none"],
    ["Extension Board (4-socket)", 899, "none"], ["TV Remote Control", 599, "none"], ["AA Batteries (4pc)", 480, "none"],
    ["Smart Band", 3499, "color:Black,Pink"], ["Action Camera", 18999, "none"], ["Digital Kitchen Scale", 1799, "none"],
    ["Electric Kettle 1.5L", 2499, "none"], ["Hand Blender", 3499, "none"], ["Iron (Steam)", 4499, "none"],
    ["Hair Dryer", 2999, "none"], ["Shaver (Rechargeable)", 3999, "none"], ["Vacuum Cleaner (Mini)", 6999, "none"], ["Router (WiFi 5)", 5499, "none"],
  ],
  "Home & Living": [
    ["Cotton Bedsheet (Double)", 1999, "color:White,Blue,Maroon"], ["Pillow (Soft)", 999, "color:White,Grey"],
    ["Pillow Cover Set (4)", 699, "color:Assorted"], ["Duvet (Single)", 2999, "color:Grey,Blue"],
    ["Mosquito Net", 1499, "none"], ["Curtain (Set of 2)", 2499, "color:Beige,Teal,Burgundy"],
    ["Cushion Cover", 449, "color:Multi"], ["Floor Cushion (Sitara)", 1299, "color:Red,Blue"],
    ["Area Rug (3x5)", 4499, "color:Beige,Brown"], ["Door Mat", 699, "none"], ["Wardrobe Organizer", 1299, "none"],
    ["Laundry Basket", 1199, "color:White,Grey"], ["Storage Box (Stackable)", 899, "color:Clear,Blue"],
    ["Hanger Set (10pc)", 699, "none"], ["Table Lamp", 2499, "color:Black,Gold"], ["Wall Clock", 1999, "color:Black,Wood"],
    ["Photo Frame (A4)", 899, "color:Black,Brown"], ["Artificial Plant (Small)", 1199, "none"],
    ["Flower Vase (Ceramic)", 1499, "color:White,Blue"], ["Candle Set (6pc)", 999, "none"], ["Diffuser (Reed)", 1799, "none"],
    ["Coffee Mug (Set of 2)", 899, "color:White,Black"], ["Dinner Set (12pc)", 6499, "none"],
    ["Steel Cookware Set (5pc)", 8999, "none"], ["Non-stick Fry Pan", 2499, "none"], ["Chopping Board Set", 1499, "none"],
    ["Knife Set (6pc)", 3499, "none"], ["Cutlery Set (24pc)", 3999, "none"], ["Water Dispenser (5L)", 2499, "none"],
    ["Stainless Thermos 1L", 1799, "none"], ["Lunch Box (Insulated)", 2499, "color:Black,Blue"], ["Dining Mat (4pc)", 699, "none"],
    ["Ironing Board", 3499, "none"], ["Step Stool", 2499, "none"], ["Toolbox (Home)", 3999, "none"],
    ["Extension Cord (3m)", 1299, "none"], ["Ceiling Fan Remote", 899, "none"], ["LED Bulb (9W)", 499, "none"],
    ["Voltage Stabilizer 1000VA", 6499, "none"], ["UPS Battery (150Ah)", 28500, "none"],
  ],
  "Health & Beauty": [
    ["Face Wash (Acne Care)", 549, "none"], ["Face Cream (Moisturizer)", 899, "none"], ["Sunscreen SPF 50", 1299, "none"],
    ["Vitamin C Serum", 1499, "none"], ["Facial Cleanser (Foam)", 899, "none"], ["Face Mask (Clay)", 699, "none"],
    ["Lip Balm", 349, "none"], ["Lipstick (Matte)", 999, "color:Red,Nude,Pink"], ["Eyeliner (Liquid)", 599, "color:Black,Brown"],
    ["Mascara", 899, "none"], ["Foundation", 1499, "color:Fair,Medium,Warm"], ["Compact Powder", 1199, "color:Fair,Medium"],
    ["Blush", 799, "color:Pink,Peach"], ["Nail Polish", 349, "color:Red,Pink,Nude"], ["Nail Polish Remover", 449, "none"],
    ["Hair Oil (Amla)", 899, "vol"], ["Shampoo (Anti-Hairfall)", 1199, "vol"], ["Conditioner", 1299, "vol"],
    ["Hair Mask", 1499, "weight"], ["Hair Serum", 999, "none"], ["Hair Color (Black)", 799, "color:Black,Brown"],
    ["Comb & Brush Set", 699, "none"], ["Body Lotion", 1099, "vol"], ["Body Scrub", 899, "weight"],
    ["Body Mist", 799, "flavor:Rose,Lavender,Fresh"], ["Perfume (30ml)", 2499, "none"], ["Roll-on Deodorant", 549, "color:Men,Women"],
    ["Hand Cream", 549, "none"], ["Foot Cream", 649, "none"], ["Shaving Razor (5-blade)", 799, "none"],
    ["Shaving Foam", 649, "none"], ["Trimmer (Facial)", 2999, "none"], ["Eyebrow Kit", 899, "none"],
    ["Cotton Buds (200s)", 299, "none"], ["Cotton Pads (100s)", 349, "none"], ["Nail Kit (Manicure)", 999, "none"],
    ["Tweezers", 299, "none"], ["Beauty Sponge Set", 499, "none"], ["Makeup Brush Set (12pc)", 1499, "none"], ["Face Roller (Jade)", 999, "none"],
  ],
  "Books & Stationery": [
    ["English Novel (Paperback)", 899, "none"], ["Urdu Novel", 599, "none"], ["Islamic Book (Seerat)", 799, "none"],
    ["School Dictionary", 1299, "none"], ["Kids Story Book (Set of 4)", 999, "none"], ["Coloring Book (Kids)", 449, "none"],
    ["Exercise Book (Single Line)", 150, "pcs"], ["Exercise Book (Double Line)", 160, "pcs"], ["Register (300 pages)", 550, "none"],
    ["Sticky Notes (Pack)", 349, "none"], ["Notebook (Spiral A4)", 599, "color:Black,Blue,Red"], ["Notebook (Hard Cover)", 749, "color:Black,Maroon"],
    ["Journal (Faux Leather)", 999, "color:Brown,Black"], ["Pen (Ballpoint 10pc)", 450, "none"], ["Gel Pen (Set of 12)", 650, "none"],
    ["Parker-style Fountain Pen", 1499, "none"], ["Highlighter (Set of 4)", 500, "none"], ["Pencil (HB 12pc)", 400, "none"],
    ["Color Pencils (24pc)", 899, "none"], ["Crayons (24pc)", 749, "none"], ["Sketch Pens (12pc)", 599, "none"],
    ["Water Colors (12pc)", 599, "none"], ["Poster Colors", 449, "none"], ["Geometry Box", 550, "none"],
    ["Scissors (Steel)", 450, "none"], ["Glue Stick (Pack)", 300, "none"], ["Cellotape (Big)", 250, "none"],
    ["Stapler + Pins", 800, "none"], ["Paper Punch", 550, "none"], ["Files (Box, 10pc)", 650, "none"],
    ["Document Folder (Plastic)", 350, "color:Blue,Black"], ["Envelopes (Pack of 20)", 300, "none"], ["File Covers (10pc)", 250, "none"],
    ["Magnetic Whiteboard A3", 2499, "none"], ["Whiteboard Markers (4pc)", 500, "none"], ["Chalk", 250, "none"],
    ["Ruler (Steel 12-inch)", 150, "none"], ["Eraser (Pack of 5)", 200, "none"], ["Sharpener", 150, "none"], ["Calculator (Scientific)", 1499, "none"],
  ],
  "Sports & Fitness": [
    ["Yoga Mat", 1999, "color:Black,Purple,Blue"], ["Dumbbells Pair (2kg)", 2499, "none"], ["Adjustable Dumbbell", 8999, "none"],
    ["Kettlebell 8kg", 4999, "none"], ["Resistance Bands Set", 1499, "none"], ["Skipping Rope", 599, "none"],
    ["Push-up Board", 1499, "none"], ["Ab Roller", 1499, "none"], ["Exercise Bench", 14999, "none"],
    ["Home Gym Kit", 24500, "none"], ["Treadmill (Foldable)", 85000, "none"], ["Exercise Cycle", 45000, "none"],
    ["Cricket Bat (English Willow)", 14999, "none"], ["Cricket Ball (Leather)", 1299, "none"], ["Cricket Pads", 3499, "none"],
    ["Football (Size 5)", 2499, "none"], ["Basketball", 2799, "none"], ["Badminton Racket", 1999, "none"],
    ["Badminton Shuttlecock (Pack)", 899, "none"], ["Table Tennis Racket", 1499, "none"], ["Tennis Racket", 3999, "none"],
    ["Squash Racket", 3499, "none"], ["Swimming Goggles", 1299, "none"], ["Swimming Cap", 599, "none"],
    ["Dumbbell Set (20kg)", 12999, "none"], ["Weight Lifting Belt", 2499, "none"], ["Gym Gloves", 1499, "color:Black,Red"],
    ["Protein Shaker", 999, "color:Black,Blue"], ["Skipping Mat", 899, "none"], ["Agility Ladder", 1999, "none"],
    ["Punching Bag", 14999, "none"], ["Boxing Gloves", 4499, "none"], ["Hand Gripper", 599, "none"],
    ["Balance Board", 2499, "none"], ["Tennis Balls (Pack of 3)", 899, "none"], ["Foosball Table", 24999, "none"],
    ["Snooker Cue", 4499, "none"], ["Board Dice (Ludo)", 649, "none"], ["Chess Set", 1299, "none"], ["Carrom Board", 2999, "none"],
  ],
  "Toys & Baby Care": [
    ["Remote Control Car", 2499, "color:Red,Blue"], ["RC Monster Truck", 2999, "color:Green,Blue"], ["RC Mini Drone", 3499, "none"],
    ["Building Blocks (100pc)", 999, "color:Multi"], ["Building Blocks (250pc)", 1899, "color:Multi"], ["City Blocks Set", 2999, "color:Multi"],
    ["Action Figure (Superhero)", 1499, "none"], ["Action Figure 3-Pack", 2499, "none"], ["Doll (Barbie-style)", 1799, "color:Blonde,Brunette"],
    ["Doll with Accessories", 1999, "none"], ["Soft Teddy Bear (30cm)", 1299, "color:Brown,White,Pink"], ["Plush Bunny", 999, "color:White,Pink"],
    ["Jigsaw Puzzle (100pc)", 799, "none"], ["Jigsaw Puzzle (500pc)", 1499, "none"], ["Ludo & Snakes Board", 649, "none"],
    ["Magnetic Chess Set", 1299, "none"], ["Monopoly-style Board", 2499, "none"], ["Toy Kitchen Set", 3499, "none"],
    ["Doctor Play Set", 1499, "none"], ["Tool Workshop Set", 1999, "none"], ["Kids Keyboard Piano", 2499, "none"],
    ["Toy Drum Set", 1299, "none"], ["Kids Scooter", 5999, "color:Blue,Pink"], ["Balance Bicycle", 4499, "color:Red,Blue"],
    ["Kids Tricycle", 7999, "color:Red,Blue"], ["Play Tent", 2999, "color:Blue,Pink"], ["Ball Pit Balls (20pc)", 699, "color:Multi"],
    ["Indoor Basketball Set", 1999, "none"], ["Water Blaster", 799, "none"], ["Blaster Gun (Foam)", 2999, "none"],
    ["Rubik's Cube", 599, "none"], ["Slime Kit", 799, "none"], ["Play-Doh-style (12pc)", 1299, "color:Multi"],
    ["Coloring Book Set", 649, "none"], ["Crayons (24 colours)", 499, "none"], ["Water Colors Set", 599, "none"],
    ["Baby Walker", 4999, "color:Blue,Pink"], ["Baby Rattle Set", 699, "color:Multi"], ["Activity Gym Mat", 3499, "none"], ["Silicone Teether", 599, "color:Yellow,Blue"],
  ],
  "Automotive Accessories": [
    ["Car Seat Cover (Set)", 4999, "color:Black,Beige"], ["Steering Cover", 899, "color:Black,Brown"], ["Gear Knob Cover", 499, "none"],
    ["Floor Mats (Full Set)", 3499, "color:Black,Brown"], ["Trunk Mat", 1999, "none"], ["Sun Shade (Front)", 899, "none"],
    ["Windshield Cover", 1499, "none"], ["Car Perfume (Vent Clip)", 599, "flavor:Ocean,Lemon,Vanilla"], ["Air Freshener Gel", 449, "flavor:Fresh,Musk"],
    ["Mobile Holder (Dash)", 899, "none"], ["Mobile Holder (Vent)", 599, "none"], ["USB Car Charger (Dual)", 799, "none"],
    ["Car Vacuum Cleaner", 4999, "none"], ["Tyre Inflator (Digital)", 3499, "none"], ["Jump Starter", 8999, "none"],
    ["Car Battery 55Ah", 14500, "none"], ["Headlight Bulb (LED)", 1999, "none"], ["LED Fog Lights", 3499, "none"],
    ["Car Polisher", 7999, "none"], ["Car Wax (Liquid)", 1299, "none"], ["Car Shampoo 1L", 799, "none"],
    ["Microfiber Towel Set", 999, "none"], ["Pressure Washer", 14999, "none"], ["Emergency Triangle", 699, "none"],
    ["First Aid Kit (Car)", 1499, "none"], ["Seat Belt Cutter", 599, "none"], ["Dashcam (Front)", 8999, "none"],
    ["Parking Sensor Kit", 4499, "none"], ["Car Cover (Full)", 2499, "none"], ["Roof Cargo Bag", 5999, "none"],
    ["Bike Phone Holder", 899, "none"], ["Bike Helmet", 3999, "color:Black,White"], ["Bike LED Light Set", 1299, "none"],
    ["Bike Side Mirror", 799, "none"], ["Bike Chain Lock", 1499, "none"], ["Bike Engine Oil 1L", 1400, "none"],
    ["Air Pump (Manual)", 1299, "none"], ["Spare Tyre Jack", 2999, "none"], ["Wheel Cleaner", 899, "none"], ["Car Trash Bin", 699, "none"],
  ],
  "Handmade & Crafts": [
    ["Handmade Beaded Bracelet", 499, "none"], ["Beaded Necklace (Set)", 899, "color:Red,Blue,Green"], ["Earrings (Handmade)", 649, "none"],
    ["Clay Flower Vase", 1299, "none"], ["Ceramic Mug (Hand-painted)", 899, "none"], ["Hand-painted Bowl Set", 1999, "none"],
    ["Coaster Set (4pc)", 599, "color:Assorted"], ["Macrame Wall Hanging", 1499, "none"], ["Macrame Plant Hanger", 799, "none"],
    ["Knitted Scarf", 1499, "color:Grey,Blue,Red"], ["Knitted Beanie", 999, "color:Black,Maroon"], ["Knitted Gloves", 899, "color:Grey,Black"],
    ["Embroidery Hoop Art", 1199, "none"], ["Hand Stitched Cushion", 1499, "color:Multi"], ["Quilted Table Runner", 1799, "none"],
    ["Patchwork Tote Bag", 1299, "color:Multi"], ["Jute Shopping Bag", 499, "none"], ["Woolen Socks (Handmade)", 699, "color:Grey,Red"],
    ["Leather Journal (Handmade)", 1799, "none"], ["Handmade Soap (Set of 4)", 899, "flavor:Lavender,Olive,Neem"], ["Bath Bomb Set", 1199, "none"],
    ["Candle (Soy, Hand-poured)", 999, "flavor:Vanilla,Coffee,Sandal"], ["Aroma Oil Bottle", 699, "flavor:Rose,Lavender"], ["Pottery Tea Set", 3499, "none"],
    ["Clay Keychain Set", 499, "none"], ["Handmade Greeting Cards (Set)", 799, "none"], ["Photo Album (Handmade)", 1499, "none"],
    ["Woolen Throw (Small)", 3999, "color:Multi"], ["Handloom Scarf", 1999, "color:Multi"], ["Block Print Fabric (Metre)", 999, "none"],
    ["Truck Art Mini Frame", 699, "none"], ["Resin Coaster Set", 1199, "color:Blue,Green"], ["Resin Jewellery Tray", 899, "color:Pink,Gold"],
    ["Origami Art Kit", 999, "none"], ["Paper Quilling Kit", 1299, "none"], ["Rangoli Stencil Set", 499, "none"],
    ["Hanging Dream Catcher", 1199, "none"], ["Wind Chime (Bamboo)", 899, "none"], ["Birdhouse (Painted)", 1799, "none"],
  ],
  "Others / Universal": [
    ["Umbrella (Auto Open)", 999, "color:Black,Blue,Red"], ["Raincoat", 1299, "none"], ["Sunglasses (UV)", 1499, "none"],
    ["Wrist Watch (Men)", 2499, "color:Black,Silver"], ["Wrist Watch (Women)", 2299, "color:Pink,Gold"], ["Wallet (Men)", 999, "color:Brown,Black"],
    ["Handbag", 2499, "color:Black,Brown"], ["Backpack (Laptop)", 3499, "color:Black,Grey"], ["Travel Duffle Bag", 2999, "color:Black,Blue"],
    ["Suitcase 24-inch", 8999, "color:Black,Navy,Red"], ["Passport Holder", 799, "color:Black,Brown"], ["Travel Pillow", 999, "none"],
    ["Water Bottle (Steel)", 1299, "color:Black,Silver"], ["Thermos Flask", 1799, "color:Black,Steel"], ["Lunch Box (Steel)", 1499, "none"],
    ["Tiffin Carrier (3-tier)", 2499, "none"], ["Mosquito Repellent (Electric)", 899, "none"], ["Mosquito Coil (Pack)", 350, "none"],
    ["Vacuum Flask 2L", 2499, "none"], ["Torch (Rechargeable)", 1499, "none"], ["Emergency Lamp", 1199, "none"],
    ["Bicycle (Road)", 34999, "color:Black,Red"], ["Bicycle Helmet", 2999, "none"], ["Car Wheel Brush", 699, "none"],
    ["Gift Hamper Box", 1999, "none"], ["Photo Collage Frame", 1499, "none"], ["Party Balloons (Pack)", 499, "color:Multi"],
    ["Gift Wrap Roll", 599, "none"], ["Birthday Candles Set", 349, "none"], ["Table Fan (Mini)", 1499, "none"],
    ["Stand Fan (18-inch)", 5999, "none"], ["Electric Mosquito Racket", 999, "none"], ["Steam Mop Cloth", 699, "none"],
    ["Sewing Kit (Travel)", 899, "none"], ["Measuring Tape", 399, "none"], ["Multimeter", 2999, "none"],
    ["Padlock Set", 699, "none"], ["Nail Hammer", 799, "none"], ["Screwdriver Set", 1299, "none"], ["Gloves (Work)", 599, "none"],
  ],
};

function variantFor(kind, price, index, name, category) {
  if (kind === "size") return [sizeOpts(price)];
  if (kind === "weight") return [weightOpts(price)];
  if (kind === "vol") return [volOpts(price)];
  if (kind === "pcs") return [pcsOpts(price)];
  if (kind === "garment") return [garmentSizeOpts(price)];
  if (kind === "kid") return [kidSizeOpts(price)];
  if (kind === "shoe") return [shoeSizes];
  if (kind.startsWith("color:")) {
    // Only real apparel keeps letter/age sizes; other colour products (bags,
    // bedsheets, electronics, toys) just get the colour picker.
    if (category === "Fashion & Apparel") {
      const nm = name || "";
      const isKids = /^(kids|boys|girls|baby|toddler)/i.test(nm) || /kid/i.test(nm);
      return isKids
        ? [kidSizeOpts(price), colorOpts(kind.slice(6).split(","))]
        : [garmentSizeOpts(price), colorOpts(kind.slice(6).split(","))];
    }
    return [colorOpts(kind.slice(6).split(","))];
  }
  if (kind.startsWith("flavor:")) return [flavorOpts(price, kind.slice(7).split(","))];
  // give "none" items a light optional variant so even simple rows test the picker
  if (index % 3 === 0) {
    return [{
      name: "Pack",
      options: [
        { label: "Single", price: P(price), original_price: origP(P(price)) },
        { label: "Double", price: P(price * 1.9), original_price: origP(P(price * 1.9)) },
        { label: "Family", price: P(price * 3.2), original_price: origP(P(price * 3.2)) },
      ],
    }];
  }
  return null;
}

/* ── model builders ────────────────────────────────────────────────────────── */
function buildShops(count) {
  const shops = [];
  for (let i = 0; i < Math.min(count, STORES.length); i++) {
    const [name, category] = STORES[i];
    const g = shopGeo(i);
    const uid = 1000 + i;
    const shopId = uuid5(`fullshop:${i}:${name}`);
    const ownerId = uuid5(`merchant:${i}`);
    shops.push({
      idx: i, uid, name, category, shopId, ownerId,
      location: `${g.area}, ${g.city}`,
      address: `${g.area} Main Bazaar, ${g.city}`,
      whatsapp: `030${(0).toString()}-${(4000000 + i * 1111).toString().slice(0, 7)}`,
      lat: g.lat, lng: g.lng, zones: g.zones, area: g.area, city: g.city,
      slug: `store-${i + 1}`,
      accent: ACCENTS[i % ACCENTS.length],
      minOrder: 150 + (i % 5) * 50,
      freeDelivery: 1500 + (i % 6) * 500,
      feeFlat: 79 + (i % 4) * 20,
      feePerKm: 20 + (i % 3) * 5,
      radius: 6 + (i % 5) * 2,
      bio: `${name} — trusted ${category.toLowerCase()} store in ${g.area}, ${g.city}. Fresh stock, fair prices, fast local delivery.`,
      announcement: (i % 3 === 0) ? "Flat Rs 200 off on orders above Rs 1,999 this week!" : null,
      hours: "Mon-Sun: 9 AM - 11 PM",
      opStatus: "Open Today: 9 AM - 11 PM",
    });
  }
  return shops;
}

function buildProducts(shops) {
  // Deterministic image-count profile across the WHOLE catalog:
  //  * 700 products -> 3 images + variants
  //  * 500 products -> 2 images + variants
  //  * remaining     -> >=1 image (most still get a variant / tier)
  const THREE_IMG = 700;
  const TWO_IMG = 500;

  const products = [];
  let counter = 0;
  for (const shop of shops) {
    const menu = MENUS[shop.category];
    if (!menu) throw new Error(`no menu for ${shop.category}`);
    // 2000 / 50 = 40 per shop exactly.
    for (let j = 0; j < 40; j++) {
      const base = menu[j % menu.length];
      const [name, price, kind] = base;
      const serial = counter++; // global serial -> stable 3/2/1 profile
      const shopOffset = (shop.idx * 7) % menu.length;

      let imgCount = 1;
      if (serial < THREE_IMG) imgCount = 3;
      else if (serial < THREE_IMG + TWO_IMG) imgCount = 2;

      const productSeed = serial + 1;
      const gallery = buildImages(shop.category, productSeed, imgCount);
      const discount = serial % 4 === 0; // every 4th product is "on sale"

      // Row uniqueness within a shop: include the menu index so repeating base
      // names across shops never collide with the same id.
      const nameFull = `${name}${base.length === 4 ? ` ${base[3]}` : ""}`;
      const pid = uuid5(`prod:${shop.shopId}:${j}:${nameFull}`);
      const isUnavailable = serial % 97 === 0; // tiny sprinkle of sold-out rows
      const stock = serial % 41 === 0 ? "out_of_stock" : serial % 17 === 0 ? "low_stock" : "in_stock";
      // Kids rows get age-range sizes; adults get S–XXL with real price deltas.
      const variants = variantFor(kind, price, serial, nameFull, shop.category);

      products.push({
        id: pid,
        shopId: shop.shopId,
        name: nameFull,
        price,
        original: discount ? origP(price) : null,
        gallery,
        imageUrl: gallery[0],
        variants,
        tiers: serial % 11 === 0 ? packs([[1, price], [3, P(price * 2.7)], [6, P(price * 5)]]) : null,
        isAvailable: !isUnavailable,
        stock,
        serial,
        shop: shop.name,
        desc: `${nameFull} from ${shop.name} — ${shop.area}, ${shop.city}. Order on WhatsApp for fast delivery.`,
        cat: shop.category,
        shopOffset,
      });
    }
  }
  return { products, counters: { three: THREE_IMG, two: TWO_IMG } };
}

function buildDeals(shops, productsByShop) {
  const deals = [];
  let idx = 0;
  for (const shop of shops) {
    const list = productsByShop.get(shop.shopId) || [];
    if (list.length === 0) continue;
    const perShop = Math.max(2, Math.round(300 / 50)); // avg 6 per shop -> ~300 total
    const step = Math.max(1, Math.floor(list.length / perShop));
    let k = 0;
    for (let d = 0; d < perShop; d++) {
      k = Math.min(k, list.length - 1);
      const prod = list[k];
      const imgCount = idx < 100 ? 4 + (idx % 2) : 1; // first 100 -> 4-5 images
      const gallery = buildImages(shop.category, 9000 + idx, imgCount);
      const discountPct = [10, 15, 20, 25, 30, 40][idx % 6];
      const dealPrice = P(prod.price);
      const original = P(dealPrice / (1 - discountPct / 100));
      const scheduleKind = idx % 4 === 0 ? "date_range" : idx % 5 === 0 ? "monthly" : "weekly";
      const title = `${prod.name} — ${discountPct}% OFF`;
      deals.push({
        id: uuid5(`deal:${shop.shopId}:${d}:${prod.id}`),
        shopId: shop.shopId,
        productId: prod.id,
        title,
        description: `${prod.name} now Rs ${dealPrice} (was Rs ${P(original)}). ${discountPct}% OFF — order today.`,
        schedule_type: scheduleKind,
        weekdays: scheduleKind === "weekly" ? [0, 1, 2, 3, 4, 5, 6] : null,
        day_of_month: scheduleKind === "monthly" ? (d % 28) + 1 : null,
        starts_on: scheduleKind === "date_range" ? addDays(today, -(d % 10)) : null,
        ends_on: scheduleKind === "date_range" ? addDays(today, 10 + (d % 20)) : null,
        is_active: true,
        imageUrl: gallery[0],
        images: gallery,
        badge_text: `${discountPct}% OFF`,
        is_featured: d % 3 === 0,
        price: dealPrice,
        original_price: P(original),
      });
      idx++;
      k += step;
    }
  }
  return deals;
}

/* ── system stats + counts (dry mode) ──────────────────────────────────────── */
function summarize(shops, products, deals) {
  const img = (n) => (n === 1 ? "1 img" : `${n} imgs`);
  const withVariants = products.filter((p) => p.variants).length;
  const three = products.filter((p) => p.gallery.length === 3).length;
  const two = products.filter((p) => p.gallery.length === 2).length;
  const one = products.filter((p) => p.gallery.length === 1).length;
  const multi = products.filter((p) => p.gallery.length > 1).length;
  const deals45 = deals.filter((d) => (d.images?.length || 1) >= 4).length;
  const byCat = {};
  for (const s of shops) byCat[s.category] = (byCat[s.category] || 0) + 1;
  console.log(`\n================ FULL TEST SEED ================`);
  console.log(`Shops      : ${shops.length}`);
  console.log(`Products   : ${products.length}  (${three}×3img · ${two}×2img · ${one}×1img)  multi-img:${multi}  withVariants:${withVariants}`);
  console.log(`Deals      : ${deals.length}  (${deals45} with 4-5 images)`);
  console.log(`Categories : ${Object.keys(byCat).length}  ${JSON.stringify(byCat)}`);
  const perCat = { three: 0, two: 0 };
  for (const s of shops) {
    for (const p of products.filter((x) => x.shopId === s.shopId)) {
      if (p.gallery.length === 3) perCat.three++;
      if (p.gallery.length === 2) perCat.two++;
    }
  }
  console.log(`Accounts   : merchants ${shops.length} · customers 8 · password ${PASSWORD}`);
}

/* ── DB writers (service role) ─────────────────────────────────────────────── */
async function upsertRows(table, rows, conflictTarget, updateKeys, tolerant = false) {
  if (DRY || rows.length === 0) return;
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, {
      onConflict: conflictTarget,
      ignoreDuplicates: false,
    });
    if (error) {
      if (/duplicate key/.test(error.message)) continue; // already present
      // A table-level blocker (e.g. a stale updated_at trigger on `stories`)
      // — with `tolerant`, log it once and stop trying instead of failing the
      // whole seed.
      if (tolerant) {
        console.error(`  ${table}: skipped — ${error.message.slice(0, 140)}`);
        return;
      }
      // Possibly a column mismatch — log first few chars for diagnosis
      console.error(`  ${table} upsert error:`, error.message.slice(0, 200));
      process.exitCode = 1;
      return;
    }
  }
  const prog = `  ${table}: ${rows.length} rows`;
  console.log(prog);
}

/** Insert 6 sponsored ads. The guard trigger forces non-admin writers to
 *  'pending', so we sign in as the super admin (env ADMIN_BOOTSTRAP_EMAIL /
 *  ADMIN_BOOTSTRAP_PASSWORD) when available and insert as that user — those
 *  rows come out 'approved' and appear in the public sponsored rails. */
async function createAds(shops) {
  if (DRY) return;
  const rows = [];
  for (let i = 0; i < 6; i++) {
    const s = shops[i % shops.length];
    rows.push({
      id: uuid5(`ad:home:${i}`),
      shop_id: s.shopId,
      title: [`Big Sale at ${s.name}`, `${s.name} — Up to 30% off`, `Fresh deals from ${s.name}`, `${s.name} free delivery`, `${s.name} weekly special`, `${s.name} combo offers`][i],
      subtitle: "Limited time — order now on WhatsApp.",
      image_url: imgFor(s.category, 700 + i * 13, 1200),
      link_url: `/shop/${s.shopId}`,
      badge_label: "Sponsored",
      placement: i % 2 === 0 ? "homepage_top" : "homepage_feed",
      status: "approved",
      is_active: true,
      starts_at: new Date().toISOString(),
      ends_at: addDays(today, 30),
      sort_order: i,
    });
  }

  const adminEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const adminPass = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  let client = supabase;
  if (adminEmail && adminPass) {
    try {
      const anon = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
      const { data, error } = await anon.auth.signInWithPassword({ email: adminEmail, password: adminPass });
      if (!error && data?.session) {
        client = anon; // trigger sees auth.uid() = admin -> keeps 'approved'
        console.log("  ads: inserting as super admin (approved)");
      } else {
        console.log("  ads: admin login unavailable — inserting as pending (approve in admin panel)");
      }
    } catch {
      client = supabase;
      console.log("  ads: admin login unavailable — inserting as pending (approve in admin panel)");
    }
  } else {
    console.log("  ads: no admin creds in env — inserting as pending (approve in admin panel)");
  }

  const CHUNK = 20;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client.from("promotional_ads").upsert(rows.slice(i, i + CHUNK), { onConflict: "id" });
    if (error) {
      console.error("  promotional_ads upsert error:", error.message.slice(0, 200));
      process.exitCode = 1;
      return;
    }
  }
  console.log(`  promotional_ads: ${rows.length} rows`);
}

async function createAuthAccounts(shops) {
  if (DRY) return;
  const merchants = [];
  for (let i = 0; i < shops.length; i++) {
    const s = shops[i];
    merchants.push({
      id: s.ownerId,
      email: `merchant${String(i + 1).padStart(2, "0")}@trendmart.pk`,
      fullName: s.name.replace(/ Co\.| Store| Mart| &/g, "").trim() + (i % 3 === 0 ? " (Owner)" : ""),
      phone: s.whatsapp,
      role: "merchant",
    });
  }
  const customers = Array.from({ length: 8 }, (_, i) => ({
    id: uuid5(`customer:${i}`),
    email: `customer${String(i + 1).padStart(2, "0")}@trendmart.pk`,
    fullName: ["Ahmed Raza", "Sana Malik", "Bilal Khan", "Mahnoor Ali", "Hamza Yousaf", "Areeba Fatima", "Usman Cheema", "Zoya Shah"][i],
    phone: `0300-${(1230000 + i * 7777).toString().slice(0, 7)}`,
    role: "customer",
  }));

  const all = [...merchants, ...customers];
  let created = 0, existing = 0;
  // Fetch the full user list once (emails never change during the run).
  const { data: existingUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const byEmail = new Map((existingUsers?.users || []).map((u) => [u.email, u]));
  for (const a of all) {
    const known = byEmail.get(a.email);
    if (known) {
      a.id = known.id;
      existing++;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: a.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: a.fullName, phone: a.phone },
        app_metadata: { role: a.role },
      });
      if (error && !/already registered/i.test(error.message)) {
        console.error("  createUser error:", a.email, error.message);
        process.exitCode = 1;
        return { merchants, customers, created, existing };
      }
      if (data?.user) {
        a.id = data.user.id;
        created++;
        byEmail.set(a.email, data.user);
      }
    }
  }
  console.log(`  auth users: ${created} created, ${existing} existing`);

  const profiles = all.map((a) => ({ user_id: a.id, full_name: a.fullName, phone: a.phone }));
  // user_roles PK is `id` (not user_id) — supply a deterministic id + upsert on it.
  const roles = all.map((a) => ({ id: uuid5(`role:${a.id}:${a.role}`), user_id: a.id, role: a.role }));
  await upsertRows("user_profiles", profiles, "user_id", []);
  await upsertRows("user_roles", roles, "id", []);
  return { merchants, customers, created, existing };
}

async function main() {
  console.log("TrendsMart FULL TEST SEED");
  console.log(`mode: ${DRY ? "DRY RUN (counts only)" : "WRITE"} · shops: ${LIMIT_SHOPS}`);

  const shops = buildShops(LIMIT_SHOPS);
  const { products, counters } = buildProducts(shops);

  // deals reference real product ids — group products by shop
  const byShop = new Map();
  for (const p of products) {
    const arr = byShop.get(p.shopId) || [];
    arr.push(p);
    byShop.set(p.shopId, arr);
  }
  const deals = buildDeals(shops, byShop);
  void counters;
  summarize(shops, products, deals);

  if (DRY) {
    console.log("\n(dry run — nothing written)");
    return;
  }

  // 1) auth accounts (returns ACTUAL user ids from Supabase, since admin
  //     createUser generates its own uuid — never trust our deterministic id)
  console.log("\n[1/7] creating test accounts…");
  const accounts = await createAuthAccounts(shops);
  const ownerByShopIdx = new Map();
  accounts.merchants.forEach((m, i) => ownerByShopIdx.set(i, m.id));

  // 2) shops
  console.log("\n[2/7] upserting shops…");
  const shopRows = shops.map((s) => ({
    id: s.shopId,
    owner_id: ownerByShopIdx.get(s.idx) ?? s.ownerId,
    name: s.name,
    slug: s.slug,
    category: s.category,
    location: s.location,
    address_display: s.address,
    whatsapp_number: s.whatsapp,
    logo_url: imgFor(s.category, 100 + s.idx * 17, 400),
    banner_url: imgFor(s.category, 200 + s.idx * 31, 1200),
    is_live: true,
    verification_status: "approved",
    latitude: s.lat,
    longitude: s.lng,
    service_radius_km: s.radius,
    delivery_zones: s.zones,
    min_order_amount: s.minOrder,
    free_delivery_threshold: s.freeDelivery,
    delivery_fee_flat: s.feeFlat,
    delivery_fee_per_km: s.feePerKm,
    store_bio: s.bio,
    announcement: s.announcement,
    business_hours: s.hours,
    operating_status: s.opStatus,
    accent_color: s.accent,
    shop_type: "retail",
    accepts_delivery: true,
    accepts_pickup: true,
  }));
  await upsertRows("shops", shopRows, "id", ["name", "category", "logo_url", "banner_url", "is_live", "verification_status", "latitude", "longitude", "service_radius_km", "delivery_zones"]);

  // 3) products
  console.log("\n[3/7] upserting products…");
  const productRows = products.map((p) => ({
    id: p.id,
    shop_id: p.shopId,
    name: p.name,
    description: p.desc,
    price: p.price,
    original_price: p.original,
    currency: "PKR",
    image_url: p.imageUrl,
    images: p.gallery,
    is_available: p.isAvailable,
    stock_status: p.stock,
    variants: p.variants,
    price_tiers: p.tiers,
  }));
  await upsertRows("products", productRows, "id", ["name", "price", "original_price", "image_url", "images", "variants", "price_tiers", "is_available", "stock_status"]);

  // 4) deals
  console.log("\n[4/7] upserting deals…");
  const dealRows = deals.map((d) => ({
    id: d.id,
    shop_id: d.shopId,
    title: d.title,
    description: d.description,
    schedule_type: d.schedule_type,
    weekdays: d.weekdays,
    day_of_month: d.day_of_month,
    starts_on: d.starts_on,
    ends_on: d.ends_on,
    is_active: d.is_active,
    image_url: d.imageUrl,
    images: d.images,
    badge_text: d.badge_text,
    is_featured: d.is_featured,
    product_id: d.productId,
    price: d.price,
    original_price: d.original_price,
  }));
  await upsertRows("shop_deals", dealRows, "id", ["title", "price", "original_price", "image_url", "images", "badge_text", "is_active"]);

  // 5) coupons (one per shop, deterministic)
  console.log("\n[5/7] upserting coupons…");
  const couponRows = shops.map((s, i) => ({
    id: uuid5(`coupon:${s.shopId}`),
    shop_id: s.shopId,
    code: `SAVE${String(i + 1).padStart(2, "0")}`,
    discount_percent: [5, 8, 10, 12][i % 4],
    discount_amount: null,
    expiry_date: addDays(today, 60),
    is_active: true,
    min_order_amount: 999,
    usage_limit: 100,
  }));
  await upsertRows("coupons", couponRows, "id", ["code", "discount_percent", "is_active", "expiry_date"]);

  // 6) stories (some shops, so homepage stories tray is alive)
  console.log("\n[6/7] upserting stories…");
  const storyRows = [];
  for (let i = 0; i < shops.length; i += 3) {
    const s = shops[i];
    const count = 1 + (i % 2); // 1-2 stories per chosen shop
    for (let st = 0; st < count; st++) {
      storyRows.push({
        id: uuid5(`story:${s.shopId}:${st}`),
        shop_id: s.shopId,
        image_url: imgFor(s.category, 500 + i * 7 + st * 3, 640),
        caption: st === 0 ? `New arrivals at ${s.name}!` : `Limited-time ${["offer", "sale", "combo", "fresh stock"][st]} — order on WhatsApp`,
        expires_at: addDays(today, 1),
        created_at: new Date(Date.now() - st * 3600000).toISOString(),
      });
    }
  }
  await upsertRows("stories", storyRows, "id", ["image_url", "caption", "expires_at"], true);

  // 7) reviews + a few sponsored ads
  console.log("\n[7/7] upserting reviews + ads…");
  const reviewers = ["Ahmed Raza", "Sana Malik", "Bilal Khan", "Mahnoor Ali", "Hamza Yousaf", "Areeba Fatima", "Usman Cheema", "Zoya Shah"];
  const comments = [
    "Great quality and fast delivery. Highly recommended!",
    "Items exactly as described. Packaging was neat.",
    "Good prices compared to the market. Will order again.",
    "Fresh stock and very polite service on WhatsApp.",
    "Slightly slow delivery but the product is worth it.",
    "Excellent experience — this is my new go-to store.",
    "Value for money. The discount made it even better.",
    "Ordered twice already. Consistent quality.",
  ];
  const reviewRows = [];
  let rv = 0;
  for (const s of shops) {
    const list = byShop.get(s.shopId) || [];
    if (list.length === 0) continue;
    const n = 3 + (s.idx % 4); // 3-6 reviews per shop
    for (let r = 0; r < n; r++) {
      const prod = list[(rv * 3 + r) % list.length];
      reviewRows.push({
        id: uuid5(`review:${s.shopId}:${r}`),
        shop_id: s.shopId,
        product_id: r % 2 === 0 ? prod.id : null,
        customer_name: reviewers[rv % reviewers.length],
        rating: 3 + ((rv + r) % 3), // 3-5 stars
        comment: comments[(rv + r) % comments.length],
        verified_purchase: r % 3 !== 0,
      });
      rv++;
    }
  }
  await upsertRows("reviews", reviewRows, "id", ["rating", "comment", "product_id"]);

  // Sponsored ads — the guard trigger forces non-admin inserts to 'pending',
  // so we insert as the SUPER ADMIN (when its credentials exist in .env.local)
  // to get approved, publicly-visible ads. Falls back to pending rows otherwise.
  await createAds(shops);

  console.log("\n✅ FULL TEST SEED COMPLETE");
  console.log("Test accounts: merchants use merchant01@…50@trendmart.pk · customers customer01@…08@trendmart.pk");
  console.log(`Password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
