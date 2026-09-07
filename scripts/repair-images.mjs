/* eslint-disable */
// =============================================================================
// TrendsMart — IMAGE REPAIR v2 (Unsplash-only, verified)
// -----------------------------------------------------------------------------
// Replaces every blocked-host image URL (loremflickr / staticflickr — both
// Flickr-backed and blocked in Pakistan) with images.unsplash.com photo URLs
// from the curated pools already proven in this repo (seed-full-test-data.mjs
// POOLS + generate-demo-seed.mjs IMG). Every candidate photo id is live-verified
// (HEAD/GET image check) before it is written.
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { readFileSync as read } from "node:fs";
import { createContext, runInContext } from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CACHE = join(__dirname, ".verified-unsplash.json");

if (existsSync(join(ROOT, ".env.local"))) {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !SR) { console.error("Missing env"); process.exit(1); }
const supabase = createClient(URL_BASE, SR, { auth: { autoRefreshToken: false, persistSession: false } });

/* ── extract IMG / POOLS object literals from the two seed files ──────────── */
function extractObject(file, varName) {
  const src = read(file, "utf8");
  const start = src.indexOf(`const ${varName} = {`);
  if (start < 0) return {};
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) break; }
  }
  const block = src.slice(src.indexOf("{", start), i + 1);
  const sandbox = {};
  runInContext(`globalThis.__out = (${block});`, createContext(sandbox));
  return sandbox.__out || {};
}

const POOLS = extractObject("scripts/seed-full-test-data.mjs", "POOLS");
const IMG = extractObject("scripts/generate-demo-seed.mjs", "IMG");

/* Map each store category to the union of pool keys that fit it. */
const CAT_POOLS = {
  "Fast Food & Restaurants": ["food", "pizza", "burger", "bbq", "desi", "fries", "drink", "dessert", "naan"],
  "Grocery & Kiryana": ["grocery", "pantry", "dairy", "snacks", "drink", "household"],
  "Fruits & Vegetables": ["veg", "fruits", "grocery"],
  "Bakery & Sweets": ["bakery", "cake", "dessert"],
  "Pharmacy & Medical": ["pharmacy", "generic"],
  "Fashion & Apparel": ["clothes", "kurta", "shoes", "fashion"],
  "Electronics & Gadgets": ["electronics", "generic"],
  "Home & Living": ["home", "household"],
  "Health & Beauty": ["beauty", "generic"],
  "Books & Stationery": ["books", "generic"],
  "Sports & Fitness": ["sports", "generic"],
  "Toys & Baby Care": ["toys", "generic"],
  "Automotive Accessories": ["auto", "generic"],
  "Handmade & Crafts": ["craft", "generic"],
  "Others / Universal": ["generic", "snacks"],
};

/* gather unique photo ids per category */
const idPool = {};      // category -> [ids]
const seenGlobal = new Set();
for (const [cat, keys] of Object.entries(CAT_POOLS)) {
  const ids = [];
  const seen = new Set();
  for (const k of keys) {
    for (const id of POOLS[k] || []) if (!seen.has(id)) { seen.add(id); ids.push(id); }
    for (const id of IMG[k] || []) if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  idPool[cat] = ids.filter((x) => !seenGlobal.has(x));
  for (const id of idPool[cat]) seenGlobal.add(id);
}
const allIds = [...seenGlobal];
console.log("candidate unsplash ids per category:", Object.fromEntries(Object.entries(idPool).map(([k, v]) => [k, v.length])));
console.log("total unique candidate ids:", allIds.length);

const US = (id, w = 800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function imgOk(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": UA } });
    clearTimeout(t);
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    return res.ok && /^image\//.test(ct);
  } catch { clearTimeout(t); return false; }
}

/* verify each candidate once; cache result */
async function verifiedSet() {
  if (existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, "utf8"));
    if (c.good?.length > 30) { console.log("using cached verified ids:", c.good.length); return new Set(c.good); }
  }
  const good = [];
  const bad = [];
  const CHUNK = 8;
  for (let i = 0; i < allIds.length; i += CHUNK) {
    const batch = allIds.slice(i, i + CHUNK);
    const results = await Promise.all(batch.map(async (id) => ({ id, ok: await imgOk(US(id, 60)) })));
    for (const r of results) (r.ok ? good : bad).push(r.id);
    if ((i / CHUNK) % 8 === 0) console.log(`  verified ${good.length}/${allIds.length}…`);
  }
  writeFileSync(CACHE, JSON.stringify({ good, bad }), "utf8");
  console.log(`verified ok: ${good.length}, bad: ${bad.length}`);
  return new Set(good);
}

function pick(ids, good, seed, offset) {
  const usable = (ids || []).filter((x) => good.has(x));
  if (usable.length === 0) return null;
  const n = (Math.abs(seed) + offset * 5) % usable.length;
  return usable[n];
}

/* Bulk-update individual rows (never touch columns we didn't fetch). */
async function patchByUpdate(table, rows, idKey = "id") {
  if (rows.length === 0) return 0;
  let done = 0;
  const CONC = 10;
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const { [idKey]: pk, ...set } = row;
      const { error } = await supabase.from(table).update(set).eq(idKey, pk);
      if (!error) done++;
      else if (done === 0 || /does not exist/i.test(error.message)) {
        console.error(`  ${table} update err (first):`, error.message.slice(0, 140));
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  return done;
}

/* All verified ids across every category — used as a universal fallback. */
function universalGood(good) {
  return Object.values(idPool).flat().filter((x) => good.has(x));
}

const BLOCKED_HOSTS = ["loremflickr.com", "staticflickr.com", "flickr.com"];
const isBlocked = (u) => { if (!u) return false; try { return BLOCKED_HOSTS.some((h) => new URL(u).host === h || new URL(u).host.endsWith(h)); } catch { return false; } };

async function main() {
  console.log("IMAGE REPAIR v2 (Unsplash)");
  const good = await verifiedSet();
  const uniGood = universalGood(good);

  const catById = new Map();
  const { data: shops } = await supabase.from("shops").select("id,category");
  for (const s of shops || []) catById.set(s.id, s.category);
  const catOf = (id) => catById.get(id) || "Others / Universal";

  const hashSeed = (id) => { let h = 0; for (const c of (id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  /* category pool with universal fallback so no category is ever empty */
  const usableFor = (cat) => {
    const list = (idPool[cat] || []).filter((x) => good.has(x));
    return list.length > 0 ? list : uniGood;
  };

  /* products */
  console.log("\n[1/4] products…");
  const prodPatch = [];
  for (let off = 0; off < 3000; off += 1000) {
    const { data: rows, error } = await supabase.from("products").select("id,shop_id,image_url,images").range(off, off + 999);
    if (error || !rows?.length) break;
    for (const p of rows) {
      const cat = catOf(p.shop_id);
      const seed = hashSeed(p.id);
      const oldCount = Math.max(1, Math.min(3, Array.isArray(p.images) ? p.images.length : 1));
      const oldUrl = p.image_url || (Array.isArray(p.images) && p.images[0]) || "";
      if (!isBlocked(oldUrl) && !(p.images || []).some((u) => isBlocked(u))) continue;
      const usable = usableFor(cat);
      const gallery = [];
      const start = seed % Math.max(1, usable.length);
      for (let i = 0; i < oldCount && usable.length; i++) {
        const id = usable[(start + i * 3) % usable.length];
        if (!gallery.includes(id)) gallery.push(id);
      }
      // pad if duplicates collapsed
      let fill = 0;
      while (gallery.length < oldCount && fill < usable.length) {
        if (!gallery.includes(usable[fill])) gallery.push(usable[fill]);
        fill++;
      }
      if (gallery.length === 0) continue;
      const urls = gallery.map((id) => US(id));
      prodPatch.push({ id: p.id, image_url: urls[0], images: urls });
    }
  }
  const prodDone = await patchByUpdate("products", prodPatch);
  console.log(`  products: ${prodDone} rows`);

  /* deals — reuse linked product cover when patched, else pick fresh */
  console.log("\n[2/4] shop_deals…");
  const coverByProd = new Map(prodPatch.map((p) => [p.id, p.image_url]));
  const dealPatch = [];
  for (let off = 0; off < 1000; off += 500) {
    const { data: rows, error } = await supabase.from("shop_deals").select("id,shop_id,product_id,image_url,images").range(off, off + 499);
    if (error || !rows?.length) break;
    for (const d of rows) {
      const oldUrl = d.image_url || "";
      if (!isBlocked(oldUrl) && !(d.images || []).some((u) => isBlocked(u))) continue;
      let cover = d.product_id && coverByProd.get(d.product_id);
      if (!cover) {
        const cat = catOf(d.shop_id);
        const id = pick(usableFor(cat), good, hashSeed(d.id), 1);
        if (!id) continue;
        cover = US(id);
      }
      const cat = catOf(d.shop_id);
      const usable = usableFor(cat);
      const images = Array.isArray(d.images) && d.images.length > 1
        ? [cover, ...(d.images.map((u, i) => (isBlocked(u) ? US(usable[(hashSeed(d.id) + 3 + i * 7) % usable.length]) : u))).slice(0, 2)]
        : null;
      dealPatch.push({ id: d.id, image_url: cover, images });
    }
  }
  const dealDone = await patchByUpdate("shop_deals", dealPatch);
  console.log(`  shop_deals: ${dealDone} rows`);

  /* stories */
  console.log("\n[3/4] stories…");
  const storyPatch = [];
  for (let off = 0; off < 1000; off += 500) {
    const { data: rows, error } = await supabase.from("stories").select("id,shop_id,image_url").range(off, off + 499);
    if (error || !rows?.length) break;
    for (const st of rows) {
      if (!isBlocked(st.image_url)) continue;
      const cat = catOf(st.shop_id);
      const id = pick(usableFor(cat), good, hashSeed(st.id), 5);
      if (!id) continue;
      storyPatch.push({ id: st.id, image_url: US(id, 640) });
    }
  }
  const storyDone = await patchByUpdate("stories", storyPatch);
  console.log(`  stories: ${storyDone} rows`);

  /* ads + shops logo/banner */
  console.log("\n[4/4] ads + shop logos/banners…");
  const adPatch = [];
  const { data: adRows } = await supabase.from("promotional_ads").select("id,shop_id,image_url");
  for (const ad of adRows || []) {
    if (!isBlocked(ad.image_url)) continue;
    const cat = catOf(ad.shop_id);
    const id = pick(usableFor(cat), good, hashSeed(ad.id), 7);
    if (!id) continue;
    adPatch.push({ id: ad.id, image_url: US(id, 1200) });
  }
  const adDone = await patchByUpdate("promotional_ads", adPatch);
  console.log(`  ads: ${adDone} rows`);

  const shopPatch = [];
  const { data: shopRows2 } = await supabase.from("shops").select("id,category,logo_url,banner_url");
  for (const s of shopRows2 || []) {
    const cat = s.category || "Others / Universal";
    const row = { id: s.id };
    const seed = hashSeed(s.id);
    if (isBlocked(s.logo_url)) { const id = pick(usableFor(cat), good, seed, 9); if (id) row.logo_url = US(id, 400); }
    if (isBlocked(s.banner_url)) { const id = pick(usableFor(cat), good, seed, 11); if (id) row.banner_url = US(id, 1200); }
    if (row.logo_url || row.banner_url) shopPatch.push(row);
  }
  const shopDone = await patchByUpdate("shops", shopPatch);
  console.log(`  shops: ${shopDone} rows`);

  console.log("\n✅ IMAGE REPAIR DONE");
}

main().catch((e) => { console.error(e); process.exit(1); });
