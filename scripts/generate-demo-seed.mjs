/* eslint-disable */
// =============================================================================
// TrendMart — Demo Seed Generator
// -----------------------------------------------------------------------------
// Generates `supabase/migrations/demo-seed-data.sql` with:
//   • 7 demo shops (2 restaurants, grocery, bakery, desi food, toys, clothing)
//   • ~600 products with variants (sizes/flavours/colours/spice) + pack price
//     tiers + discount (original_price) + REAL name-matched images: every
//     product searches Openverse by its exact name and each candidate URL is
//     verified to actually serve an image before it is written to the seed
//   • ~55 scheduled weekly deals linked to products
//   • 7 merchant + 3 customer test accounts (password: Trend@123), fully
//     self-contained — no clean-slate file needed to run the generated seed
//
// Run:  node scripts/generate-demo-seed.mjs
// Then: paste the generated .sql into the Supabase SQL editor.
//
// Deterministic UUIDs + ON CONFLICT DO NOTHING → safe to re-run.
// =============================================================================

import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "supabase", "migrations", "demo-seed-data.sql");
const OV_CACHE = join(__dirname, ".demo-image-cache.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Openverse keyword image cache ────────────────────────────────────────────
let ovCache = {};
function loadOvCache() {
  try {
    if (existsSync(OV_CACHE)) ovCache = JSON.parse(readFileSync(OV_CACHE, "utf8")) || {};
  } catch {
    ovCache = {};
  }
}
function saveOvCache() {
  try {
    writeFileSync(OV_CACHE, JSON.stringify(ovCache), "utf8");
  } catch {
    /* ignore */
  }
}

const OV_UA = "trendmart-demo-seed/1.0 (image search)";

/** True when the URL actually returns an image (avoids broken/hotlink-blocked links). */
async function imageIsOk(url) {
  const check = (method) =>
    new Promise((resolve) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      fetch(url, { method, signal: ctrl.signal, headers: { "user-agent": OV_UA } })
        .then((res) => {
          clearTimeout(t);
          if (!res.ok) return resolve({ ok: false, status: res.status });
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          if (/^image\/(jpe?g|png|webp|gif)/i.test(ct)) return resolve({ ok: true, status: res.status });
          return resolve({ ok: /^2/.test(String(res.status)), status: res.status });
        })
        .catch(() => {
          clearTimeout(t);
          resolve({ ok: false, status: 0 });
        });
    });

  const head = await check("HEAD");
  if (head.ok) return true;
  // Some CDNs (flickr, wikimedia, imgur) reject HEAD with 403/405 but still
  // serve the image on a plain GET — only a real 404/4xx-on-GET means broken.
  if (head.status === 403 || head.status === 405 || head.status === 501 || head.status === 0) {
    const get = await check("GET");
    return get.ok;
  }
  return false;
}

/** Search Openverse (free CC search API, no key) for a keyword-matched photo,
 *  then VERIFY each candidate URL actually serves an image before returning.
 *  Returns the direct image URL (jpg/png/webp) or null after retries. */
async function openverseImage(query) {
  const key = String(query || "").toLowerCase().trim();
  if (!key) return null;
  if (ovCache[key]) return ovCache[key];
  const url =
    "https://api.openverse.org/v1/images/?q=" +
    encodeURIComponent(key) +
    "&page_size=10&license_type=commercial";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": OV_UA } });
      clearTimeout(t);
      if (res.status === 429) {
        await sleep(4000 * attempt);
        continue;
      }
      if (!res.ok) {
        await sleep(900);
        continue;
      }
      const j = await res.json();
      const candidates = (j.results || [])
        .map((r) => r?.url)
        .filter((u) => u && /\.(jpe?g|png|webp)$/i.test(u) && !/\.svg/i.test(u))
        .slice(0, 6);
      for (const u of candidates) {
        if (await imageIsOk(u)) {
          ovCache[key] = u;
          return u;
        }
        await sleep(150);
      }
      break; // 200 but no usable candidate — don't retry the same query
    } catch {
      await sleep(900);
    }
  }
  return null;
}

/** Build a good search keyword from a product name + its image pool. */
function cleanSearchQuery(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\(\d+\s?(?:pc|kg|g|ml|l|pack|pcs|set|pairs?|pieces?)\)/g, " ")
    .replace(/\b\d+(?:\.\d+)?\s?(?:kg|g|ml|l|litre|liters|dozen|pc|pcs|pack)\b/g, " ")
    .replace(/\b(?:1\.5l|2\.25l|500ml|250ml|200ml|1l|250g|200g|100g|500g|1kg|5kg|10kg|12pc|6pc|4pc|2pc|3pc|8pc|20pc|30pc|24pc)\b/g, " ")
    .replace(/[()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const POOL_KEYWORDS = {
  pizza: "pizza", burger: "burger", fries: "fries", bbq: "grilled bbq",
  desi: "pakistani food", naan: "naan bread", drink: "drink", dessert: "dessert",
  grocery: "grocery", bakery: "bakery", cake: "cake", toys: "toy",
  clothes: "clothing", kurta: "pakistani kurta", shoes: "shoes",
  dairy: "dairy", snacks: "snacks", pantry: "pantry", household: "household",
};
function searchQueryFor(name, pool) {
  let q = cleanSearchQuery(name);
  if (!q) q = String(name || "").toLowerCase();
  const kw = POOL_KEYWORDS[pool];
  if (kw && !new RegExp(kw.split(" ")[0], "i").test(q)) q += " " + kw;
  return q;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? "").replace(/'/g, "''");
const r = (n) => Math.max(1, Math.round(n));
const pct = (base, pctOff) => r(base * (1 - pctOff / 100));
const uuid5 = (seed) => {
  const h = createHash("md5").update(seed).digest();
  h[6] = (h[6] & 0x0f) | 0x30; // version 3-style (deterministic, unique per seed)
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
};

/** Nice rounded original ("before discount") price for a variant option, so
 *  every size/colour/portion shows its OWN % OFF badge (never 0% / negative
 *  when the selected option is more expensive than the product base price). */
const origPrice = (p) => Math.max(p + 1, Math.ceil((p * 1.15) / 50) * 50);
const withOrig = (opt) => (typeof opt.price === "number" ? { ...opt, original_price: origPrice(opt.price) } : opt);

// variant group builders
const sizeGroup = (base, adj = { s: -150, m: 0, l: 150, f: 350 }) => ({
  name: "Size",
  options: [
    withOrig({ label: "Small", price: r(base + adj.s) }),
    withOrig({ label: "Medium", price: r(base + adj.m) }),
    withOrig({ label: "Large", price: r(base + adj.l) }),
    withOrig({ label: "Family", price: r(base + adj.f) }),
  ],
});
const clothesSizeGroup = {
  name: "Size",
  options: [{ label: "S" }, { label: "M" }, { label: "L" }, { label: "XL" }, { label: "XXL" }],
};
const kidsSizeGroup = {
  name: "Size",
  options: [{ label: "2-3Y" }, { label: "4-5Y" }, { label: "6-8Y" }, { label: "9-11Y" }],
};
const colorGroup = (cols, extraPriceFor = {}) => ({
  name: "Color",
  options: cols.map((c) =>
    extraPriceFor[c]
      ? withOrig({ label: c, price: r(extraPriceFor[c]) })
      : { label: c },
  ),
});
const spiceGroup = {
  name: "Spice Level",
  options: [{ label: "Mild" }, { label: "Medium" }, { label: "Hot" }],
};
const halfFullGroup = (base) => ({
  name: "Portion",
  options: [
    withOrig({ label: "Half", price: r(base * 0.55) }),
    withOrig({ label: "Full", price: base }),
  ],
});
const singleDoubleGroup = (base, extra = 260) => ({
  name: "Portion",
  options: [
    withOrig({ label: "Single", price: base }),
    withOrig({ label: "Double", price: r(base + extra) }),
  ],
});
const tier = (arr) => arr.map(([q, price]) => ({ min_qty: q, price: r(price) }));

// ── Unsplash image pools (pruned to working URLs at generation time) ────────
const IMG = {
  pizza: ["1513104890138-7c749659a591", "1574071318508-1cdbab80d002", "1565299624946-b28f40a0ae38", "1628840042765-356cda07504e", "1593560708920-61dd98c46a4e", "1595854341625-f33ee10dbf94", "1604382354936-07c5d9983bd3", "1548369937-47519962c615", "1511688878353-3a2f5be94cd7", "1593560708920-61dd98c46a4e"],
  burger: ["1568901346375-23c9450c58cd", "1571091718767-18b5b1457add", "1550547660-d9450f859349", "1565299507177-b0ac66763828", "1594212699903-ec8a3eca50f5", "1561758033-d89a9ad46330"],
  fries: ["1573080496219-bb080dd4f877", "1541592106381-b31cd9677b20", "1585109649139-366815a0d713"],
  drink: ["1544145945-f90425340c7e", "1622483767028-3f66f32aef97", "1581636625402-29b2a704ef13", "1600271886742-f049cd451bba", "1548839144-2b0a59e5a2a4", "1523362628745-0c100150b504"],
  dessert: ["1551024506-0bccd828d307", "1563805042-7684c019e1cb", "1553787499-6f9133860273", "1587314168485-3236d6710814"],
  bbq: ["1529193591184-b1d58069ecdd", "1544025162-d76694265947", "1555939594-58d7cb561ad1", "1533365331577-cfe9afc649a2", "1599487488170-d11ec9c172f0"],
  desi: ["1589302168068-964664d93dc0", "1563379091339-03b21ab4a4f8", "1631515243349-e0cb75fb8d3a", "1585937421612-70a008356fbe", "1601050690597-df0568f70950", "1546833999-b9f581a1996d", "1567188040759-fb8a883dc6d6"],
  naan: ["1589212852572-8d3197f39a21", "1601050690117-94f5f6fa8a1a"],
  grocery: ["1542838132-92c53300491e", "1573246123716-6b1782bfc499", "1587049352846-4a222e784d38", "1615485929900-0a4b9c3e5e3d", "1543168256-418811576931", "1591343395082-e120087004b4", "1590425561156-c9e6f96d1f98", "1621363272097-d7d0b9a3d2b0", "1519708227418-c8fd9a32b7a2"],
  bakery: ["1509440159596-0249088772ff", "1549931319-a545dcf3bc73", "1555507036-ab1f4038808a", "1586444248902-2f64eddc13df", "1509365465985-25d11c17e812", "1517433670267-08bbd4be890f"],
  cake: ["1578985545062-69928b1d9587", "1551024506-0bccd828d307", "1587668178277-295251f900ce", "1571115177098-24ec42ed204d"],
  toys: ["1558060370-d644479cb6f7", "1566576912321-d58ddd7a6088", "1596461404969-9ae70f2830c1", "1515488042361-ee00e0ddd4e4", "1566159385152-da28a566e80d", "1559487950-9b5f5b4d8c1f", "1572321415829-5e10004b3a4e", "1535378917042-10a22c95931a"],
  clothes: ["1441986300917-64674bd600d8", "1523381210434-271e8be1f52b", "1576566588028-4147f3842f27", "1620799140408-edc6dcb6d633", "1618354691373-d851c5c3a990", "1596755094514-f87e34085b2c", "1434389677669-e08b4cac3105", "1489987707025-afc232f7ea0f"],
  kurta: ["1583391733956-6c78276477e2", "1623228371602-4dfe1e9e11f1", "1599491391765-77db7d5ffbe2", "1621435454194-9b3f9d60a3a2"],
  shoes: ["1542291026-7eec264c27ff", "1595950653106-6c9ebd614d3a", "1600185365926-3a2ce3cdb9eb", "1560343090-f0409e92791a"],
  dairy: ["1550583724-b2692b85b150", "1563636619-e9143da7973b", "1579959646364-95af4e75e2c4"],
  snacks: ["1599490659213-e2b8987d1dc4", "1561758033-d89a9ad46330", "1601924994987-69e26d50dc26", "1585716809818-9c6e39f0f648"],
  pantry: ["1586201375761-83865001e31c", "1622021142947-da7dedc7c39a", "1611686082194-b7cfdd4e9e30", "1575993872831-0dcae94ff03a"],
  household: ["1600857062241-98e5d9017a0c", "1610669861580-b35ff593d21b", "1585421514738-01798e348b17"],
  generic: ["1513104890138-7c749659a591", "1546069901-ba9599a7e63c"],
};

const imgUrl = (id, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

// ── shops ────────────────────────────────────────────────────────────────────
const MERCHANTS = {
  m1: "d0000000-0000-4000-8000-000000000001",
  m2: "d0000000-0000-4000-8000-000000000002",
  m3: "d0000000-0000-4000-8000-000000000003",
  m4: "d0000000-0000-4000-8000-000000000004",
  m5: "d0000000-0000-4000-8000-000000000005",
  m6: "e0000000-0000-4000-8000-000000000006",
  m7: "e0000000-0000-4000-8000-000000000007",
};

const SHOP_ID = {
  tandoori: "a0000000-0000-4000-8000-000000000001",
  pizza: "a0000000-0000-4000-8000-000000000002",
  grocery: "a0000000-0000-4000-8000-000000000003",
  bakery: "a0000000-0000-4000-8000-000000000004",
  desi: "a0000000-0000-4000-8000-000000000005",
  toys: "a0000000-0000-4000-8000-000000000006",
  clothes: "a0000000-0000-4000-8000-000000000007",
};

const SHOPS = [
  {
    key: "tandoori", id: SHOP_ID.tandoori, owner: MERCHANTS.m1,
    name: "Tandoori Express", category: "Fast Food & Restaurants",
    location: "Satellite Town, Gujranwala", address_display: "Grand Trunk Road, Satellite Town, Gujranwala",
    whatsapp: "0301-5551001", lat: 32.1566, lng: 74.1870, radius: 10,
    logo: IMG.pizza[0], banner: IMG.bbq[0],
    bio: "Fresh tandoor, wood-fired pizzas, juicy burgers & BBQ. Fast delivery across Satellite Town.",
    announcement: "Free delivery on orders above Rs 1,500 — this week only!",
    hours: "Mon-Sun: 11 AM - 12 AM", op_status: "Open Today: 11 AM - 12 AM",
    accent: "#f97316", min_order: 300, free_delivery: 1500, fee_flat: 99, fee_per_km: 25,
    zones: ["Satellite Town", "Civil Lines", "Model Town", "Peoples Colony"],
  },
  {
    key: "pizza", id: SHOP_ID.pizza, owner: MERCHANTS.m2,
    name: "Pizza Palace", category: "Fast Food & Restaurants",
    location: "Civil Lines, Gujranwala", address_display: "Court Road, Civil Lines, Gujranwala",
    whatsapp: "0301-5551002", lat: 32.1647, lng: 74.1903, radius: 8,
    logo: IMG.pizza[1], banner: IMG.pizza[3],
    bio: "20+ pizza flavours, fresh pasta & garlic bread. The family pizza spot of Civil Lines.",
    announcement: "Family Pizza + 1.5L drink combo at Rs 1,499",
    hours: "Mon-Sun: 12 PM - 1 AM", op_status: "Open Today: 12 PM - 1 AM",
    accent: "#dc2626", min_order: 250, free_delivery: 2000, fee_flat: 149, fee_per_km: 30,
    zones: ["Civil Lines", "Cantt", "Satellite Town", "Model Town"],
  },
  {
    key: "grocery", id: SHOP_ID.grocery, owner: MERCHANTS.m3,
    name: "Al-Madina Super Store", category: "Grocery & Kiryana",
    location: "Model Town, Gujranwala", address_display: "Model Town Main Bazaar, Gujranwala",
    whatsapp: "0301-5551003", lat: 32.1505, lng: 74.1781, radius: 12,
    logo: IMG.grocery[0], banner: IMG.grocery[7],
    bio: "Your neighbourhood kiryana + supermarket. Daily staples, snacks, dairy & household.",
    announcement: "Pack of 6 mineral water — only Rs 550!",
    hours: "Mon-Sun: 8 AM - 11 PM", op_status: "Open Today: 8 AM - 11 PM",
    accent: "#16a34a", min_order: 200, free_delivery: 2500, fee_flat: 79, fee_per_km: 20,
    zones: ["Model Town", "Peoples Colony", "Satellite Town", "Azizabad"],
  },
  {
    key: "bakery", id: SHOP_ID.bakery, owner: MERCHANTS.m4,
    name: "Sweet Bites Bakery", category: "Bakery & Sweets",
    location: "Peoples Colony, Gujranwala", address_display: "Peoples Colony Main Road, Gujranwala",
    whatsapp: "0301-5551004", lat: 32.1521, lng: 74.1950, radius: 8,
    logo: IMG.bakery[0], banner: IMG.cake[0],
    bio: "Fresh bread daily, custom cakes, pastries, rusk & desi sweets. Order for home or office.",
    announcement: "Order cakes 24 hrs ahead — free custom message on top",
    hours: "Mon-Sun: 7 AM - 11 PM", op_status: "Open Today: 7 AM - 11 PM",
    accent: "#d97706", min_order: 250, free_delivery: 1500, fee_flat: 99, fee_per_km: 25,
    zones: ["Peoples Colony", "Civil Lines", "Model Town", "Kohinoor Town"],
  },
  {
    key: "desi", id: SHOP_ID.desi, owner: MERCHANTS.m5,
    name: "Dera Desi Khana", category: "Fast Food & Restaurants",
    location: "Cantt, Gujranwala", address_display: "Gujranwala Cantt Main Road, Gujranwala",
    whatsapp: "0301-5551005", lat: 32.1700, lng: 74.2100, radius: 10,
    logo: IMG.desi[0], banner: IMG.desi[3],
    bio: "Sindhi & Punjabi desi khana — karahi, nihari, biryani, haleem & tandoori naan.",
    announcement: "Chicken Karahi + 4 naan combo at Rs 1,999",
    hours: "Mon-Sun: 11 AM - 12 AM", op_status: "Open Today: 11 AM - 12 AM",
    accent: "#ca8a04", min_order: 300, free_delivery: 1800, fee_flat: 89, fee_per_km: 20,
    zones: ["Cantt", "Civil Lines", "Gulshan-e-Iqbal", "Rasoolpura"],
  },
  {
    key: "toys", id: SHOP_ID.toys, owner: MERCHANTS.m6,
    name: "ToyKart", category: "Toys & Baby Care",
    location: "Kohinoor Town, Gujranwala", address_display: "Kohinoor Town Main Boulevard, Gujranwala",
    whatsapp: "0301-5551006", lat: 32.1480, lng: 74.1700, radius: 8,
    logo: IMG.toys[0], banner: IMG.toys[1],
    bio: "Action figures, remote cars, building blocks, dolls & educational toys for all ages.",
    announcement: "Gift combos — flat 10% off on two or more toys",
    hours: "Mon-Sun: 10 AM - 10 PM", op_status: "Open Today: 10 AM - 10 PM",
    accent: "#8b5cf6", min_order: 150, free_delivery: 2000, fee_flat: 119, fee_per_km: 30,
    zones: ["Kohinoor Town", "Peoples Colony", "Satellite Town", "Azizabad"],
  },
  {
    key: "clothes", id: SHOP_ID.clothes, owner: MERCHANTS.m7,
    name: "Trendy Threads", category: "Fashion & Apparel",
    location: "Rasoolpura, Gujranwala", address_display: "Rasoolpura Main Bazaar, Gujranwala",
    whatsapp: "0301-5551007", lat: 32.1595, lng: 74.2010, radius: 10,
    logo: IMG.clothes[0], banner: IMG.clothes[6],
    bio: "Men's & kids' fashion — polos, shirts, jeans, kurtas & shalwar kameez in fresh designs.",
    announcement: "Buy 2 kurta designs, get 5% off — mix & match",
    hours: "Mon-Sun: 10 AM - 11 PM", op_status: "Open Today: 10 AM - 11 PM",
    accent: "#0ea5e9", min_order: 300, free_delivery: 2500, fee_flat: 129, fee_per_km: 25,
    zones: ["Rasoolpura", "Civil Lines", "Cantt", "Nowshera Virkan"],
  },
];

// ── product catalogs ─────────────────────────────────────────────────────────
// Row format: [name, price, imgPool, variants|null, tiers|null, original|null, stockStatus]
// null variant → simple product. `original` > price renders a discount badge.

const CATALOGS = {
  tandoori: [
    // Pizzas (12 flavours × size + spice)
    ["Chicken Tikka Pizza", 649, "pizza", [sizeGroup(649), spiceGroup], null, 799],
    ["Fajita Pizza", 699, "pizza", [sizeGroup(699), spiceGroup], null, 849],
    ["Pepperoni Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 899],
    ["Margherita Pizza", 549, "pizza", [sizeGroup(549)], null, 649],
    ["BBQ Chicken Pizza", 699, "pizza", [sizeGroup(699), spiceGroup], null, 849],
    ["Creamy White Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 899],
    ["Afghani Chicken Pizza", 799, "pizza", [sizeGroup(799), spiceGroup], null, 949],
    ["Supreme Chicken Pizza", 899, "pizza", [sizeGroup(899), spiceGroup], null, 1099],
    ["Chicken Cheese Burst", 849, "pizza", [sizeGroup(849), spiceGroup], null, 999],
    ["Veggie Delight Pizza", 599, "pizza", [sizeGroup(599)], null, 699],
    ["Chicken Mushroom Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 879],
    ["Desi Masala Pizza", 679, "pizza", [sizeGroup(679), spiceGroup], null, 799],
    // Burgers
    ["Zinger Burger", 449, "burger", singleDoubleGroup(449), null, 549],
    ["Chicken Crispy Burger", 399, "burger", singleDoubleGroup(399), null, 479],
    ["Beef Cheese Burger", 549, "burger", singleDoubleGroup(549, 300), null, 649],
    ["Tandoori Chicken Burger", 479, "burger", singleDoubleGroup(479), null, 569],
    ["Chicken Shawarma Wrap", 349, "burger", null, null, 399],
    ["Zinger Wrap", 379, "burger", null, null, 429],
    ["Club Sandwich", 429, "burger", null, null, 499],
    ["Grilled Chicken Sandwich", 389, "burger", null, null, 459],
    // BBQ
    ["Chicken Tikka (4pc)", 599, "bbq", [halfFullGroup(599), spiceGroup], null, 699],
    ["Chicken Malai Boti (8pc)", 749, "bbq", [halfFullGroup(749), spiceGroup], null, 869],
    ["Seekh Kebab (6pc)", 549, "bbq", [halfFullGroup(549), spiceGroup], null, 629],
    ["Beef Boti (4pc)", 899, "bbq", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Chicken Wings (8pc)", 649, "bbq", [halfFullGroup(649), spiceGroup], null, 749],
    ["Mutton Tikka (4pc)", 1099, "bbq", [halfFullGroup(1099), spiceGroup], null, 1299],
    // Sides
    ["Loaded Fries", 349, "fries", [singleDoubleGroup(349, 150)], null, 399],
    ["French Fries", 249, "fries", [singleDoubleGroup(249, 120)], null, 299],
    ["Cheesy Fries", 399, "fries", [singleDoubleGroup(399, 160)], null, 449],
    ["Chicken Nuggets (8pc)", 379, "fries", null, null, 429],
    ["Onion Rings", 299, "fries", null, null, 349],
    ["Garlic Bread", 329, "fries", null, null, 379],
    ["Chicken Samosa (4pc)", 249, "fries", null, null, 299],
    ["Pakora Platter", 299, "fries", [spiceGroup], null, 349],
    // Rice / naan
    ["Chicken Biryani", 449, "desi", [sizeGroup(449, { s: -120, m: 0, l: 130, f: 320 })], null, 529],
    ["Mutton Biryani", 649, "desi", [sizeGroup(649, { s: -150, m: 0, l: 180, f: 420 })], null, 749],
    ["Chicken Pulao", 399, "desi", [sizeGroup(399, { s: -100, m: 0, l: 120, f: 280 })], null, 449],
    ["Garlic Naan", 120, "naan", null, tier([[1, 120], [4, 440], [8, 800]]), 150],
    ["Butter Naan", 100, "naan", null, tier([[1, 100], [4, 360], [8, 640]]), null],
    ["Tandoori Roti", 50, "naan", null, tier([[1, 50], [6, 260], [12, 480]]), null],
    ["Roghni Naan", 150, "naan", null, tier([[1, 150], [4, 540], [8, 960]]), null],
    // Drinks
    ["Soft Drink 500ml", 150, "drink", null, tier([[1, 150], [6, 780], [12, 1440]]), null],
    ["Soft Drink 1.5L", 300, "drink", null, tier([[1, 300], [4, 1080]]), null],
    ["Mineral Water 1.5L", 150, "drink", null, tier([[1, 150], [6, 780], [12, 1380]]), null],
    ["Cold Coffee", 399, "drink", null, null, 449],
    ["Fresh Lemonade", 249, "drink", null, null, 299],
    ["Mango Lassi", 299, "drink", null, null, 349],
    ["Lab-e-Shireen", 329, "drink", null, null, 379],
    ["Green Tea", 150, "drink", null, null, null],
    // Desserts
    ["Chocolate Brownie", 249, "dessert", null, null, 299],
    ["Molten Lava Cake", 399, "dessert", null, null, 459],
    ["Ice Cream Sundae", 349, "dessert", null, null, 399],
    ["Fruit Trifle", 299, "dessert", null, null, 349],
    // Combos
    ["Tandoori Feast (2 pizzas + drink)", 1699, "pizza", [spiceGroup], null, 1999],
    ["BBQ Box (tikka + boti + wings)", 1899, "bbq", [spiceGroup], null, 2299],
    ["Family Zinger Deal (4 burgers + fries + drink)", 1999, "burger", null, null, 2399],
  ],
  pizza: [
    ["Pepperoni Classic Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 899],
    ["Chicken Tikka Pizza", 699, "pizza", [sizeGroup(699), spiceGroup], null, 849],
    ["BBQ Chicken Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 899],
    ["Fajita Sensation Pizza", 729, "pizza", [sizeGroup(729), spiceGroup], null, 879],
    ["Smoked Chicken Pizza", 799, "pizza", [sizeGroup(799), spiceGroup], null, 949],
    ["Cheese Lover's Pizza", 829, "pizza", [sizeGroup(829)], null, 979],
    ["Hawaiian Pizza", 699, "pizza", [sizeGroup(699)], null, 849],
    ["Veggie Supreme Pizza", 649, "pizza", [sizeGroup(649)], null, 779],
    ["Chicken Supreme Pizza", 849, "pizza", [sizeGroup(849), spiceGroup], null, 999],
    ["Mushroom & Olive Pizza", 719, "pizza", [sizeGroup(719)], null, 849],
    ["Peri Peri Chicken Pizza", 769, "pizza", [sizeGroup(769), spiceGroup], null, 919],
    ["Tandoori Beef Pizza", 849, "pizza", [sizeGroup(849), spiceGroup], null, 999],
    ["Double Cheese Burst", 899, "pizza", [sizeGroup(899), spiceGroup], null, 1049],
    ["Kebab Pizza", 879, "pizza", [sizeGroup(879), spiceGroup], null, 1029],
    ["Chicken Ranch Pizza", 779, "pizza", [sizeGroup(779), spiceGroup], null, 929],
    // Pasta & more
    ["Creamy Alfredo Pasta", 649, "pizza", [singleDoubleGroup(649, 200), spiceGroup], null, 749],
    ["Red Sauce Pasta", 599, "pizza", [singleDoubleGroup(599, 200), spiceGroup], null, 699],
    ["Mac & Cheese", 549, "pizza", [singleDoubleGroup(549, 180)], null, 629],
    ["Garlic Bread Sticks", 329, "fries", null, tier([[1, 329], [2, 599]]), 379],
    ["Cheese Garlic Bread", 399, "fries", null, null, 449],
    ["Chicken Wings (12pc)", 899, "bbq", [spiceGroup], null, 1049],
    ["BBQ Wings (12pc)", 949, "bbq", [spiceGroup], null, 1099],
    ["Zinger Burger", 449, "burger", [singleDoubleGroup(449)], null, 529],
    ["Chicken Sandwich", 399, "burger", null, null, 459],
    ["Italian Salad", 549, "fries", null, null, 629],
    ["Chicken Caesar Salad", 599, "fries", null, null, 679],
    ["Coke 500ml", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["Sprite 500ml", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["Mineral Water 1.5L", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["Chocolate Brownie", 269, "dessert", null, null, 319],
    ["Tiramisu Cup", 499, "dessert", null, null, 569],
    ["New York Cheesecake", 549, "dessert", null, null, 629],
    ["Family Combo (2 large pizzas + drink)", 1999, "pizza", [spiceGroup], null, 2399],
    ["Lunch Deal (small pizza + drink)", 749, "pizza", [spiceGroup], null, 899],
  ],
  grocery: [
    ["Basmati Rice 5kg", 1250, "pantry", null, null, 1399],
    ["Basmati Rice 10kg", 2450, "pantry", null, null, 2699],
    ["Wheat Flour 10kg", 1150, "pantry", null, null, 1299],
    ["Wheat Flour 20kg", 2250, "pantry", null, null, 2499],
    ["Cooking Oil 1L", 620, "pantry", null, tier([[1, 620], [3, 1750], [6, 3300]]), 680],
    ["Cooking Oil 5L", 2950, "pantry", null, null, 3299],
    ["Ghee 1kg", 750, "pantry", null, null, 820],
    ["Sugar 1kg", 175, "pantry", null, tier([[1, 175], [5, 800], [10, 1500]]), null],
    ["Sugar 5kg", 850, "pantry", null, null, null],
    ["Milk 1L", 260, "dairy", null, tier([[1, 260], [6, 1440], [12, 2760]]), null],
    ["Milk 250ml (6-pack)", 540, "dairy", null, null, 600],
    ["Yogurt 400g", 220, "dairy", null, tier([[1, 220], [4, 800], [8, 1520]]), null],
    ["Butter 200g", 450, "dairy", null, null, 500],
    ["Cheddar Cheese 200g", 550, "dairy", null, null, 620],
    ["Eggs (dozen)", 420, "dairy", null, tier([[1, 420], [3, 1200], [6, 2280]]), 460],
    ["Tea 190g", 700, "pantry", null, null, 780],
    ["Tea 950g", 3150, "pantry", null, null, 3500],
    ["Coffee 50g", 450, "pantry", null, null, 500],
    ["Nescafe 200g", 1650, "pantry", null, null, 1850],
    ["Salt 800g", 120, "pantry", null, tier([[1, 120], [6, 660], [12, 1200]]), null],
    ["Red Chilli Powder 200g", 320, "pantry", null, null, null],
    ["Turmeric 100g", 180, "pantry", null, null, null],
    ["Cumin Seeds 100g", 250, "pantry", null, null, null],
    ["Coriander Powder 200g", 240, "pantry", null, null, null],
    ["Garam Masala 100g", 350, "pantry", null, null, null],
    ["Chana Dal 1kg", 380, "pantry", null, null, null],
    ["Masoor Dal 1kg", 340, "pantry", null, null, null],
    ["Moong Dal 1kg", 360, "pantry", null, null, null],
    ["Whole Wheat Pasta 500g", 420, "pantry", null, null, 470],
    ["Ketchup 800g", 480, "pantry", null, null, 540],
    ["Mayonnaise 350g", 520, "pantry", null, null, 580],
    ["Mineral Water 1.5L", 150, "drink", null, tier([[1, 150], [6, 550], [12, 1000]]), 180],
    ["Mineral Water 0.5L (12-pack)", 450, "drink", null, null, 520],
    ["Coke 1.5L", 350, "drink", null, tier([[1, 350], [4, 1280]]), 390],
    ["Coke 500ml (6-pack)", 840, "drink", null, null, 900],
    ["Orange Juice 1L", 650, "drink", null, null, 720],
    ["Apple Juice 1L", 680, "drink", null, null, 750],
    ["Biscuits Assorted 200g", 220, "snacks", null, null, null],
    ["Potato Chips Family Pack", 350, "snacks", null, null, 390],
    ["Wafers 120g", 200, "snacks", null, null, null],
    ["Noodles 6-pack", 660, "snacks", null, null, 720],
    ["Crackers 300g", 330, "snacks", null, null, null],
    ["Dates 500g", 650, "snacks", null, null, 720],
    ["Cornflakes 375g", 550, "pantry", null, null, 610],
    ["Oats 1kg", 780, "pantry", null, null, 850],
    ["Soap 100g (4-pack)", 360, "household", null, null, 400],
    ["Shampoo 300ml", 780, "household", null, null, 850],
    ["Toothpaste 120g", 420, "household", null, null, 460],
    ["Detergent 1kg", 620, "household", null, null, 690],
    ["Dishwash Liquid 500ml", 450, "household", null, null, 500],
    ["Handwash 250ml", 380, "household", null, null, 420],
    ["Floor Cleaner 1L", 420, "household", null, null, 470],
    ["Air Freshener 300ml", 550, "household", null, null, 610],
    ["Cooking Spoon Set (3pc)", 450, "household", null, null, 500],
    ["Plastic Bucket 12L", 550, "household", null, null, 610],
    ["Mop & Bucket Set", 1250, "household", null, null, 1390],
    ["Batteries AA (4-pack)", 480, "household", null, null, 540],
  ],
  bakery: [
    ["White Sandwich Bread", 200, "bakery", null, null, null],
    ["Brown Bread", 250, "bakery", null, null, 290],
    ["Milk Bread Loaf", 240, "bakery", null, null, null],
    ["Whole Wheat Bread", 280, "bakery", null, null, 320],
    ["Burger Buns (6pc)", 220, "bakery", null, null, null],
    ["Cupcakes (4pc)", 500, "cake", null, null, 580],
    ["Muffins (6pc)", 600, "cake", null, null, 680],
    ["Chocolate Brownie", 300, "cake", null, tier([[1, 300], [4, 1080], [8, 2000]]), 350],
    ["Chocolate Chip Cookies (12pc)", 650, "cake", null, null, 720],
    ["Butter Cookies (12pc)", 600, "cake", null, null, 670],
    ["Cake Rusk 500g", 450, "bakery", null, null, 500],
    ["Bread Rusk 500g", 380, "bakery", null, null, 420],
    ["Croissant", 350, "bakery", null, tier([[1, 350], [4, 1200]]), 400],
    ["Danish Pastry", 400, "bakery", null, null, 450],
    ["Fruit Cake Slice", 350, "cake", null, null, 400],
    ["Black Forest Slice", 400, "cake", null, null, 450],
    ["Red Velvet Slice", 450, "cake", null, null, 500],
    ["Chocolate Truffle Slice", 480, "cake", null, null, 540],
    ["Butter Croissant Pack (4pc)", 1300, "bakery", null, null, 1450],
    ["Plain Cake (1kg)", 1500, "cake", null, null, 1700],
    ["Chocolate Cake (1kg)", 1800, "cake", null, null, 2000],
    ["Pineapple Cake (1kg)", 1700, "cake", null, null, 1900],
    ["Strawberry Cake (1kg)", 1900, "cake", null, null, 2100],
    ["Custom Birthday Cake (1kg)", 2200, "cake", null, null, 2500],
    ["Custom Birthday Cake (2kg)", 3800, "cake", null, null, 4200],
    ["Custom Birthday Cake (3kg)", 5400, "cake", null, null, 6000],
    ["Wedding Cake Tier (2-tier)", 8500, "cake", null, null, 9500],
    ["Donut (assorted)", 250, "cake", null, tier([[1, 250], [6, 1320], [12, 2400]]), 290],
    ["Baklava Box (12pc)", 1600, "dessert", null, null, 1800],
    ["Kalakand 500g", 900, "dessert", null, null, 1000],
    ["Barfi Assorted 500g", 850, "dessert", null, null, 950],
    ["Gulab Jamun 500g", 750, "dessert", null, null, 840],
    ["Ras Malai (6pc)", 900, "dessert", null, null, 1000],
    ["Cream Roll", 200, "cake", null, tier([[1, 200], [6, 1080], [12, 1920]]), 240],
    ["Puff Pastry (chicken)", 250, "bakery", null, null, 290],
    ["Samosa (veg) 4pc", 200, "bakery", null, null, null],
    ["Mathura 500g", 400, "bakery", null, null, 450],
    ["Khara Naan 500g", 450, "bakery", null, null, 500],
    ["Sheermal 4pc", 500, "bakery", null, null, 560],
    ["Chai Cake 500g", 800, "cake", null, null, 900],
  ],
  desi: [
    ["Chicken Karahi", 1499, "desi", [halfFullGroup(1499), spiceGroup], null, 1799],
    ["Mutton Karahi", 2499, "desi", [halfFullGroup(2499), spiceGroup], null, 2899],
    ["White Karahi", 1599, "desi", [halfFullGroup(1599), spiceGroup], null, 1899],
    ["Chicken Handi", 1399, "desi", [halfFullGroup(1399), spiceGroup], null, 1650],
    ["Mutton Handi", 2399, "desi", [halfFullGroup(2399), spiceGroup], null, 2799],
    ["Beef Nihari", 1299, "desi", [halfFullGroup(1299), spiceGroup], null, 1499],
    ["Chicken Nihari", 999, "desi", [halfFullGroup(999), spiceGroup], null, 1199],
    ["Haleem", 899, "desi", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Paya (2pc)", 1099, "desi", [halfFullGroup(1099), spiceGroup], null, 1299],
    ["Chicken Biryani", 449, "desi", [sizeGroup(449, { s: -120, m: 0, l: 130, f: 320 }), spiceGroup], null, 529],
    ["Mutton Biryani", 699, "desi", [sizeGroup(699, { s: -160, m: 0, l: 190, f: 440 }), spiceGroup], null, 799],
    ["Sindhi Biryani", 499, "desi", [sizeGroup(499, { s: -130, m: 0, l: 140, f: 340 }), spiceGroup], null, 589],
    ["Chicken Pulao", 399, "desi", [sizeGroup(399, { s: -100, m: 0, l: 120, f: 280 })], null, 459],
    ["Mutton Pulao", 649, "desi", [sizeGroup(649, { s: -150, m: 0, l: 180, f: 420 })], null, 749],
    ["Daal Chawal", 349, "desi", [halfFullGroup(349)], null, 399],
    ["Chana Masala", 399, "desi", [halfFullGroup(399), spiceGroup], null, 459],
    ["Sarson ka Saag", 599, "desi", [halfFullGroup(599), spiceGroup], null, 699],
    ["Aloo Gosht", 799, "desi", [halfFullGroup(799), spiceGroup], null, 929],
    ["Chicken Qorma", 899, "desi", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Mutton Qorma", 1599, "desi", [halfFullGroup(1599), spiceGroup], null, 1849],
    ["Chicken Tikka (4pc)", 599, "bbq", [halfFullGroup(599), spiceGroup], null, 699],
    ["Malai Boti (8pc)", 749, "bbq", [halfFullGroup(749), spiceGroup], null, 869],
    ["Seekh Kebab (6pc)", 549, "bbq", [halfFullGroup(549), spiceGroup], null, 629],
    ["Shami Kebab (4pc)", 449, "bbq", [halfFullGroup(449), spiceGroup], null, 519],
    ["Tandoori Leg Piece (2pc)", 899, "bbq", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Chicken Wings (8pc)", 649, "bbq", [halfFullGroup(649), spiceGroup], null, 749],
    ["Tandoori Naan", 100, "naan", null, tier([[1, 100], [4, 360], [8, 640]]), null],
    ["Butter Naan", 120, "naan", null, tier([[1, 120], [4, 440], [8, 800]]), null],
    ["Roghni Naan", 150, "naan", null, tier([[1, 150], [4, 540], [8, 960]]), null],
    ["Garlic Naan", 140, "naan", null, tier([[1, 140], [4, 520], [8, 960]]), null],
    ["Raita", 199, "desi", null, null, 229],
    ["Mixed Salad", 249, "desi", null, null, null],
    ["Kachumber Salad", 199, "desi", null, null, null],
    ["Green Chutney", 99, "desi", null, null, null],
    ["Mango Lassi", 299, "drink", null, null, 349],
    ["Sweet Lassi", 249, "drink", null, null, 299],
    ["Kheer", 399, "dessert", null, null, 459],
    ["Gajar ka Halwa", 499, "dessert", null, null, 569],
    ["Shahi Tukray", 449, "dessert", null, null, 519],
    ["Zarda Rice", 399, "dessert", null, null, 459],
    ["Dera Feast (karahi + 4 naan + raita)", 2199, "desi", [spiceGroup], null, 2599],
    ["BBQ Family Box", 1899, "bbq", [spiceGroup], null, 2199],
  ],
  toys: [
    ["Remote Control Car", 2499, "toys", null, null, 2899],
    ["RC Monster Truck", 2999, "toys", null, null, 3499],
    ["RC Drone (mini)", 3499, "toys", null, null, 3999],
    ["Building Blocks (100pc)", 999, "toys", [colorGroup(["Red", "Blue", "Green"])], null, 1199],
    ["Building Blocks (250pc)", 1899, "toys", [colorGroup(["Red", "Blue", "Green"])], null, 2199],
    ["Lego-style City Set", 2999, "toys", null, null, 3499],
    ["Action Figure Super Hero", 1499, "toys", null, null, 1799],
    ["Action Figure 3-Pack", 2499, "toys", null, null, 2899],
    ["Barbie-style Doll", 1799, "toys", null, null, 2099],
    ["Baby Doll with Accessories", 1999, "toys", null, null, 2299],
    ["Soft Teddy Bear (30cm)", 1299, "toys", [colorGroup(["Brown", "White", "Pink"])], null, 1499],
    ["Soft Teddy Bear (50cm)", 1999, "toys", [colorGroup(["Brown", "White", "Pink"])], null, 2299],
    ["Plush Bunny", 999, "toys", null, null, 1199],
    ["Jigsaw Puzzle (100pc)", 799, "toys", null, null, 899],
    ["Jigsaw Puzzle (500pc)", 1499, "toys", null, null, 1699],
    ["Ludo & Snakes Board Game", 649, "toys", null, null, 749],
    ["Chess Set (Magnetic)", 1299, "toys", null, null, 1499],
    ["Monopoly-style Board Game", 2499, "toys", null, null, 2899],
    ["Toy Kitchen Set", 3499, "toys", null, null, 3999],
    ["Doctor Play Set", 1499, "toys", null, null, 1699],
    ["Tool Workshop Set", 1999, "toys", null, null, 2299],
    ["Musical Keyboard (kids)", 2499, "toys", null, null, 2899],
    ["Toy Drum Set", 1299, "toys", null, null, 1499],
    ["Scooter (kids)", 5999, "toys", null, null, 6999],
    ["Balance Bicycle (12 inch)", 4499, "toys", null, null, 4999],
    ["Kids Tricycle", 7999, "toys", null, null, 8999],
    ["Play Tent (kids)", 2999, "toys", [colorGroup(["Blue", "Pink"])], null, 3499],
    ["Ball Pit Ball (20pc)", 699, "toys", null, null, 799],
    ["Indoor Basketball Set", 1999, "toys", null, null, 2299],
    ["Toy Gun Set (water)", 799, "toys", null, null, 899],
    ["Nerf-style Blaster", 2999, "toys", null, null, 3499],
    ["Rubik's Cube", 599, "toys", null, null, 699],
    ["Slime Kit", 799, "toys", null, null, 899],
    ["Play-Doh-style 12-pack", 1299, "toys", null, null, 1499],
    ["Coloring Book Set (12pc)", 649, "toys", null, null, 749],
    ["Crayons 24-colour", 499, "toys", null, null, 549],
    ["Water Color Set", 599, "toys", null, null, 699],
    ["Toy Cash Register", 1799, "toys", null, null, 2099],
    ["Shape Sorter", 899, "toys", null, null, 999],
    ["Stacking Rings", 749, "toys", null, null, 849],
  ],
  clothes: [
    ["Classic Polo T-Shirt", 1499, "clothes", [clothesSizeGroup, colorGroup(["Black", "White", "Navy", "Maroon"])], null, 1799],
    ["Striped Cotton T-Shirt", 1299, "clothes", [clothesSizeGroup, colorGroup(["Grey", "Blue", "Green", "Burgundy"])], null, 1499],
    ["Graphic Print T-Shirt", 1699, "clothes", [clothesSizeGroup, colorGroup(["Black", "White", "Teal"])], null, 1999],
    ["Slim Fit Shirt", 2499, "clothes", [clothesSizeGroup, colorGroup(["White", "Sky Blue", "Navy", "Black", "Grey", "Maroon"])], null, 2899],
    ["Regular Fit Formal Shirt", 2299, "clothes", [clothesSizeGroup, colorGroup(["White", "Blue", "Grey", "Beige"])], null, 2699],
    ["Check Casual Shirt", 1999, "clothes", [clothesSizeGroup, colorGroup(["Red & Black", "Blue & White", "Green & Grey"])], null, 2399],
    ["Slim Jeans", 2999, "clothes", [clothesSizeGroup, colorGroup(["Blue", "Black", "Grey"])], null, 3499],
    ["Straight Jeans", 2799, "clothes", [clothesSizeGroup, colorGroup(["Blue", "Black", "Navy"])], null, 3299],
    ["Chino Pants", 2499, "clothes", [clothesSizeGroup, colorGroup(["Beige", "Navy", "Grey", "Olive"])], null, 2899],
    ["Cotton Kurta (simple)", 1799, "kurta", [clothesSizeGroup, colorGroup(["White", "Beige", "Light Blue"])], null, 2099],
    ["Embroidered Kurta", 2499, "kurta", [clothesSizeGroup, colorGroup(["White", "Off-White", "Light Blue"])], null, 2899],
    ["Kurta with Waistcoat Set", 3499, "kurta", [clothesSizeGroup, colorGroup(["White", "Navy", "Black"])], null, 3999],
    ["Shalwar Kameez (mens)", 3499, "kurta", [clothesSizeGroup, colorGroup(["White", "Blue", "Grey", "Black"])], null, 3999],
    ["Premium Cotton Suit (mens)", 4999, "kurta", [clothesSizeGroup, colorGroup(["White", "Navy", "Black"])], null, 5699],
    ["Kids Polo T-Shirt", 899, "clothes", [kidsSizeGroup, colorGroup(["Red", "Blue", "Green", "Yellow"])], null, 999],
    ["Kids Jeans", 1499, "clothes", [kidsSizeGroup, colorGroup(["Blue", "Black", "Grey"])], null, 1699],
    ["Kids Kurta Pajama", 1999, "kurta", [kidsSizeGroup, colorGroup(["White", "Blue", "Green"])], null, 2299],
    ["Kids Party Shirt", 1699, "clothes", [kidsSizeGroup, colorGroup(["White", "Light Blue", "Peach"])], null, 1899],
    ["Sneakers (unisex)", 3999, "shoes", [clothesSizeGroup, colorGroup(["White", "Black", "Grey"])], null, 4599],
    ["Running Shoes", 4999, "shoes", [clothesSizeGroup, colorGroup(["Black", "Blue", "Red"])], null, 5699],
    ["Casual Canvas Shoes", 2499, "shoes", [clothesSizeGroup, colorGroup(["White", "Black", "Navy"])], null, 2899],
    ["Formal Leather Shoes", 5999, "shoes", [clothesSizeGroup, colorGroup(["Black", "Brown"])], null, 6799],
    ["Cap (embroidered)", 899, "clothes", [colorGroup(["Black", "Navy", "Maroon"])], null, 999],
    ["Socks (3-pair pack)", 599, "clothes", [colorGroup(["Black", "White", "Grey"])], null, 699],
    ["Belt (leather)", 1299, "clothes", null, null, 1499],
  ],
};

// ── catalog expansion (compact generators → ~600 products total) ────────────

function expandCatalogs() {
  // ── Tandoori Express +45 ──────────────────────────────────────────────
  const tandooriExtra = [
    // More pizza flavours (size + spice)
    ["Chicken Supreme Pizza", 849, "pizza", [sizeGroup(849), spiceGroup], null, 999],
    ["Chicken Tikka BBQ Pizza", 779, "pizza", [sizeGroup(779), spiceGroup], null, 929],
    ["Chicken Fajita Supreme", 769, "pizza", [sizeGroup(769), spiceGroup], null, 919],
    ["Paneer Tikka Pizza", 719, "pizza", [sizeGroup(719)], null, 849],
    ["Mexican Hot Pizza", 749, "pizza", [sizeGroup(749), spiceGroup], null, 899],
    // More burgers
    ["Mushroom Swiss Burger", 529, "burger", singleDoubleGroup(529, 280), null, 619],
    ["Chicken BBQ Burger", 469, "burger", singleDoubleGroup(469, 250), null, 559],
    ["Falafel Wrap", 329, "burger", null, null, 379],
    ["Chicken Cheese Wrap", 399, "burger", null, null, 459],
    // More BBQ
    ["Chicken Chapli Kabab (2pc)", 449, "bbq", [halfFullGroup(449), spiceGroup], null, 519],
    ["Reshmi Kebab (6pc)", 699, "bbq", [halfFullGroup(699), spiceGroup], null, 819],
    ["Chicken Bihari Boti (6pc)", 799, "bbq", [halfFullGroup(799), spiceGroup], null, 929],
    ["Malai Boti Roll", 349, "bbq", [spiceGroup], null, 399],
    // More sides
    ["Chicken Popcorn (6pc)", 299, "fries", null, null, 349],
    ["Peri Peri Fries", 379, "fries", [singleDoubleGroup(379, 160)], null, 429],
    ["Chicken Strips (4pc)", 429, "fries", null, null, 489],
    ["Veg Spring Roll (2pc)", 249, "fries", null, null, 299],
    // Rice / naan
    ["Chicken Tikka Biryani", 499, "desi", [sizeGroup(499, { s: -130, m: 0, l: 140, f: 340 })], null, 589],
    ["Chicken Dum Biryani", 529, "desi", [sizeGroup(529, { s: -140, m: 0, l: 150, f: 350 })], null, 619],
    // Drinks
    ["Mint Margarita", 279, "drink", null, null, 329],
    ["Sweet Lassi", 259, "drink", null, null, 309],
    ["Fresh Orange Juice", 329, "drink", null, null, 379],
    ["Watermelon Juice", 299, "drink", null, null, 349],
    ["Iced Tea", 249, "drink", null, null, 299],
    // Desserts
    ["Chocolate Mousse", 379, "dessert", null, null, 429],
    ["Gulab Jamun (6pc)", 349, "dessert", null, null, 399],
    // Combos
    ["Student Combo (burger + fries + drink)", 649, "burger", null, null, 749],
    ["Pizza Party (3 medium pizzas)", 1999, "pizza", [spiceGroup], null, 2399],
    ["BBQ Bucket (tikka + boti + kebab)", 2199, "bbq", [spiceGroup], null, 2599],
    ["Desi Platter (biryani + karahi + naan)", 2499, "desi", [spiceGroup], null, 2899],
  ];
  CATALOGS.tandoori.push(...tandooriExtra);

  // ── Pizza Palace +55 ──────────────────────────────────────────────────
  const pizzaFlavours = [
    ["Chicken Tikka Pizza", 699, 849], ["Fajita Pizza", 729, 879], ["BBQ Chicken Pizza", 749, 899],
    ["Pepperoni Classic", 779, 929], ["Smoked Chicken Pizza", 799, 949], ["Cheese Lovers Pizza", 829, 979],
    ["Hawaiian Pizza", 699, 849], ["Veggie Supreme", 649, 779], ["Chicken Supreme", 849, 999],
    ["Peri Peri Pizza", 769, 919], ["Tandoori Beef Pizza", 849, 999], ["Chicken Ranch Pizza", 779, 929],
    ["Kebab Pizza", 879, 1029], ["Chicken Mushroom Pizza", 749, 899], ["Chicken Cheese Burst", 899, 1049],
    ["Margherita Classic", 549, 649], ["Chicken Tikka BBQ", 799, 949], ["Afghani Chicken Pizza", 799, 949],
    ["Mexican Hot Pizza", 749, 899], ["Paneer Pizza", 719, 849],
  ];
  for (const [name, price, orig] of pizzaFlavours) {
    CATALOGS.pizza.push([name, price, "pizza", [sizeGroup(price), spiceGroup], null, orig]);
  }
  const pastaExtra = [
    ["Chicken Alfredo Pasta", 699, "pizza", [singleDoubleGroup(699, 200), spiceGroup], null, 799],
    ["Arabiata Pasta", 649, "pizza", [singleDoubleGroup(649, 200), spiceGroup], null, 749],
    ["Creamy Mushroom Pasta", 679, "pizza", [singleDoubleGroup(679, 200), spiceGroup], null, 779],
    ["Baked Ziti", 749, "pizza", [singleDoubleGroup(749, 200), spiceGroup], null, 849],
  ];
  CATALOGS.pizza.push(...pastaExtra);
  const wingsExtra = [
    ["Plain Chicken Wings (6pc)", 549, "bbq", null, null, 629],
    ["Hot Wings (6pc)", 599, "bbq", [spiceGroup], null, 679],
    ["Lemon Pepper Wings (6pc)", 619, "bbq", null, null, 699],
  ];
  CATALOGS.pizza.push(...wingsExtra);
  const sideExtra = [
    ["Garlic Bread Classic", 329, "fries", null, null, 379],
    ["Cheese Garlic Bread", 399, "fries", null, null, 449],
    ["Cheesy Dip (with bread)", 199, "fries", null, null, 249],
    ["Caesar Salad", 599, "fries", null, null, 679],
    ["Garden Salad", 549, "fries", null, null, 629],
    ["Chicken Popcorn (8pc)", 449, "fries", null, null, 509],
  ];
  CATALOGS.pizza.push(...sideExtra);
  const dessertExtra = [
    ["Chocolate Lava Cake", 399, "dessert", null, null, 459],
    ["Strawberry Cheesecake", 549, "dessert", null, null, 629],
    ["Fudge Brownie", 349, "dessert", null, null, 399],
    ["Cinnamon Rolls (3pc)", 449, "dessert", null, null, 509],
  ];
  CATALOGS.pizza.push(...dessertExtra);
  const drinkExtra = [
    ["Pepsi 500ml", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["7up 500ml", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["Dew 500ml", 150, "drink", null, tier([[1, 150], [6, 780]]), null],
    ["Cold Coffee", 399, "drink", null, null, 449],
    ["Chocolate Shake", 449, "drink", null, null, 499],
    ["Strawberry Shake", 429, "drink", null, null, 479],
  ];
  CATALOGS.pizza.push(...drinkExtra);
  const comboExtra = [
    ["Family Feast (2 large + 2 sides + drink)", 2699, "pizza", [spiceGroup], null, 3199],
    ["Double Deal (2 medium pizzas)", 1399, "pizza", [spiceGroup], null, 1599],
    ["Pasta Lovers Combo (pasta + bread + drink)", 999, "pizza", [spiceGroup], null, 1149],
    ["Lunch Special (small pizza + drink)", 749, "pizza", [spiceGroup], null, 899],
  ];
  CATALOGS.pizza.push(...comboExtra);

  // ── Grocery +50 ───────────────────────────────────────────────────────
  const groceryExtra = [
    ["Rice Basmati 1kg", 280, "pantry", null, tier([[1, 280], [5, 1300], [10, 2500]]), null],
    ["Cooking Oil 3L", 1850, "pantry", null, null, 2050],
    ["Mustard Oil 1L", 850, "pantry", null, null, 950],
    ["Chickpeas 1kg", 350, "pantry", null, tier([[1, 350], [5, 1600]]), null],
    ["Kidney Beans 1kg", 420, "pantry", null, null, null],
    ["Pasta 1kg", 750, "pantry", null, null, 850],
    ["Instant Noodles 1pc", 150, "pantry", null, tier([[1, 150], [6, 780], [12, 1380]]), null],
    ["Ketchup 1kg", 550, "pantry", null, null, 610],
    ["Biscuits Marie 250g", 180, "snacks", null, null, null],
    ["Chocolate Bar", 250, "snacks", null, tier([[1, 250], [6, 1320], [12, 2400]]), null],
    ["Chewing Gum", 100, "snacks", null, tier([[1, 100], [10, 900]]), null],
    ["Toffees 500g", 350, "snacks", null, null, null],
    ["Popcorn 200g", 280, "snacks", null, null, null],
    ["Peanuts 500g", 380, "snacks", null, null, null],
    ["Dried Fruits Mix 500g", 850, "snacks", null, null, 950],
    ["Mineral Water 1.5L (case of 12)", 1600, "drink", null, null, 1800],
    ["Juice Punch 1L", 550, "drink", null, null, 610],
    ["Carbonated Drink 2.25L", 650, "drink", null, tier([[1, 650], [3, 1800]]), null],
    ["Energy Drink 250ml", 350, "drink", null, tier([[1, 350], [6, 1800]]), null],
    ["Yogurt Drink 250ml", 200, "dairy", null, tier([[1, 200], [6, 1080], [12, 1920]]), null],
    ["Cheese Slices 100g", 350, "dairy", null, null, null],
    ["Cream 200ml", 450, "dairy", null, null, null],
    ["Ice Cream 1L", 850, "dairy", null, null, 950],
    ["Butter 500g", 1050, "dairy", null, null, 1150],
    ["Shampoo 500ml", 1250, "household", null, null, 1390],
    ["Soap 150g (6-pack)", 650, "household", null, null, 720],
    ["Detergent 3kg", 1700, "household", null, null, 1900],
    ["Fabric Softener 1L", 750, "household", null, null, 830],
    ["Toothbrush (2-pack)", 350, "household", null, null, null],
    ["Toothpaste 200g", 650, "household", null, null, 720],
    ["Deodorant 150ml", 850, "household", null, null, 950],
    ["Face Wash 100g", 450, "household", null, null, 500],
    ["Handwash Refill 1L", 650, "household", null, null, 720],
    ["Aluminium Foil", 350, "household", null, null, null],
    ["Cling Film", 280, "household", null, null, null],
    ["Garbage Bags (30pc)", 350, "household", null, null, null],
    ["Matchbox (12pc)", 250, "household", null, null, null],
    ["Candles (6pc)", 300, "household", null, null, null],
    ["Tea Cups (set of 6)", 1200, "household", null, null, 1350],
    ["Water Jug 5L", 550, "household", null, null, 610],
  ];
  CATALOGS.grocery.push(...groceryExtra);

  // ── Bakery +50 ────────────────────────────────────────────────────────
  const bakeryExtra = [
    ["Whole Wheat Loaf", 280, "bakery", null, null, 320],
    ["Rye Bread", 350, "bakery", null, null, 400],
    ["Multigrain Bread", 320, "bakery", null, null, 370],
    ["Hot Dog Buns (6pc)", 250, "bakery", null, null, null],
    ["Baguette", 350, "bakery", null, null, 400],
    ["Focaccia", 450, "bakery", null, null, 500],
    ["Cheese Croissant", 450, "bakery", null, null, 500],
    ["Pain au Chocolat", 480, "bakery", null, null, 540],
    ["Cinnamon Roll", 400, "bakery", null, null, 450],
    ["Blueberry Muffin", 350, "cake", null, null, 400],
    ["Chocolate Muffin", 350, "cake", null, null, 400],
    ["Banana Bread (loaf)", 600, "bakery", null, null, 670],
    ["Zucchini Bread", 650, "bakery", null, null, 720],
    ["Apple Pie (whole)", 1500, "cake", null, null, 1700],
    ["Lemon Tart", 500, "cake", null, null, 560],
    ["Strawberry Tart", 550, "cake", null, null, 610],
    ["Eclair (chocolate)", 420, "cake", null, null, 470],
    ["Cannoli (3pc)", 650, "cake", null, null, 720],
    ["Macarons (6pc)", 900, "cake", null, null, 1000],
    ["Cupcakes (6pc)", 750, "cake", null, null, 850],
    ["Fruit Tart (family)", 1200, "cake", null, null, 1350],
    ["Chocolate Tart", 650, "cake", null, null, 720],
    ["Biscotti (12pc)", 550, "bakery", null, null, 610],
    ["Shortbread (12pc)", 600, "bakery", null, null, 670],
    ["Oatmeal Cookies (12pc)", 650, "cake", null, null, 720],
    ["Chocolate Chip Cookies (24pc)", 1200, "cake", null, null, 1350],
    ["Peanut Butter Cookies (12pc)", 700, "cake", null, null, 780],
    ["Rusk (sweet) 500g", 480, "bakery", null, null, 540],
    ["Rusk (plain) 500g", 420, "bakery", null, null, 470],
    ["Khakhra (packet)", 350, "bakery", null, null, null],
    ["Sheermal 6pc", 700, "bakery", null, null, 780],
    ["Rogha Naan 2pc", 300, "bakery", null, null, 350],
    ["Kalakand (1kg)", 1700, "dessert", null, null, 1900],
    ["Gulab Jamun (1kg)", 1400, "dessert", null, null, 1550],
    ["Jalebi 500g", 550, "dessert", null, null, 610],
    ["Ladoo (500g)", 650, "dessert", null, null, 720],
    ["Halwa (500g)", 600, "dessert", null, null, 670],
    ["Rasgulla (6pc)", 650, "dessert", null, null, 720],
    ["Soan Papdi (500g)", 550, "dessert", null, null, 610],
    ["Chicken Puff (4pc)", 900, "bakery", null, null, 1000],
    ["Beef Puff (4pc)", 950, "bakery", null, null, 1050],
    ["Veg Puff (4pc)", 800, "bakery", null, null, 900],
    ["Bread Pakora (4pc)", 500, "bakery", null, null, 560],
    ["Samosa (chicken) 4pc", 300, "bakery", null, null, 350],
    ["Mini Cakes (6pc)", 1100, "cake", null, null, 1250],
    ["Birthday Cupcake Set (12pc)", 1600, "cake", null, null, 1800],
  ];
  CATALOGS.bakery.push(...bakeryExtra);

  // ── Desi +45 ──────────────────────────────────────────────────────────
  const desiExtra = [
    ["Chicken Peshawari Karahi", 1699, "desi", [halfFullGroup(1699), spiceGroup], null, 1999],
    ["Mutton Peshawari Karahi", 2699, "desi", [halfFullGroup(2699), spiceGroup], null, 3099],
    ["Chicken Achari Handi", 1499, "desi", [halfFullGroup(1499), spiceGroup], null, 1750],
    ["Kadai Chicken", 1549, "desi", [halfFullGroup(1549), spiceGroup], null, 1799],
    ["Chicken Malai Handi", 1449, "desi", [halfFullGroup(1449), spiceGroup], null, 1699],
    ["Beef Karahi", 2199, "desi", [halfFullGroup(2199), spiceGroup], null, 2499],
    ["Chicken Jalfrezi", 999, "desi", [halfFullGroup(999), spiceGroup], null, 1149],
    ["Mutton Nihari", 1699, "desi", [halfFullGroup(1699), spiceGroup], null, 1949],
    ["Chicken Paya (4pc)", 1499, "desi", [halfFullGroup(1499), spiceGroup], null, 1749],
    ["Bheja Fry", 899, "desi", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Chicken Dhansak", 949, "desi", [halfFullGroup(949), spiceGroup], null, 1099],
    ["Daal Mash", 449, "desi", [halfFullGroup(449), spiceGroup], null, 519],
    ["Daal Chana", 399, "desi", [halfFullGroup(399), spiceGroup], null, 459],
    ["Palak Paneer", 749, "desi", [halfFullGroup(749), spiceGroup], null, 869],
    ["Mixed Veg Sabzi", 449, "desi", [halfFullGroup(449), spiceGroup], null, 519],
    ["Chicken Kofta", 899, "desi", [halfFullGroup(899), spiceGroup], null, 1049],
    ["Mutton Kofta", 1699, "desi", [halfFullGroup(1699), spiceGroup], null, 1949],
    ["Chicken Fried Rice", 549, "desi", [halfFullGroup(549), spiceGroup], null, 629],
    ["Chicken Chowmein", 499, "desi", [halfFullGroup(499), spiceGroup], null, 569],
    ["Tandoori Chicken (full)", 1299, "bbq", [spiceGroup], null, 1499],
    ["Chicken Boti (4pc)", 549, "bbq", [halfFullGroup(549), spiceGroup], null, 629],
    ["Beef Seekh Kebab (6pc)", 649, "bbq", [halfFullGroup(649), spiceGroup], null, 749],
    ["Gola Kabab (6pc)", 599, "bbq", [halfFullGroup(599), spiceGroup], null, 689],
    ["Chicken Tikka Roll", 349, "bbq", [spiceGroup], null, 399],
    ["Naan (plain)", 80, "naan", null, tier([[1, 80], [6, 420], [12, 720]]), null],
    ["Cheese Naan", 180, "naan", null, tier([[1, 180], [4, 660], [8, 1200]]), null],
    ["Kulcha", 120, "naan", null, tier([[1, 120], [4, 440]]), null],
    ["Roti (Tandoori)", 50, "naan", null, tier([[1, 50], [6, 260], [12, 480]]), null],
    ["Mango Shake", 349, "drink", null, null, 399],
    ["Banana Shake", 349, "drink", null, null, 399],
    ["Khatta Lassi", 249, "drink", null, null, 299],
    ["Chai (2 cups)", 300, "drink", null, null, 350],
    ["Halwa Poori (2pc)", 449, "dessert", null, null, 519],
    ["Chola Bhatura", 449, "dessert", null, null, 519],
    ["Dahi Bhalla", 399, "dessert", null, null, 459],
    ["Bombay Bun", 350, "dessert", null, null, 400],
  ];
  CATALOGS.desi.push(...desiExtra);

  // ── Toys +45 ──────────────────────────────────────────────────────────
  const toysExtra = [
    ["RC Bike", 2899, "toys", [colorGroup(["Red", "Blue", "Black"])], null, 3299],
    ["RC Helicopter", 3999, "toys", null, null, 4599],
    ["RC Boat", 2199, "toys", null, null, 2499],
    ["Race Car Track Set", 3499, "toys", null, null, 3999],
    ["Die-cast Car (3pc)", 1299, "toys", null, null, 1499],
    ["Puzzle Blocks (50pc)", 799, "toys", null, null, 899],
    ["Magnetic Tiles (50pc)", 2499, "toys", null, null, 2899],
    ["Construction Crane Set", 3999, "toys", null, null, 4599],
    ["Dinosaur Figure (large)", 1799, "toys", null, null, 2099],
    ["Dinosaur Set (6pc)", 2499, "toys", null, null, 2899],
    ["Farm Animals Set (12pc)", 1499, "toys", null, null, 1699],
    ["Wild Animals Set (12pc)", 1499, "toys", null, null, 1699],
    ["Baby Rattle Set (3pc)", 699, "toys", null, null, 799],
    ["Teether (silicone)", 599, "toys", null, null, 699],
    ["Activity Gym Mat", 3499, "toys", null, null, 3999],
    ["Baby Walkers", 4999, "toys", null, null, 5699],
    ["Rocking Horse", 3999, "toys", null, null, 4599],
    ["Push-and-Go Train", 1899, "toys", null, null, 2199],
    ["Play Kitchen Set", 4499, "toys", null, null, 4999],
    ["Dollhouse (2-storey)", 6499, "toys", null, null, 7299],
    ["Doll Stroller", 2499, "toys", null, null, 2899],
    ["Spiderman-style Figure", 1499, "toys", null, null, 1699],
    ["Batman-style Figure", 1499, "toys", null, null, 1699],
    ["Superhero Set (4pc)", 2999, "toys", null, null, 3399],
    ["Water Gun (2pc)", 899, "toys", null, null, 999],
    ["Sand Play Set (8pc)", 1499, "toys", null, null, 1699],
    ["Soccer Ball (size 4)", 2499, "toys", null, null, 2899],
    ["Basketball (size 5)", 2799, "toys", null, null, 3199],
    ["Cricket Bat (kids)", 1999, "toys", null, null, 2299],
    ["Badminton Set (kids)", 2499, "toys", null, null, 2899],
    ["Skateboard (kids)", 4499, "toys", null, null, 4999],
    ["Roller Skates (kids)", 3999, "toys", null, null, 4599],
    ["Hula Hoop", 899, "toys", null, null, 999],
    ["Kite (large)", 699, "toys", null, null, 799],
    ["Yo-Yo (pro)", 599, "toys", null, null, 699],
    ["Light-up Top", 499, "toys", null, null, 599],
    ["Bubble Machine", 1499, "toys", null, null, 1699],
    ["Magic Set (20 tricks)", 1999, "toys", null, null, 2299],
    ["Science Kit (8 experiments)", 3499, "toys", null, null, 3999],
    ["Telescope (kids)", 4499, "toys", null, null, 4999],
    ["Walkie Talkies (2pc)", 2999, "toys", null, null, 3399],
    ["Mini Keyboard Piano", 3499, "toys", null, null, 3999],
  ];
  CATALOGS.toys.push(...toysExtra);

  // ── Clothes +45 ───────────────────────────────────────────────────────
  const shirtDesigns = [
    ["Classic Oxford Shirt", 2599, ["White", "Blue", "Grey", "Black", "Navy", "Maroon"]],
    ["Linen Shirt", 2899, ["White", "Beige", "Sky", "Sand"]],
    ["Denim Shirt", 2999, ["Blue", "Black", "Grey"]],
    ["Flannel Shirt", 2799, ["Red Check", "Blue Check", "Green Check"]],
    ["Printed Casual Shirt", 2199, ["Multi-1", "Multi-2", "Multi-3"]],
    ["Formal Shirt (stretch)", 2699, ["White", "Blue", "Grey", "Black"]],
    ["Polo Shirt (pique)", 1799, ["Navy", "White", "Maroon", "Green", "Black", "Yellow"]],
    ["Turtleneck", 1999, ["Black", "Grey", "Navy"]],
    ["Henley Shirt", 1699, ["White", "Grey", "Olive"]],
    ["Cuban Collar Shirt", 1899, ["Floral-1", "Floral-2", "Solid"]],
  ];
  for (const [name, price, colors] of shirtDesigns) {
    CATALOGS.clothes.push([name, price, "clothes", [clothesSizeGroup, colorGroup(colors)], null, Math.round(price * 1.12)]);
  }
  const jeansExtra = [
    ["Slim Fit Jeans", 2999, "clothes", [clothesSizeGroup, colorGroup(["Blue", "Black", "Grey"])], null, 3399],
    ["Tapered Jeans", 3099, "clothes", [clothesSizeGroup, colorGroup(["Blue", "Black"])], null, 3499],
    ["Relaxed Fit Jeans", 2899, "clothes", [clothesSizeGroup, colorGroup(["Blue", "Navy"])], null, 3299],
    ["Chino Pants (slim)", 2499, "clothes", [clothesSizeGroup, colorGroup(["Beige", "Navy", "Grey", "Olive"])], null, 2899],
    ["Cargo Pants", 2799, "clothes", [clothesSizeGroup, colorGroup(["Olive", "Black", "Khaki"])], null, 3199],
  ];
  CATALOGS.clothes.push(...jeansExtra);
  const kurtaExtra = [
    ["Kurta (linen)", 2199, "kurta", [clothesSizeGroup, colorGroup(["White", "Beige", "Blue"])], null, 2499],
    ["Kurta (cotton)", 1899, "kurta", [clothesSizeGroup, colorGroup(["White", "Blue", "Grey"])], null, 2199],
    ["Kurta (embroidered premium)", 3299, "kurta", [clothesSizeGroup, colorGroup(["White", "Off-White"])], null, 3699],
    ["Shalwar Kameez (classic)", 3499, "kurta", [clothesSizeGroup, colorGroup(["White", "Blue", "Black"])], null, 3999],
    ["Shalwar Kameez (premium)", 4499, "kurta", [clothesSizeGroup, colorGroup(["White", "Navy"])], null, 4999],
    ["Waistcoat", 1999, "clothes", [clothesSizeGroup, colorGroup(["Black", "Navy", "Maroon"])], null, 2299],
    ["Sherwani (rental-wear style)", 7999, "kurta", [clothesSizeGroup, colorGroup(["Black", "Maroon", "Navy"])], null, 8999],
  ];
  CATALOGS.clothes.push(...kurtaExtra);
  const kidsExtra = [
    ["Kids T-Shirt (cotton)", 749, "clothes", [kidsSizeGroup, colorGroup(["Red", "Blue", "Green", "Yellow"])], null, 849],
    ["Kids Polo Shirt", 999, "clothes", [kidsSizeGroup, colorGroup(["Navy", "White", "Red"])], null, 1099],
    ["Kids Denim Jeans", 1499, "clothes", [kidsSizeGroup, colorGroup(["Blue", "Black"])], null, 1699],
    ["Kids Hoodie", 1899, "clothes", [kidsSizeGroup, colorGroup(["Grey", "Blue", "Red"])], null, 2199],
    ["Kids Kurta Pajama", 1999, "kurta", [kidsSizeGroup, colorGroup(["White", "Blue"])], null, 2299],
    ["Kids Party Shirt", 1699, "clothes", [kidsSizeGroup, colorGroup(["White", "Sky"])], null, 1899],
    ["Kids Shoes (velcro)", 1799, "shoes", [kidsSizeGroup, colorGroup(["Black", "Blue"])], null, 1999],
    ["Kids Sandals", 1299, "shoes", [kidsSizeGroup, colorGroup(["Brown", "Black"])], null, 1499],
    ["Kids Socks (5-pair)", 549, "clothes", [colorGroup(["Assorted"])], null, 649],
  ];
  CATALOGS.clothes.push(...kidsExtra);
  const menExtra = [
    ["Sneakers (low-top)", 3999, "shoes", [clothesSizeGroup, colorGroup(["White", "Black"])], null, 4599],
    ["Formal Shoes (lace)", 5999, "shoes", [clothesSizeGroup, colorGroup(["Black", "Brown"])], null, 6799],
    ["Slip-on Loafers", 4499, "shoes", [clothesSizeGroup, colorGroup(["Black", "Brown"])], null, 4999],
    ["Cap (cotton)", 899, "clothes", [colorGroup(["Black", "Navy", "Khaki"])], null, 999],
    ["Socks (6-pair pack)", 899, "clothes", [colorGroup(["Black", "White"])], null, 999],
    ["Underwear (3-pack)", 1299, "clothes", [clothesSizeGroup, colorGroup(["Black", "White", "Grey"])], null, 1499],
  ];
  CATALOGS.clothes.push(...menExtra);
}
function buildDeals() {
  const deals = [];
  const perShop = { tandoori: 8, pizza: 8, grocery: 8, bakery: 8, desi: 8, toys: 8, clothes: 8 };
  for (const shop of SHOPS) {
    const cat = CATALOGS[shop.key];
    const pick = perShop[shop.key] ?? 8;
    const step = Math.max(1, Math.floor(cat.length / pick));
    let idx = 0;
    for (let i = 0; i < pick; i++) {
      idx = Math.min(idx, cat.length - 1);
      const row = cat[idx];
      const name = row[0];
      const price = row[1];
      const imgId = IMG[row[2]][i % IMG[row[2]].length];
      const original = row[5] && row[5] > price ? row[5] : Math.round(price * 1.15);
      const pctOff = Math.round((1 - price / original) * 100);
      deals.push({
        shop: shop.key,
        title: `${name} — ${pctOff}% OFF`,
        description: `${name} at Rs ${price} (was Rs ${original}). Order now on WhatsApp.`,
        productName: name,
        price,
        original_price: original,
        badge_text: `${pctOff}% OFF`,
        imgId,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        is_featured: i % 3 === 0,
      });
      idx += step;
    }
  }
  return deals;
}

// ── image verification ───────────────────────────────────────────────────────
async function verifyImages() {
  const all = new Set();
  for (const list of Object.values(IMG)) for (const id of list) all.add(id);
  const urls = [...all];
  const ok = new Set();
  const bad = new Map();
  const CONCURRENCY = 3;
  let cursor = 0;
  const UA =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function check(id) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 15000);
        const res = await fetch(imgUrl(id, 40), { signal: ctrl.signal, headers: { "user-agent": UA } });
        clearTimeout(t);
        if (res.ok) return true;
        bad.set(id, res.status);
      } catch (e) {
        bad.set(id, e.name === "AbortError" ? "timeout" : "network");
      }
      await sleep(600 * attempt);
    }
    return false;
  }
  async function worker() {
    while (cursor < urls.length) {
      const id = urls[cursor++];
      if (await check(id)) ok.add(id);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  const fallbacks = new Map();
  let usablePools = {};
  for (const [cat, list] of Object.entries(IMG)) {
    const good = list.filter((id) => ok.has(id));
    usablePools[cat] = good.length ? good : [...ok].slice(0, 5);
    if (good.length !== list.length) fallbacks.set(cat, `${list.length}→${good.length}`);
  }
  console.log(`\n[images] verified ${ok.size}/${urls.length} OK`);
  for (const [cat, note] of fallbacks) console.log(`  - ${cat}: replaced ${note} (using verified pool)`);
  for (const [id, status] of [...bad].slice(0, 20)) console.log(`  - broken: photo-${id} → ${status}`);
  IMG_FINAL = usablePools;
  return ok.size;
}

let IMG_FINAL = {};

// ── SQL generation ───────────────────────────────────────────────────────────
function jsonArr(a) {
  return JSON.stringify(a);
}

function buildSql() {
  const L = [];
  L.push("-- ============================================================================");
  L.push("-- TrendMart — DEMO SEED DATA (generated — do not edit by hand)");
  L.push("--   • 7 demo shops   • ~600 products   • ~56 weekly deals   • 7 merchants + 3 customers");
  L.push("-- Safe to re-run (deterministic UUIDs; shops/products/deals UPSERT in place).");
  L.push("-- Self-contained: creates every account it needs (no clean-slate required).");
  L.push("-- ============================================================================");
  L.push("");
  L.push("BEGIN;");
  L.push("");

  // 1) All test accounts required by the seed (merchant1-7 + customer1-3)
  const ACCOUNTS = [
    { id: MERCHANTS.m1, email: "merchant1@trendmart.pk", name: "Ali Hassan", phone: "0301-5551001", role: "merchant" },
    { id: MERCHANTS.m2, email: "merchant2@trendmart.pk", name: "Fatima Noor", phone: "0301-5551002", role: "merchant" },
    { id: MERCHANTS.m3, email: "merchant3@trendmart.pk", name: "Usman Tariq", phone: "0301-5551003", role: "merchant" },
    { id: MERCHANTS.m4, email: "merchant4@trendmart.pk", name: "Zainab Iqbal", phone: "0301-5551004", role: "merchant" },
    { id: MERCHANTS.m5, email: "merchant5@trendmart.pk", name: "Hamza Sheikh", phone: "0301-5551005", role: "merchant" },
    { id: MERCHANTS.m6, email: "merchant6@trendmart.pk", name: "Ayesha Khan", phone: "0301-5551006", role: "merchant" },
    { id: MERCHANTS.m7, email: "merchant7@trendmart.pk", name: "Omar Farooq", phone: "0301-5551007", role: "merchant" },
    { id: "c0000000-0000-4000-8000-000000000001", email: "customer1@trendmart.pk", name: "Ahmed Raza", phone: "0300-1234001", role: "customer" },
    { id: "c0000000-0000-4000-8000-000000000002", email: "customer2@trendmart.pk", name: "Sana Malik", phone: "0300-1234002", role: "customer" },
    { id: "c0000000-0000-4000-8000-000000000003", email: "customer3@trendmart.pk", name: "Bilal Khan", phone: "0300-1234003", role: "customer" },
  ];
  L.push("-- ── 1) Test accounts required by this seed (merchant1-7 + customer1-3) ──");
  L.push("--    Self-contained: runs without the clean-slate file. All password: Trend@123");
  L.push("INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)");
  L.push("VALUES");
  ACCOUNTS.forEach((a, i) => {
    const comma = i === ACCOUNTS.length - 1 ? "" : ",";
    L.push(`  ('00000000-0000-0000-0000-000000000000', '${a.id}', 'authenticated', 'authenticated', '${a.email}', crypt('Trend@123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"${a.name}"}', now(), now())${comma}`);
  });
  L.push("ON CONFLICT DO NOTHING;");
  L.push("");
  L.push("INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)");
  L.push("VALUES");
  ACCOUNTS.forEach((a, i) => {
    const comma = i === ACCOUNTS.length - 1 ? "" : ",";
    L.push(`  ('${a.id}', '${a.id}', '{"sub":"${a.id}","email":"${a.email}","email_verified":true,"phone_verified":false}', 'email', '${a.id}', now(), now(), now())${comma}`);
  });
  L.push("ON CONFLICT DO NOTHING;");
  L.push("");
  L.push("INSERT INTO public.user_profiles (user_id, full_name, phone, created_at, updated_at) VALUES");
  ACCOUNTS.forEach((a, i) => {
    const comma = i === ACCOUNTS.length - 1 ? "" : ",";
    L.push(`  ('${a.id}', '${a.name}', '${a.phone}', now(), now())${comma}`);
  });
  L.push("ON CONFLICT DO NOTHING;");
  L.push("");
  L.push("INSERT INTO public.user_roles (user_id, role, created_at, updated_at) VALUES");
  ACCOUNTS.forEach((a, i) => {
    const comma = i === ACCOUNTS.length - 1 ? "" : ",";
    L.push(`  ('${a.id}', '${a.role}', now(), now())${comma}`);
  });
  L.push("ON CONFLICT DO NOTHING;");
  L.push("");

  // 2) Shops
  L.push("-- ── 2) Demo shops ──────────────────────────────────────────────────────");
  L.push("INSERT INTO public.shops (id, owner_id, name, slug, category, location, address_display, whatsapp_number, logo_url, banner_url, is_live, verification_status, latitude, longitude, service_radius_km, delivery_zones, min_order_amount, free_delivery_threshold, delivery_fee_flat, delivery_fee_per_km, store_bio, announcement, business_hours, operating_status, accent_color) VALUES");
  SHOPS.forEach((s, i) => {
    const slug = "demo-" + s.key;
    // City marker FIRST so the app's geo filter never hides the shop when a
    // customer's city is set (plain area names alone don't match the city).
    const zones = ["__pk_city__:Gujranwala", ...s.zones]
      .map((z) => `'${esc(z)}'`)
      .join(", ");
    const comma = i === SHOPS.length - 1 ? "" : ",";
    const logo = resolvedShopImgs[s.key]?.logo ?? imgUrl(IMG_FINAL[imgCatOf(s.logo)]?.[0] ?? IMG_FINAL.generic[0], 400);
    const banner = resolvedShopImgs[s.key]?.banner ?? imgUrl(IMG_FINAL[bannerCatOf(s)]?.[0] ?? IMG_FINAL.generic[0], 1200);
    L.push(
      `  ('${s.id}', '${s.owner}', '${esc(s.name)}', '${slug}', '${esc(s.category)}', '${esc(s.location)}', '${esc(s.address_display)}', '${s.whatsapp}', '${logo}', '${banner}', true, 'approved', ${s.lat}, ${s.lng}, ${s.radius}, ARRAY[${zones}]::text[], ${s.min_order}, ${s.free_delivery}, ${s.fee_flat}, ${s.fee_per_km}, '${esc(s.bio)}', '${esc(s.announcement)}', '${esc(s.hours)}', '${esc(s.op_status)}', '${s.accent}')${comma}`
    );
  });
  L.push("ON CONFLICT (id) DO UPDATE SET logo_url = EXCLUDED.logo_url, banner_url = EXCLUDED.banner_url, delivery_zones = EXCLUDED.delivery_zones, is_live = EXCLUDED.is_live, verification_status = EXCLUDED.verification_status;");
  L.push("");
  L.push("UPDATE public.shops SET slug = 'demo-' || id WHERE slug IS NULL;");
  L.push("");
  L.push("-- Re-assign any orphan demo shops to their demo owner (safe re-run).");
  L.push("UPDATE public.shops s SET owner_id = m.owner_id FROM (VALUES");
  L.push("  ('a0000000-0000-4000-8000-000000000001'::uuid, 'd0000000-0000-4000-8000-000000000001'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000002'::uuid, 'd0000000-0000-4000-8000-000000000002'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000003'::uuid, 'd0000000-0000-4000-8000-000000000003'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000004'::uuid, 'd0000000-0000-4000-8000-000000000004'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000005'::uuid, 'd0000000-0000-4000-8000-000000000005'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000006'::uuid, 'e0000000-0000-4000-8000-000000000006'::uuid),");
  L.push("  ('a0000000-0000-4000-8000-000000000007'::uuid, 'e0000000-0000-4000-8000-000000000007'::uuid)");
  L.push(") AS m(id, owner_id) WHERE s.id = m.id AND s.owner_id IS NULL;");
  L.push("");

  // 3) Products
  L.push("-- ── 3) Products (with variants, pack tiers, discounts) ────────────────");
  let prodCount = 0;
  let variantCount = 0;
  let fallbackCount = 0;
  for (const shop of SHOPS) {
    const cat = CATALOGS[shop.key];
    const seen = new Set();
    const rows = cat.filter((row) => {
      const name = row[0];
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    });
    L.push(`-- ${shop.name} (${rows.length} products)`);
    L.push("INSERT INTO public.products (id, shop_id, name, description, price, original_price, currency, image_url, images, is_available, stock_status, variants, price_tiers) VALUES");
    rows.forEach((row, i) => {
      const [name, price, pool, variantsRaw, tiers, original, stock] = row;
      const variants = Array.isArray(variantsRaw) ? variantsRaw : variantsRaw ? [variantsRaw] : null;
      const pid = uuid5(`prod:${shop.key}:${name}`);
      const resolved = resolvedImgs.get(pid);
      const img = resolved ?? imgUrl(IMG_FINAL[pool]?.[i % IMG_FINAL[pool].length] ?? IMG_FINAL.generic[0], 800);
      if (!resolved) fallbackCount++;
      const desc = `${name} from ${shop.name} — order on WhatsApp for fast delivery.`;
      const stockStatus = stock ?? (i % 17 === 0 ? "low_stock" : "in_stock");
      const variantsJson = variants ? `'${jsonArr(variants)}'::jsonb` : "NULL";
      const tiersJson = tiers ? `'${jsonArr(tiers)}'::jsonb` : "NULL";
      const orig = original && original > price ? original : "NULL";
      const comma = i === rows.length - 1 ? "" : ",";
      L.push(
        `  ('${pid}', '${shop.id}', '${esc(name)}', '${esc(desc)}', ${price}, ${orig}, 'PKR', '${img}', '["${img}"]'::jsonb, true, '${stockStatus}', ${variantsJson}, ${tiersJson})${comma}`
      );
      prodCount++;
      if (variants) variantCount += variants.reduce((n, g) => n + g.options.length, 0);
    });
    L.push("ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, original_price = EXCLUDED.original_price, image_url = EXCLUDED.image_url, images = EXCLUDED.images, variants = EXCLUDED.variants, price_tiers = EXCLUDED.price_tiers, stock_status = EXCLUDED.stock_status;");
    L.push("");
  }

  // 4) Deals
  const deals = buildDeals();
  L.push("-- ── 4) Weekly deals (linked to products) ────────────────────────────────");
  L.push("INSERT INTO public.shop_deals (id, shop_id, title, description, schedule_type, weekdays, is_active, image_url, badge_text, is_featured, product_id, price, original_price) VALUES");
  deals.forEach((d, i) => {
    const shop = SHOPS.find((s) => s.key === d.shop);
    const pid = uuid5(`prod:${d.shop}:${d.productName}`);
    const did = uuid5(`deal:${d.shop}:${i}`);
    const comma = i === deals.length - 1 ? "" : ",";
    const dealImg = resolvedImgs.get(pid) ?? imgUrl(IMG_FINAL[imgCatOf(d.imgId)]?.[0] ?? IMG_FINAL.generic[0], 800);
    L.push(
      `  ('${did}', '${shop.id}', '${esc(d.title)}', '${esc(d.description)}', 'weekly', '{${d.weekdays.join(",")}}'::smallint[], true, '${dealImg}', '${esc(d.badge_text)}', ${d.is_featured}, '${pid}', ${d.price}, ${d.original_price})${comma}`
    );
  });
  L.push("ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price, original_price = EXCLUDED.original_price, image_url = EXCLUDED.image_url, badge_text = EXCLUDED.badge_text;");
  L.push("");

  L.push("COMMIT;");
  L.push("");
  L.push("-- ============================================================================");
  L.push(`-- SUMMARY: ${prodCount} products, ${variantCount} variant options, ${deals.length} deals`);
  L.push("-- ============================================================================");

  return { sql: L.join("\n"), prodCount, variantCount, dealCount: deals.length, fallbackCount };
}

// helpers used above (kept tiny to avoid closure ordering issues)
function imgCatOf(id) {
  if (!id) return "generic";
  for (const [cat, list] of Object.entries(IMG)) if (list.includes(id)) return cat;
  return "generic";
}
function bannerCatOf(s) {
  if (s.key === "tandoori" || s.key === "pizza") return "pizza";
  if (s.key === "desi") return "desi";
  if (s.key === "grocery") return "grocery";
  if (s.key === "bakery") return "bakery";
  if (s.key === "toys") return "toys";
  return "clothes";
}

// ── resolved image lookup (filled by main()) ────────────────────────────────
const resolvedImgs = new Map();      // product uuid → url
const resolvedShopImgs = {};          // shop key → {logo, banner}

/** Resolve a keyword-matched image for every shop logo/banner + product. */
async function resolveAllImages() {
  const tasks = [];
  for (const s of SHOPS) {
    tasks.push({ kind: "shop", key: s.key, field: "logo", query: `${s.category} shop storefront` });
    tasks.push({ kind: "shop", key: s.key, field: "banner", query: `${s.name} ${s.category}` });
  }
  for (const shop of SHOPS) {
    const seen = new Set(); // dedupe within one shop only (names repeat across shops)
    for (const row of CATALOGS[shop.key]) {
      const name = row[0];
      if (seen.has(name)) continue;
      seen.add(name);
      const pool = row[2];
      tasks.push({
        kind: "product",
        pid: uuid5(`prod:${shop.key}:${name}`),
        query: searchQueryFor(name, pool),
        fallbackQuery: POOL_KEYWORDS[pool] || searchQueryFor(name, pool),
      });
    }
  }
  let cursor = 0;
  let done = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const t = tasks[cursor++];
      let url = await openverseImage(t.query);
      // Second chance: search by just the category keyword so naan/kurta etc.
      // still get a relevant food/clothing photo instead of a generic one.
      if (!url && t.fallbackQuery && t.fallbackQuery !== t.query) {
        url = await openverseImage(t.fallbackQuery);
      }
      if (url) {
        if (t.kind === "product") resolvedImgs.set(t.pid, url);
        else {
          resolvedShopImgs[t.key] = resolvedShopImgs[t.key] || {};
          resolvedShopImgs[t.key][t.field] = url;
        }
      } else {
        if (t.kind === "product") resolvedImgs.set(t.pid, null);
      }
      done++;
      if (done % 50 === 0) console.log(`  resolved ${done}/${tasks.length}`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  saveOvCache();
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const fresh = process.argv.includes("--fresh");
  console.log("TrendMart demo seed generator" + (fresh ? "  [--fresh: re-searching all images]" : ""));
  expandCatalogs();
  loadOvCache();
  if (fresh) {
    ovCache = {};
    saveOvCache();
    console.log("  cleared Openverse image cache");
  }
  console.log("Verifying fallback images…");
  await verifyImages();
  console.log("Resolving + verifying name-matched images via Openverse…");
  await resolveAllImages();
  const { sql, prodCount, variantCount, dealCount, fallbackCount } = buildSql();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sql, "utf8");
  console.log(`\n✅ Wrote ${OUT}`);
  console.log(`   ${prodCount} products · ${variantCount} variant options · ${dealCount} deals`);
  console.log(`   name-matched (verified) product images: ${resolvedImgs.size}`);
  console.log(`   products on category-pool fallback images: ${fallbackCount}`);
  console.log("\nNext: open Supabase → SQL Editor → paste demo-seed-data.sql → Run.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
