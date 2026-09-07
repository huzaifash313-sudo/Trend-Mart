/* eslint-disable */
// =============================================================================
// TrendsMart — ENGAGEMENT SEED (stories · reviews · all-placement ads)
// -----------------------------------------------------------------------------
// Enriches the marketplace after the FULL TEST SEED so every surface looks
// alive and fully testable:
//
//   • STORIES  — ~40 of 50 shops post stories with captions:
//                 first 20 shops × 4 stories · next 10 × 2 · next 10 × 1
//                 (=110 stories, staggered created_at, live 24-30h)
//   • REVIEWS  — real-looking guest reviews so ratings & counts stack:
//                 every shop gets 6-13 shop reviews; ~half the products get
//                 1-3 product reviews. DB triggers auto-refresh product + shop
//                 avg_rating/review_count (verified in 20260903130000).
//   • ADS      — sponsored banners on EVERY placement the app supports:
//                 homepage_top / homepage_feed / products_top / deals_top /
//                 store_top. Inserted through a dedicated ADMIN TEST ACCOUNT
//                 (admin@trendmart.pk / Trend@123) so the review-guard keeps
//                 them 'approved' and publicly visible.
//
// Idempotent + additive (deterministic ids, upserts). Safe to re-run.
//
// Run:  node scripts/seed-engagement.mjs
// =============================================================================

import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

if (existsSync(join(ROOT, ".env.local"))) {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SR) { console.error("Missing env"); process.exit(1); }

const ADMIN_EMAIL = "admin@trendmart.pk";
const PASSWORD = "Trend@123";

const supabase = createClient(URL, SR, { auth: { autoRefreshToken: false, persistSession: false } });

/* helpers */
function uuid5(seed) {
  const h = createHash("md5").update(String(seed)).digest();
  h[6] = (h[6] & 0x0f) | 0x30;
  h[8] = (h[8] & 0x3f) | 0x80;
  const s = h.toString("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const esc = (s) => String(s ?? "").replace(/'/g, "''");
const LF = (kw, lock, w = 800) => `https://loremflickr.com/${w}/${w}/${kw}?lock=${lock}`;
const addDays = (base, n) => new Date(base.getTime() + n * 86400000).toISOString();
const hoursAgo = (base, h) => new Date(base.getTime() - h * 3600000).toISOString();

const CAT_KW = {
  "Fast Food & Restaurants": "food,restaurant", "Grocery & Kiryana": "grocery,supermarket",
  "Fruits & Vegetables": "vegetable,fruit", "Bakery & Sweets": "bakery,cake",
  "Pharmacy & Medical": "pharmacy,medicine", "Fashion & Apparel": "clothing,fashion",
  "Electronics & Gadgets": "electronics,gadget", "Home & Living": "home,decor",
  "Health & Beauty": "cosmetics,beauty", "Books & Stationery": "books,stationery",
  "Sports & Fitness": "sports,fitness", "Toys & Baby Care": "toys,children",
  "Automotive Accessories": "car,accessories", "Handmade & Crafts": "handmade,craft",
  "Others / Universal": "products,store",
};

const STORY_CAPTIONS = [
  "Fresh stock just arrived — come grab yours today!",
  "This week only: special discount on bestsellers",
  "New collection live! Order on WhatsApp",
  "Back in stock — most-loved items are here again",
  "Weekend offer: free delivery on orders above limit",
  "Taste the difference — made fresh every morning",
  "Customer favourites are flying off the shelf",
  "Bundle & save — combos that make sense",
  "Eid-ready picks have landed in store",
  "Deal of the day: limited quantity available",
  "Handpicked for you by our store team",
  "Fast local delivery — order before 6 PM for same-day",
  "Quality checked, freshly packed, ready to ship",
  "Our top seller is back — grab it while stock lasts",
  "Mid-season sale is officially live!",
  "Rainy day offer: hot specials all week",
  "New arrivals — exactly what you asked for",
  "Stock update: all sizes and colours available now",
  "Don't miss the midnight flash sale tonight",
  "Refer a friend and both of you save Rs 200",
];
const STORY_TAGS = ["offer", "sale", "new", "fresh", "combo", "stock"];

const REVIEWERS = [
  "Ahmed Raza", "Sana Malik", "Bilal Khan", "Mahnoor Ali", "Hamza Yousaf",
  "Areeba Fatima", "Usman Cheema", "Zoya Shah", "Imran Baig", "Hira Aslam",
  "Talha Javed", "Nimra Tariq", "Fahad Qureshi", "Laiba Sheikh", "Omar Malik",
  "Khadija Noor", "Saad Iqbal", "Rabia Sultana", "Danish Ali", "Mariam Hassan",
  "Shahzaib Akram", "Amna Riaz", "Babar Aziz", "Iqra Nadeem",
];
const SHOP_COMMENTS = [
  "Great store, clean and well organised. Loved the variety!",
  "Everything I ordered arrived fresh and on time.",
  "Fair prices and the staff is very polite.",
  "My go-to shop for weekly essentials now.",
  "Quick WhatsApp response and easy ordering.",
  "Quality is consistent — ordered three times already.",
  "Delivery was fast and the packaging was neat.",
  "Best prices in the area, highly recommended.",
  "They even called to confirm my order. Great service.",
  "Slight delay once but the product was worth it.",
  "Value for money — will definitely order again.",
  "Store has everything you need under one roof.",
];
const PRODUCT_COMMENTS = [
  "Exactly as described — great quality for the price.",
  "Packaging was solid and the item works perfectly.",
  "Looks even better in person. Happy with the buy.",
  "Good value. Would recommend to a friend.",
  "Solid product, matches the photos 100%.",
  "Fast delivery and quality exceeded my expectations.",
  "Nice finish and accurate size/colour.",
  "Ordered two — both arrived perfect.",
  "Better than the local market price.",
  "Works as advertised. Five stars from me.",
  "Decent quality for this price point.",
  "My second order of this item — consistent quality.",
  "Slightly smaller than expected but still great.",
  "Really impressed with the freshness.",
  "Good purchase overall, seller was responsive.",
];

/* ── 1) ensure admin test account ─────────────────────────────────────────── */
async function ensureAdminAccount() {
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = (list?.users || []).find((u) => u.email === ADMIN_EMAIL);
  let userId;
  if (existing) {
    userId = existing.id;
    console.log("  admin account exists");
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "TrendsMart Admin (Test)" },
      app_metadata: { role: "admin" },
    });
    if (error && !/already registered/i.test(error.message)) {
      console.error("  admin createUser error:", error.message);
      return null;
    }
    userId = data?.user?.id || null;
    if (userId) console.log("  admin account created");
  }
  if (!userId) return null;
  // user_roles has a UNIQUE(user_id) — a signup trigger may already have
  // created a row for this user, so upsert ON user_id (never insert a 2nd row).
  const { error: rErr } = await supabase.from("user_roles").upsert(
    { user_id: userId, role: "admin" },
    { onConflict: "user_id" },
  );
  if (rErr) console.error("  admin role upsert error:", rErr.message.slice(0, 120));
  // Keep app_metadata in sync (some is_admin() paths read app_metadata.role).
  const { error: mErr } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role: "admin" },
  });
  if (mErr) console.error("  admin app_metadata error:", mErr.message.slice(0, 120));
  const { error: pErr } = await supabase.from("user_profiles").upsert(
    { user_id: userId, full_name: "TrendsMart Admin (Test)", phone: "0300-0000000" },
    { onConflict: "user_id" },
  );
  if (pErr) console.error("  admin profile upsert error:", pErr.message.slice(0, 120));
  return userId;
}

/* ── 2) stories ───────────────────────────────────────────────────────────── */
async function seedStories(shops) {
  const chosen = shops.slice(0, 40); // ~40 shops post stories
  const rows = [];
  const now = new Date();
  chosen.forEach((shop, idx) => {
    let count;
    if (idx < 20) count = 4;      // 20 shops × 4
    else if (idx < 30) count = 2; // 10 shops × 2
    else count = 1;               // 10 shops × 1
    const kw = (CAT_KW[shop.category] || "store").split(",")[0];
    for (let k = 0; k < count; k++) {
      const lock = ((idx + 1) * 97 + k * 53) % 80000 + 1;
      const caption = STORY_CAPTIONS[(idx * 3 + k) % STORY_CAPTIONS.length];
      rows.push({
        id: uuid5(`eng-story:${shop.id}:${k}`),
        shop_id: shop.id,
        image_url: LF(`${kw},${STORY_TAGS[(idx + k) % STORY_TAGS.length]}`, lock, 640),
        caption,
        created_at: hoursAgo(now, k * 5 + (idx % 14)),   // staggered: recent to hours-old
        expires_at: addDays(now, 1),
        view_count: 4 + ((idx * 7 + k * 11) % 140),       // small believable view counts
      });
    }
  });
  const CH = 40;
  let ok = 0, errMsg = "";
  for (let i = 0; i < rows.length; i += CH) {
    const { error } = await supabase.from("stories").upsert(rows.slice(i, i + CH), { onConflict: "id" });
    if (error) { errMsg = error.message.slice(0, 140); break; }
    ok += Math.min(CH, rows.length - i);
  }
  if (errMsg) {
    console.log(`  stories: BLOCKED after ${ok} — ${errMsg}`);
    console.log("  → run supabase/POST_SEED_FIXES.sql in the SQL editor first, then re-run this script.");
  } else {
    console.log(`  stories: ${rows.length} rows`);
  }
  return !errMsg;
}

/* ── 3) reviews ───────────────────────────────────────────────────────────── */
async function seedReviews(shops) {
  const now = new Date();
  const rows = [];
  let shopRev = 0, prodRev = 0;

  for (let si = 0; si < shops.length; si++) {
    const shop = shops[si];
    // shop-level reviews 6..13
    const shopCount = 6 + ((si * 5) % 8);
    for (let r = 0; r < shopCount; r++) {
      const revIdx = si * 13 + r;
      const rating = (revIdx % 10) < 2 ? 3 : (revIdx % 10) < 6 ? 4 : 5;
      rows.push({
        id: uuid5(`eng-srev:${shop.id}:${r}`),
        shop_id: shop.id,
        customer_name: REVIEWERS[revIdx % REVIEWERS.length],
        rating,
        comment: SHOP_COMMENTS[revIdx % SHOP_COMMENTS.length],
        verified_purchase: (revIdx % 4) !== 0,
        created_at: addDays(now, -((revIdx * 7) % 75)),
      });
      shopRev++;
    }
    // product reviews on ~half this shop's products
    const { data: prods, error } = await supabase
      .from("products").select("id").eq("shop_id", shop.id).limit(80);
    if (error || !prods) continue;
    const picked = prods.filter((_, pi) => (pi + si) % 2 === 0); // ~half
    for (let pi = 0; pi < picked.length; pi++) {
      const prod = picked[pi];
      const nReviews = 1 + ((si + pi) % 4 === 0 ? 1 : 0) + ((si * 3 + pi) % 7 === 0 ? 1 : 0); // 1..3
      for (let k = 0; k < nReviews; k++) {
        const revIdx = si * 101 + pi * 5 + k;
        const rating = (revIdx % 10) < 1 ? 3 : (revIdx % 10) < 5 ? 4 : 5;
        rows.push({
          id: uuid5(`eng-prev:${prod.id}:${k}`),
          shop_id: shop.id,
          product_id: prod.id,
          customer_name: REVIEWERS[(revIdx + k) % REVIEWERS.length],
          rating,
          comment: PRODUCT_COMMENTS[revIdx % PRODUCT_COMMENTS.length],
          verified_purchase: (revIdx % 5) !== 1,
          created_at: addDays(now, -((revIdx * 11) % 70)),
        });
        prodRev++;
      }
    }
  }

  const CH = 80;
  let ok = 0, errMsg = "";
  for (let i = 0; i < rows.length; i += CH) {
    const { error } = await supabase.from("reviews").upsert(rows.slice(i, i + CH), { onConflict: "id" });
    if (error) { errMsg = error.message.slice(0, 140); break; }
    ok += Math.min(CH, rows.length - i);
  }
  if (errMsg) console.log(`  reviews: BLOCKED after ${ok} — ${errMsg}`);
  else console.log(`  reviews: ${rows.length} rows  (shop:${shopRev} product:${prodRev})`);
  return !errMsg;
}

/* ── 4) ads (all placements, as admin) ────────────────────────────────────── */
function buildAdRows(shops) {
  const rows = [];
  let sort = { homepage_top: 3, homepage_feed: 3, products_top: 0, deals_top: 0, store_top: 0 };
  const homeShops = [shops[0], shops[2], shops[5]];
  const feedShops = [shops[1], shops[3], shops[6]];
  const prodShops = [shops[7], shops[8], shops[9], shops[10], shops[11], shops[12]];
  const dealShops = [shops[13], shops[14], shops[15], shops[16], shops[17], shops[18]];
  const storeAdsShops = shops.slice(19, 31); // 12 different store pages

  const mk = (shop, placement, title, subtitle, link, badge) => {
    const kw = (CAT_KW[shop.category] || "store").split(",")[0];
    const lock = 3000 + sort[placement] * 37 + rows.length;
    rows.push({
      id: uuid5(`eng-ad:${placement}:${sort[placement]}`),
      shop_id: shop.id,
      title,
      subtitle,
      image_url: LF(`${kw},${placement === "store_top" ? "storefront" : "banner,offer"}`, lock, 1200),
      link_url: link,
      badge_label: badge,
      placement,
      status: "approved",
      is_active: true,
      starts_at: new Date().toISOString(),
      ends_at: addDays(new Date(), 30),
      sort_order: sort[placement],
      reviewed_at: new Date().toISOString(),
    });
    sort[placement]++;
  };

  homeShops.forEach((s, i) => mk(s, "homepage_top", `Big Sale at ${s.name}`, `Up to 25% off this week — order on WhatsApp.`, `/shop/${s.id}`, "Sponsored"));
  feedShops.forEach((s, i) => mk(s, "homepage_feed", `${s.name} — Fresh Deals`, `Hand-picked offers from a top local store.`, `/shop/${s.id}`, "Featured"));
  prodShops.forEach((s, i) => mk(s, "products_top", `${s.name} bestsellers`, `Popular items customers keep re-ordering.`, `/shop/${s.id}`, "Sponsored"));
  dealShops.forEach((s, i) => mk(s, "deals_top", `Deal spotlight: ${s.name}`, `Biggest discount of the week — limited time.`, `/shop/${s.id}`, "Hot Deal"));
  storeAdsShops.forEach((s, i) => mk(s, "store_top", `${s.name} store offer`, `Free delivery & special prices for nearby orders.`, `/shop/${s.id}`, "Store Pick"));
  return rows;
}

async function seedAds(shops) {
  // sign in as the admin test account so the guard keeps rows approved
  const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email: ADMIN_EMAIL, password: PASSWORD });
  if (error || !data.session) {
    console.log("  ads: admin sign-in failed —", error?.message.slice(0, 100));
    console.log("  ads: SKIPPED. Run supabase/POST_SEED_FIXES2.sql (approve) after inserting via service role.");
    return;
  }
  const client = anon;
  const rows = buildAdRows(shops);
  const CH = 5;
  let ok = 0;
  const blocked = new Set();
  for (let i = 0; i < rows.length; i += CH) {
    const { error: e } = await client.from("promotional_ads").upsert(rows.slice(i, i + CH), { onConflict: "id" });
    if (e) {
      // capture which placements failed (e.g. check constraint)
      blocked.add(e.message.slice(0, 160));
      // fall back: try one-by-one so a single bad placement doesn't drop all
      for (const row of rows.slice(i, i + CH)) {
        const r = await client.from("promotional_ads").upsert([row], { onConflict: "id" });
        if (!r.error) ok++;
      }
    } else {
      ok += Math.min(CH, rows.length - i);
    }
  }
  console.log(`  ads: ${ok}/${rows.length} approved rows`);
  if (blocked.size) {
    console.log("  ads notes:");
    for (const b of blocked) console.log("    •", b);
    console.log("  → if a placement CHECK failed, run supabase/POST_SEED_FIXES2.sql (widens placement constraint).");
  }
}

/* ── main ─────────────────────────────────────────────────────────────────── */
async function main() {
  console.log("TrendsMart ENGAGEMENT SEED");
  const { data: shops, error } = await supabase
    .from("shops").select("id,name,category").eq("is_live", true).order("name").limit(60);
  if (error) { console.error("fetch shops:", error.message); process.exit(1); }
  console.log(`live shops: ${shops.length}`);

  console.log("\n[1/4] admin test account…");
  await ensureAdminAccount();

  console.log("\n[2/4] stories…");
  await seedStories(shops);

  console.log("\n[3/4] reviews (ratings stack)…");
  await seedReviews(shops);

  console.log("\n[4/4] ads on every placement…");
  await seedAds(shops);

  console.log("\n✅ ENGAGEMENT SEED DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
