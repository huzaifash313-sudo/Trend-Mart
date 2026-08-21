#!/usr/bin/env node
/* --------------------------------------------------------------------------
 * TrendMart — Full Marketplace Seed Script
 * 50 shops · 1000 products · 150 deals — all with real Unsplash image links
 *
 * Run:
 *   set SUPABASE_URL=<project-url> && set SUPABASE_SERVICE_ROLE_KEY=<key>
 *   node scripts/seed-marketplace.mjs
 *
 * Idempotent: skips shops whose names already exist.
 * ------------------------------------------------------------------------ */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
);

const PKR_LOCATIONS = [
  "DHA Phase 5, Lahore", "Gulberg, Lahore", "Johar Town, Lahore", "Model Town, Lahore",
  "Bahadurabad, Karachi", "Clifton, Karachi", "Gulshan-e-Iqbal, Karachi", "Saddar, Karachi",
  "F-8, Islamabad", "G-9, Islamabad", "Blue Area, Islamabad", "Satellite Town, Rawalpindi",
  "Saddar, Peshawar", "Cantt, Quetta", "Gulistan-e-Jauhar, Karachi", "Wapda Town, Lahore",
  "Shah Faisal Colony, Karachi", "University Road, Peshawar", "Jinnah Super, Islamabad",
  "Commercial Market, Rawalpindi",
];

const PKR_COORDS = [
  [31.5204, 74.3587], [31.5204, 74.3587], [31.5204, 74.3587], [31.5204, 74.3587],
  [24.8607, 67.0011], [24.8607, 67.0011], [24.8607, 67.0011], [24.8607, 67.0011],
  [33.6844, 73.0479], [33.6844, 73.0479], [33.6844, 73.0479], [33.5651, 73.0169],
  [34.0151, 71.5249], [30.1798, 66.9750], [24.8607, 67.0011], [31.5204, 74.3587],
  [24.8607, 67.0011], [34.0151, 71.5249], [33.6844, 73.0479], [33.5651, 73.0169],
];

const WHATSAPP = [
  "923001234567","923012345678","923113456789","923124567890","923135678901","923146789012",
  "923157890123","923168901234","923179012345","923180123456","923191234567","923202345678",
  "923213456789","923224567890","923235678901","923246789012","923257890123","923268901234",
  "923279012345","923280123456","923291234567","923302345678","923313456789","923324567890",
  "923335678901","923346789012","923357890123","923368901234","923379012345","923380123456",
  "923391234567","923402345678","923413456789","923424567890","923435678901","923446789012",
  "923457890123","923468901234","923479012345","923480123456","923491234567","923502345678",
  "923513456789","923524567890","923535678901","923546789012","923557890123","923568901234",
  "923579012345","923580123456",
];

const SHOP_TEMPLATES = [
  ["Grocery & Kiryana", ["Ayesha Kiryana Mart","Al-Noor General Store","FreshPoint Supermart","Madina Grocers","Shahzad Bazar Store"]],
  ["Bakery & Sweets", ["Sweet Spice Bakery","Lahore Cheez Oven","Mithas Bakers","Royal Sweets House","Pastry Palace"]],
  ["Fast Food & Restaurants", ["Karachi Kebab House","Desi Dastarkhwan","BunKebab Express","Roll & Grill Point","Chicken Cottage (Local)"]],
  ["Pharmacy & Medical", ["Al-Shifa Pharmacy","CarePlus Medical Store","Sehat Pharmacy","MediPoint Drug House","LifeLine Pharmacy"]],
  ["Fashion & Apparel", ["Trendy Threads","Karachi Chic","Eastern Elegance","Urban Stitches","Nimra Fashion House"]],
  ["Electronics & Gadgets", ["TechZone Pakistan","Mobile Mart Lahore","Gadget Galaxy","Digital Deals Hub","ElectroWorld"]],
  ["Health & Beauty", ["Glow & Grace Beauty","Natural Skincare Co.","Beauty Bay Boutique","Luxury Looks Salon","Herbal Essentials"]],
  ["Books & Stationery", ["Knowledge Corner","The Reading Room","Campus Stationers","Ilm Book Bank","Creative Paper Co."]],
  ["Home & Living", ["HomeDecor Studio","Comfort Living","Modern Nest","Crafted Home Goods","Urban Decor"]],
  ["Sports & Fitness", ["FitLife Sports","ProGym Equipment","Active Zone","Cricket & More","Wellness Gym Store"]],
];

const UNS = "https://images.unsplash.com/";
const IMG = {
  "Grocery & Kiryana": ["photo-1542838132-92c53300491e","photo-1583258292688-d0213dc5a3a8","photo-1600596542815-ffad4c1539a9","photo-1542838132-92c53300491e","photo-1506617564039-2f3b650b7010","photo-1488459716781-31db52582fe9","photo-1550989460-0adf9ea622e2","photo-1534723452862-4c874018d66d"],
  "Bakery & Sweets": ["photo-1509440159596-0249088772ff","photo-1608198093002-ad4e005484ec","photo-1517433670267-08bbd4be890f","photo-1555507036-ab1f4038808a","photo-1509365465985-25d11c17e812","photo-1533134242443-d4fd215305ad"],
  "Fast Food & Restaurants": ["photo-1568901346375-23c9450c58cd","photo-1551782450-a2132b4ba21d","photo-1547573854-74d2a71d0826","photo-1555939594-58d7cb561ad1","photo-1565299624946-b28f40a0ae38","photo-1550547660-d9450f859349"],
  "Pharmacy & Medical": ["photo-1585435557343-3b092031a831","photo-1576091160399-112ba8d25d1d","photo-1587854692152-cbe660dbde88","photo-1584982751601-97dcc096659c","photo-1584308666744-24d5c474f2ae","photo-1607619056574-7b8d3ee536b2"],
  "Fashion & Apparel": ["photo-1441986300917-64674bd600d8","photo-1483985988355-763728e1935b","photo-1509631179647-0177331693ae","photo-1567401893414-76b7b1e5a7a5","photo-1525507119028-ed4c629a60a3","photo-1490481651871-ab68de25d43d","photo-1529139574466-a303027c1d8b","photo-1515886657613-9f3515b0c78f"],
  "Electronics & Gadgets": ["photo-1505740420928-5e560c06d30e","photo-1542291026-7eec264c27ff","photo-1511707171634-5f897ff02aa9","photo-1496181133206-80ce9b88a853","photo-1588872657578-7efd1f1555ed","photo-1526170375885-4d8ecf77b99f","photo-1593642632823-8f785ba67e45","photo-1523275335684-37898b6baf30"],
  "Health & Beauty": ["photo-1585386959984-a4155224a1ad","photo-1522337660859-02fbefca4702","photo-1512496015851-a90fb38ba796","photo-1522337360788-8b13dee7a37e","photo-1596462502278-27bfdc403348","photo-1571781926291-c477ebfd024b"],
  "Books & Stationery": ["photo-1544947950-fa07a98d237f","photo-1512820790803-83ca734da794","photo-1507842217343-583bb7270b66","photo-1513475382585-d06e58bcb0e0","photo-1497633762265-9d179a990aa6","photo-1491841573634-28140fc7ced7"],
  "Home & Living": ["photo-1586023492125-27b2c045efd7","photo-1524758631624-e2822e304c36","photo-1518780664697-55e3ad937233","photo-1556911220-bff31c812dba","photo-1567016432779-094069958ea5","photo-1538688525198-9b88f6f53126"],
  "Sports & Fitness": ["photo-1517963879433-6ad2b056d712","photo-1544367567-0f2fcb009e0b","photo-1534438327276-14e5300c3a48","photo-1558030082-02cb8896db51","photo-1547949003-9792a18a2601","photo-1517836357463-d25dfeac3438"],
};

const PRODUCT_NAMES = {
  "Grocery & Kiryana": ["Basmati Rice 5kg","Daal Chana 1kg","Atta 10kg","Cooking Oil 5L","Sugar 1kg","Tea Leaves 250g","Salt 1kg","Black Pepper 100g","Milk Powder 1kg","Instant Noodles (Pack)","Ketchup 500ml","Pickle Mango 500g","Desi Ghee 1kg","Chilli Powder 250g","Turmeric Powder 250g","Cumin Seeds 100g","Toothpaste 150g","Shampoo 400ml","Washing Powder 1kg","Soap Bar (Pack of 4)"],
  "Bakery & Sweets": ["Chocolate Cake (1kg)","Butter Croissant","Baguette","Pineapple Pastry","Gulab Jamun (Dozen)","Rasmalai (Pack)","Cookies Assorted 500g","Cupcakes (6)","Brownie Box","Apple Pie","Bread Sourdough Loaf","Cinnamon Rolls (4)","Cupcake Chocolate","Cake Pop Box","Doughnuts (12)","Macarons (Box)","Cheesecake Slice","Tiramisu Cup","Eclair","Chocolate Truffle"],
  "Fast Food & Restaurants": ["Chicken Burger","Zinger Burger","Beef Burger","Chicken Shawarma","Beef Roll","Chicken Tikka Roll","Fries Large","Chicken Wings (6)","Club Sandwich","Chicken Biryani","Seekh Kebab (8)","Chicken Karahi","BBQ Platter","Fish & Chips","Grilled Chicken Sandwich","Peri Peri Fries","Cheese Fries","Coke 1.5L","Lassi (500ml)","Chai (Regular)"],
  "Pharmacy & Medical": ["Paracetamol 500mg","Vitamin C Tablets","Cough Syrup","Antiseptic Spray","Hand Sanitizer 500ml","Dettol 250ml","Band-Aid Pack","First Aid Kit","Digital Thermometer","BP Monitor","Insulin Syringe Pack","Multivitamin Jar","Omega-3 Capsules","Cold & Flu Pack","Antihistamine 10mg","ORS Sachets (10)","Cotton Roll","Surgical Mask (50)","Glucose Powder","Burn Cream"],
  "Fashion & Apparel": ["Mens Kurta (White)","Womens Kameez","Casual Shirt","Formal Trousers","Denim Jeans","Kurti (Printed)","Abaya","Unstitched Suit 3pc","Ladies Shawl","Kids Frock","Mens Sherwani","Dupatta Chiffon","Polo T-Shirt","Hoodie","Sneakers","Peshawari Chappal","Suit Waistcoat","Tie & Handkerchief Set","Handbag","Leather Belt"],
  "Electronics & Gadgets": ["Wireless Earbuds","Bluetooth Speaker","Smart Watch","Power Bank 20000mAh","USB-C Charger 65W","HDMI Cable 2m","Wireless Mouse","Mechanical Keyboard","Webcam HD","Smartphone (Budget)","Phone Case","Screen Protector","LED Strip Lights","Smart Bulb","Extension Board","Earphones","Mini Projector","External HDD 1TB","Portable Fan","Car Phone Holder"],
  "Health & Beauty": ["Face Wash 150ml","Moisturizer 50ml","Sunscreen SPF 50","Lip Balm","Perfume 100ml","Body Lotion","Hair Oil 200ml","Shampoo Anti-Dandruff","Face Mask (6)","Serum Vitamin C","Nail Polish","BB Cream","Men Beard Oil","Shaving Kit","Bath Set (Gift)","Henna Cone","Face Scrub","Toner 200ml","Eye Cream","Hand Cream"],
  "Books & Stationery": ["Bestseller Novel","Islamic Studies Book","Children Storybook","Urdu Poetry Collection","Engineering Guide","Notebook A4 (Pack)","Ballpoint Pens (10)","Geometry Box","Watercolor Set","Highlighter Set","Sketchbook","Sticky Notes (Pack)","Exam Pad","Diary 2026","School Bag","Crayons (24)","Ruler Set","Paper Folder","Name Stickers","Glue Stick"],
  "Home & Living": ["Cushion Cover Set","Decorative Vase","Table Lamp","Wall Clock","Area Rug 5x7","Curtain Pair","Bedding Set Queen","Kitchen Towel Set","Cookware Set","Ceramic Dinner Set","Storage Boxes (3)","Artificial Plant","Photo Frame Set","Candle Set","Jute Planter","Bath Mat","Table Runner","Mug Set (4)","Cutting Board","Laundry Basket"],
  "Sports & Fitness": ["Yoga Mat","Dumbbells 5kg Pair","Kettlebell 8kg","Resistance Bands","Jump Rope","Foam Roller","Running Shoes","Sports Bottle 1L","Gym Gloves","Skipping Rope","Fitness Tracker","Proteina Bar (Box)","Badminton Racket","Cricket Bat","Football","Basketball","Tennis Racket","Ankle Weights","Adjustable Bench","Treadmill (Home)"],
};

function uns(cat, i) {
  const ids = IMG[cat] ?? IMG["Electronics & Gadgets"];
  const id = ids[i % ids.length];
  return `${UNS}${id}?auto=format&fit=crop&w=800&q=60`;
}
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const shops = [];
let shopIndex = 0;
for (const [category, names] of SHOP_TEMPLATES) {
  for (const name of names) {
    const [lat, lng] = PKR_COORDS[shopIndex % PKR_COORDS.length];
    const area = PKR_LOCATIONS[shopIndex % PKR_LOCATIONS.length];
    shops.push({
      name,
      category,
      location: area,
      whatsapp_number: WHATSAPP[shopIndex % WHATSAPP.length],
      logo_url: `${UNS}${IMG[category][shopIndex % IMG[category].length]}?auto=format&fit=crop&w=200&q=60`,
      banner_url: `${UNS}${IMG[category][(shopIndex + 1) % IMG[category].length]}?auto=format&fit=crop&w=1200&q=60`,
      is_live: true,
      verification_status: "approved",
      operating_status: "Open",
      business_hours: "9:00 AM - 11:00 PM",
      store_bio: `${name} — trusted local ${category.toLowerCase()} store on TrendMart. Quality products, fair prices, fast delivery in ${area}.`,
      accent_color: "#10b981",
      shop_type: "retail",
      latitude: lat + (Math.random() - 0.5) * 0.02,
      longitude: lng + (Math.random() - 0.5) * 0.02,
      address_display: area,
      service_radius_km: pick([3, 5, 5, 8, 10, 10]),
      min_order_amount: pick([0, 100, 150, 200]),
      free_delivery_threshold: pick([null, 1000, 1500, 2000]),
      delivery_fee_flat: pick([0, 50, 100, 150]),
      delivery_fee_per_km: pick([0, 10, 20]),
    });
    shopIndex++;
  }
}

const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
    process.exit(1);
  }

  // bounded-concurrency batch helper (parallelise network calls to finish quickly)
  const batch = async (items, fn, size = 10) => {
    for (let i = 0; i < items.length; i += size) {
      const slice = items.slice(i, i + size);
      await Promise.all(slice.map(fn));
    }
  };

  const skipShops = process.env.SKIP_SHOPS === "1";
  const skipProducts = process.env.SKIP_PRODUCTS === "1";
  const skipDeals = process.env.SKIP_DEALS === "1";

  // 1) Shops — sequential check-or-insert (parallel would race and duplicate)
  const insertedShops = [];
  if (skipShops) {
    // Reuse existing seed shops by name — no inserts, no duplicate risk.
    const { data: found, error } = await supabase.from("shops").select("id").in("name", shops.map((s) => s.name));
    if (error) { console.error("shop lookup err", error.message); process.exit(1); }
    insertedShops.push(...(found ?? []));
  } else {
    for (const s of shops) {
      const { data: existing } = await supabase.from("shops").select("id").eq("name", s.name).maybeSingle();
      if (existing) { insertedShops.push(existing); continue; }
      const { data, error } = await supabase.from("shops").insert(s).select("id").single();
      if (error) { console.error("shop err", s.name, error.message); continue; }
      insertedShops.push(data);
    }
    // De-duplicate in case a race ever created a same-name copy (keeps one).
    const seen = new Set();
    const unique = [];
    for (const id of insertedShops) {
      if (!seen.has(id.id)) { seen.add(id.id); unique.push(id); }
    }
    insertedShops.length = 0; insertedShops.push(...unique);
  }
  console.log(`✔ ${insertedShops.length}/${shops.length} shops`);

  // 2) Products — 20 per shop (idempotent: replace each shop's row set)
  let products = 0;
  if (!skipProducts) await batch(insertedShops, async (shop) => {
    const { data: shopRow } = await supabase.from("shops").select("category,name").eq("id", shop.id).single();
    const cat = shopRow?.category ?? "Electronics & Gadgets";
    const names = PRODUCT_NAMES[cat] ?? PRODUCT_NAMES["Electronics & Gadgets"];
    const rows = [];
    for (let i = 0; i < 20; i++) {
      const price = rand(120, 12000);
      const discount = Math.random() < 0.4 ? rand(5, 40) : 0;
      rows.push({
        shop_id: shop.id,
        name: names[i % names.length] + (i >= names.length ? ` (${i + 1})` : ""),
        description: `Premium ${names[i % names.length].toLowerCase()} from ${shopRow?.name ?? "our store"}. Fresh stock, great value.`,
        price,
        original_price: discount > 0 ? Math.round(price * (100 + discount) / 100) : null,
        image_url: uns(cat, i),
        is_available: Math.random() > 0.12,
      });
    }
    const { error: delProd } = await supabase.from("products").delete().eq("shop_id", shop.id);
    if (delProd) { console.error("product-del err", shop.name, delProd.message); return; }
    const { error } = await supabase.from("products").insert(rows);
    if (error) { console.error("product err", shop.name, error.message); return; }
    products += rows.length;
  });
  console.log(`✔ ${products}/1000 products`);

  // 3) Deals — 3 per shop (idempotent: replace each shop's row set)
  let deals = 0;
  if (!skipDeals) await batch(insertedShops, async (shop) => {
    const { data: shopRow } = await supabase.from("shops").select("category,name").eq("id", shop.id).single();
    const cat = shopRow?.category ?? "Electronics & Gadgets";
    const names = PRODUCT_NAMES[cat] ?? PRODUCT_NAMES["Electronics & Gadgets"];
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const start = new Date(today); start.setDate(start.getDate() - rand(0, 5));
      const end = new Date(start); end.setDate(end.getDate() + rand(7, 20));
      rows.push({
        shop_id: shop.id,
        title: `${names[i]} — Mega Deal`,
        description: `Limited-time offer on ${names[i].toLowerCase()} at ${shopRow?.name}. Order on WhatsApp today!`,
        schedule_type: "date_range",
        starts_on: iso(start),
        ends_on: iso(end),
        image_url: uns(cat, i + 1),
        badge_text: pick(["SALE", "MEGA SALE", "20% OFF", "SPECIAL", "DEAL OF THE DAY", "WEEKEND OFFER"]),
        is_active: true,
        is_featured: i === 0,
      });
    }
    const { error: delDeal } = await supabase.from("shop_deals").delete().eq("shop_id", shop.id);
    if (delDeal) { console.error("deal-del err", shop.name, delDeal.message); return; }
    const { error } = await supabase.from("shop_deals").insert(rows);
    if (error) { console.error("deal err", shop.name, error.message); return; }
    deals += rows.length;
  });
  console.log(`✔ ${deals}/150 deals`);
  console.log("Seed complete!");
}

main().catch((e) => { console.error(e); process.exit(1); });
