/**
 * Seed script: inserts 3 sample shops + products into public.shops & public.products.
 *
 * PREREQUISITE: Run supabase/migrations/schema.sql in the Supabase SQL Editor first.
 * Then execute:  npx tsx --env-file=.env.local scripts/seed-shops.ts
 */

import { createClient } from "@supabase/supabase-js";
import type { ShopFormData, ProductFormData } from "@/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ── Sample shops ─────────────────────────────────────────────────────────── */

const SHOPS: ShopFormData[] = [
  {
    name: "FreshBites",
    category: "Fast Food & Restaurants",
    location: "Gujranwala",
    whatsapp_number: "923001234567",
    is_live: true,
    logo_url: "",
    banner_url: "",
    instagram_handle: "",
    facebook_url: "",
    tiktok_handle: "",
    secondary_phone: "",
    business_hours: "Mon-Sat: 10 AM - 11 PM",
    operating_status: "Open Today: 10 AM - 11 PM",
    accent_color: "#10b981",
    store_bio: "FreshBites serves authentic Pakistani cuisine with fresh ingredients daily.",
    announcement: "Free delivery on orders above Rs. 2000! 🚀",
    announcement_expires_at: "",
    service_area: "",
    hourly_rate: "",
    call_out_charge: "",
    emergency_available: false,
    shop_type: "retail",
    latitude: 32.1877,
    longitude: 74.1945,
    service_radius_km: 10,
    delivery_zones: [],
    address_display: "Gujranwala, Pakistan",
    min_order_amount: "",
    free_delivery_threshold: "2000",
    delivery_fee_flat: "",
    delivery_fee_per_km: "",
  },
  {
    name: "TechDeals",
    category: "Electronics & Gadgets",
    location: "Lahore",
    whatsapp_number: "923007654321",
    is_live: true,
    logo_url: "",
    banner_url: "",
    instagram_handle: "",
    facebook_url: "",
    tiktok_handle: "",
    secondary_phone: "",
    business_hours: "Mon-Sun: 9 AM - 9 PM",
    operating_status: "Open Today: 9 AM - 9 PM",
    accent_color: "#3b82f6",
    store_bio: "TechDeals offers the latest gadgets and electronics at unbeatable prices.",
    announcement: "",
    announcement_expires_at: "",
    service_area: "",
    hourly_rate: "",
    call_out_charge: "",
    emergency_available: false,
    shop_type: "retail",
    latitude: 31.5497,
    longitude: 74.3436,
    service_radius_km: 10,
    delivery_zones: [],
    address_display: "Lahore, Pakistan",
    min_order_amount: "",
    free_delivery_threshold: "",
    delivery_fee_flat: "",
    delivery_fee_per_km: "",
  },
  {
    name: "StyleHub",
    category: "Fashion & Apparel",
    location: "Islamabad",
    whatsapp_number: "923009988776",
    is_live: false,
    logo_url: "",
    banner_url: "",
    instagram_handle: "",
    facebook_url: "",
    tiktok_handle: "",
    secondary_phone: "",
    business_hours: "Tue-Sun: 11 AM - 8 PM (Closed Mondays)",
    operating_status: "Temporarily Closed for Break",
    accent_color: "#ec4899",
    store_bio: "StyleHub brings you premium fashion and accessories for every occasion.",
    announcement: "",
    announcement_expires_at: "",
    service_area: "",
    hourly_rate: "",
    call_out_charge: "",
    emergency_available: false,
    shop_type: "retail",
    latitude: 33.6844,
    longitude: 73.0479,
    service_radius_km: 10,
    delivery_zones: [],
    address_display: "Islamabad, Pakistan",
    min_order_amount: "",
    free_delivery_threshold: "",
    delivery_fee_flat: "",
    delivery_fee_per_km: "",
  },
];

/* ── Sample products (will be linked to shops by index below) ─────────────── */

const PRODUCTS_BY_SHOP: ProductFormData[][] = [
  // FreshBites (index 0)
  [
    { name: "Chicken Biryani", description: "Authentic Pakistani biryani with tender chicken and aromatic spices.", price: 450, image_url: "", is_available: true },
    { name: "Seekh Kebab Platter", description: "4 juicy beef seekh kebabs served with mint chutney.", price: 380, image_url: "", is_available: true },
    { name: "Mango Lassi", description: "Creamy yogurt blend with sweet mango pulp.", price: 180, image_url: "", is_available: true },
  ],
  // TechDeals (index 1)
  [
    { name: "Wireless Earbuds", description: "Bluetooth 5.3 earbuds with ANC, 30h battery life.", price: 2499, image_url: "", is_available: true },
    { name: "USB-C Hub 7-in-1", description: "Compact adapter with HDMI, SD card, 3x USB-A, USB-C PD.", price: 1899, image_url: "", is_available: true },
  ],
  // StyleHub (index 2)
  [
    { name: "Embroidered Lawn Suit", description: "3-piece unstitched lawn with heavy embroidery.", price: 3200, image_url: "", is_available: true },
    { name: "Leather Handbag", description: "Genuine leather crossbody bag in tan finish.", price: 4500, image_url: "", is_available: true },
    { name: "Sneakers", description: "Classic white sneakers, unisex, all sizes.", price: 2800, image_url: "", is_available: true },
  ],
];

/* ── Main ──────────────────────────────────────────────────────────────────── */

async function seed() {
  console.log("🌱 Seeding TrendMart database…\n");

  // 1. Insert shops
  const shopIds: string[] = [];

  for (const shop of SHOPS) {
    const { data, error } = await supabase
      .from("shops")
      .insert(shop)
      .select("id")
      .single();

    if (error) {
      console.error(`❌ Shop "${shop.name}":`, error.message);
    } else {
      shopIds.push(data.id);
      console.log(`✅ Shop: "${shop.name}"  (${data.id})`);
    }
  }

  if (shopIds.length === 0) {
    console.log("\n⚠️  No shops inserted — skipping products.");
    return;
  }

  // 2. Insert products linked to each shop
  console.log("");

  for (let i = 0; i < PRODUCTS_BY_SHOP.length; i++) {
    const shopId = shopIds[i];
    if (!shopId) continue;

    const products = PRODUCTS_BY_SHOP[i];

    for (const product of products) {
      const { error } = await supabase
        .from("products")
        .insert({ ...product, shop_id: shopId });

      if (error) {
        console.error(`❌ Product "${product.name}" →`, error.message);
      } else {
        console.log(`   ✅ "${product.name}"  (${product.price} PKR)`);
      }
    }
  }

  console.log("\n🎉 Seeding complete.");
}

seed();