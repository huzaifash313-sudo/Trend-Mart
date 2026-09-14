/* -------------------------------------------------------------------------- */
/*  TrendsMart — Canonical category + subcategory catalog (single source)       */
/*  DB seeds / UI / validation should prefer this over scattered SQL copies.   */
/* -------------------------------------------------------------------------- */

import type { ShopCategory } from "@/types";
import { SHOP_CATEGORIES } from "@/types";

export interface CatalogSubCategory {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_others?: boolean;
}

/** Legacy / short names → canonical ShopCategory (never invent new shops onto wrong key). */
export const CATEGORY_ALIASES: Record<string, ShopCategory> = {
  All: "All",
  Food: "Fast Food & Restaurants",
  Restaurant: "Fast Food & Restaurants",
  Restaurants: "Fast Food & Restaurants",
  Grocery: "Grocery & Kiryana",
  Kiryana: "Grocery & Kiryana",
  Boutique: "Fashion & Apparel",
  Fashion: "Fashion & Apparel",
  Electronics: "Electronics & Gadgets",
  Cosmetics: "Health & Beauty",
  Beauty: "Health & Beauty",
  Cafe: "Cafe & Beverages",
  Coffee: "Cafe & Beverages",
  Butcher: "Meat & Seafood",
  Meat: "Meat & Seafood",
  Others: "Others / Universal",
  Other: "Others / Universal",
  Universal: "Others / Universal",
};

/** Normalize any category string to a known ShopCategory (or null if unknown). */
export function normalizeShopCategory(
  raw: string | null | undefined,
): ShopCategory | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  if ((SHOP_CATEGORIES as readonly string[]).includes(t)) {
    return t as ShopCategory;
  }
  const aliased = CATEGORY_ALIASES[t] ?? CATEGORY_ALIASES[t.replace(/\s+/g, " ")];
  if (aliased) return aliased;
  // case-insensitive exact match
  const lower = t.toLowerCase();
  for (const c of SHOP_CATEGORIES) {
    if (c.toLowerCase() === lower) return c;
  }
  for (const [k, v] of Object.entries(CATEGORY_ALIASES)) {
    if (k.toLowerCase() === lower) return v;
  }
  return null;
}

function others(category: string): CatalogSubCategory {
  return {
    name: "Others / General",
    slug: `${category
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-others`,
    description: `Items that do not fit a specific sub-category in ${category}`,
    icon: "📦",
    sort_order: 999,
    is_others: true,
  };
}

/** Full subcategory map — strongest Pakistan hyper-local set. */
export const SUBCATEGORY_CATALOG: Record<string, CatalogSubCategory[]> = {
  "Grocery & Kiryana": [
    { name: "Dry Goods & Spices", slug: "dry-goods-spices", description: "Atta, daal, rice, masala, and pantry staples", icon: "🫙", sort_order: 1 },
    { name: "Oil, Ghee & Butter", slug: "oil-ghee-butter", description: "Cooking oil, desi ghee, and spreads", icon: "🫒", sort_order: 2 },
    { name: "Dairy & Eggs", slug: "dairy-eggs", description: "Milk, yogurt, cheese, and eggs", icon: "🥛", sort_order: 3 },
    { name: "Tea, Coffee & Breakfast", slug: "tea-coffee-breakfast", description: "Chai, coffee, cereals, and breakfast items", icon: "☕", sort_order: 4 },
    { name: "Snacks & Beverages", slug: "snacks-beverages", description: "Chips, biscuits, juices, and soft drinks", icon: "🧃", sort_order: 5 },
    { name: "Household Essentials", slug: "household-essentials", description: "Cleaning, toiletries, and daily-use items", icon: "🧴", sort_order: 6 },
    { name: "Frozen & Packaged", slug: "frozen-packaged", description: "Frozen foods and packaged convenience items", icon: "🧊", sort_order: 7 },
    { name: "Baby & Pet Food", slug: "baby-pet-food", description: "Formula, baby food, and pet groceries", icon: "🍼", sort_order: 8 },
    others("Grocery & Kiryana"),
  ],
  "Fruits & Vegetables": [
    { name: "Seasonal Fruits", slug: "seasonal-fruits", description: "Fresh seasonal fruit by the kilo", icon: "🍎", sort_order: 1 },
    { name: "Fresh Vegetables", slug: "fresh-vegetables", description: "Daily sabzi and leafy greens", icon: "🥦", sort_order: 2 },
    { name: "Herbs & Roots", slug: "herbs-roots", description: "Adrak, lehsan, pudina, and kitchen herbs", icon: "🌿", sort_order: 3 },
    { name: "Exotic & Imported", slug: "exotic-imported", description: "Imported and specialty produce", icon: "🥑", sort_order: 4 },
    { name: "Cut & Ready Packs", slug: "cut-ready-packs", description: "Peeled, cut, and ready-to-cook packs", icon: "🥗", sort_order: 5 },
    others("Fruits & Vegetables"),
  ],
  "Meat & Seafood": [
    { name: "Chicken", slug: "chicken", description: "Fresh and cut chicken", icon: "🍗", sort_order: 1 },
    { name: "Mutton & Beef", slug: "mutton-beef", description: "Mutton, beef, and goat cuts", icon: "🥩", sort_order: 2 },
    { name: "Fish & Seafood", slug: "fish-seafood", description: "Fish, prawns, and seafood", icon: "🐟", sort_order: 3 },
    { name: "Frozen Meat", slug: "frozen-meat", description: "Frozen meat packs and kebabs", icon: "🧊", sort_order: 4 },
    { name: "Marinated & Ready", slug: "marinated-ready", description: "Marinated tikka, boti, and BBQ packs", icon: "🔥", sort_order: 5 },
    others("Meat & Seafood"),
  ],
  "Bakery & Sweets": [
    { name: "Bread & Buns", slug: "bread-buns", description: "Fresh bread, rusk, and bakery buns", icon: "🍞", sort_order: 1 },
    { name: "Cakes & Pastries", slug: "cakes-pastries", description: "Birthday cakes, cupcakes, and pastries", icon: "🎂", sort_order: 2 },
    { name: "Mithai & Traditional", slug: "mithai-traditional", description: "Gulab jamun, barfi, jalebi, and mithai boxes", icon: "🍬", sort_order: 3 },
    { name: "Cookies & Desserts", slug: "cookies-desserts", description: "Cookies, brownies, and sweet treats", icon: "🍪", sort_order: 4 },
    { name: "Savory Bakery", slug: "savory-bakery", description: "Patties, samosas, and savory bakery", icon: "🥐", sort_order: 5 },
    others("Bakery & Sweets"),
  ],
  "Fast Food & Restaurants": [
    { name: "Burgers", slug: "burgers", description: "Burgers, smash burgers, and combo meals", icon: "🍔", sort_order: 1 },
    { name: "Shawarma & Rolls", slug: "shawarma-rolls", description: "Shawarma, wraps, rolls, and sandwiches", icon: "🌯", sort_order: 2 },
    { name: "Pizza & Pasta", slug: "pizza-pasta", description: "Pizza, pasta, and Italian-style meals", icon: "🍕", sort_order: 3 },
    { name: "Desi & BBQ", slug: "desi-bbq", description: "Biryani, karahi, BBQ, and Pakistani classics", icon: "🍖", sort_order: 4 },
    { name: "Chinese & Asian", slug: "chinese-asian", description: "Chinese, Thai, and Asian favourites", icon: "🥡", sort_order: 5 },
    { name: "Fries & Sides", slug: "fries-sides", description: "Fries, nuggets, and side snacks", icon: "🍟", sort_order: 6 },
    { name: "Breakfast & Paratha", slug: "breakfast-paratha", description: "Paratha, omelette, and breakfast plates", icon: "🍳", sort_order: 7 },
    { name: "Deals & Combos", slug: "deals-combos", description: "Family deals, meal boxes, and special offers", icon: "🔥", sort_order: 8 },
    { name: "Desserts & Ice Cream", slug: "desserts-ice-cream", description: "Ice cream, kulfi, and sweet endings", icon: "🍨", sort_order: 9 },
    others("Fast Food & Restaurants"),
  ],
  "Cafe & Beverages": [
    { name: "Coffee & Espresso", slug: "coffee-espresso", description: "Coffee, latte, cappuccino, and espresso", icon: "☕", sort_order: 1 },
    { name: "Chai & Desi Drinks", slug: "chai-desi-drinks", description: "Chai, doodh patti, and desi beverages", icon: "🫖", sort_order: 2 },
    { name: "Fresh Juices & Shakes", slug: "juices-shakes", description: "Fresh juices, smoothies, and milkshakes", icon: "🥤", sort_order: 3 },
    { name: "Mocktails & Cold Drinks", slug: "mocktails-cold", description: "Mocktails, iced drinks, and sodas", icon: "🍹", sort_order: 4 },
    { name: "Snacks & Light Bites", slug: "cafe-snacks", description: "Sandwiches, wraps, and cafe snacks", icon: "🥪", sort_order: 5 },
    { name: "Desserts & Bakery Cafe", slug: "cafe-desserts", description: "Cakes, brownies, and cafe desserts", icon: "🍰", sort_order: 6 },
    others("Cafe & Beverages"),
  ],
  "Pharmacy & Medical": [
    { name: "Prescription Medicines", slug: "prescription-medicines", description: "Prescribed medicines and pharmacy counter", icon: "💊", sort_order: 1 },
    { name: "OTC & First Aid", slug: "otc-first-aid", description: "Over-the-counter medicines and first-aid", icon: "🩹", sort_order: 2 },
    { name: "Personal Care", slug: "personal-care-medical", description: "Hygiene, skincare, and wellness products", icon: "🧴", sort_order: 3 },
    { name: "Vitamins & Supplements", slug: "vitamins-supplements", description: "Multivitamins, calcium, and wellness packs", icon: "💊", sort_order: 4 },
    { name: "Medical Devices", slug: "medical-devices", description: "BP monitors, thermometers, and devices", icon: "🩺", sort_order: 5 },
    { name: "Baby & Mother Care", slug: "baby-mother-care", description: "Infant formula, diapers, and mother care", icon: "🍼", sort_order: 6 },
    others("Pharmacy & Medical"),
  ],
  "Fashion & Apparel": [
    { name: "Women's Clothing", slug: "womens-clothing", description: "Dresses, tops, kurtis, and casual wear", icon: "👗", sort_order: 1 },
    { name: "Men's Clothing", slug: "mens-clothing", description: "Shalwar kameez, shirts, trousers, and suits", icon: "👔", sort_order: 2 },
    { name: "Kids' Wear", slug: "kids-wear", description: "Children's clothing, uniforms, and accessories", icon: "👶", sort_order: 3 },
    { name: "Unstitched & Lawn", slug: "unstitched-lawn", description: "Lawn, unstitched suits, and fabric", icon: "🧵", sort_order: 4 },
    { name: "Footwear", slug: "footwear", description: "Shoes, sandals, sneakers, and formal wear", icon: "👟", sort_order: 5 },
    { name: "Accessories", slug: "accessories", description: "Bags, watches, jewelry, and sunglasses", icon: "👜", sort_order: 6 },
    { name: "Winter Collection", slug: "winter-collection", description: "Sweaters, jackets, shawls, and warm wear", icon: "🧥", sort_order: 7 },
    { name: "Wedding & Formal", slug: "wedding-formal", description: "Bridal wear, sherwani, and formal suits", icon: "💍", sort_order: 8 },
    others("Fashion & Apparel"),
  ],
  "Electronics & Gadgets": [
    { name: "Smartphones", slug: "smartphones", description: "Mobile phones and handsets", icon: "📱", sort_order: 1 },
    { name: "Mobile Accessories", slug: "mobile-accessories", description: "Cases, screen guards, earphones, and stands", icon: "🎧", sort_order: 2 },
    { name: "Laptops & Computers", slug: "laptops-computers", description: "Notebooks, desktops, and peripherals", icon: "💻", sort_order: 3 },
    { name: "Audio & Headphones", slug: "audio-headphones", description: "Speakers, earphones, headphones, and audio gear", icon: "🔊", sort_order: 4 },
    { name: "Chargers & Power", slug: "chargers-power", description: "Power banks, chargers, cables, and adapters", icon: "🔌", sort_order: 5 },
    { name: "Smart Home & Wearables", slug: "smart-home-wearables", description: "Smart watches, bands, and IoT gadgets", icon: "⌚", sort_order: 6 },
    { name: "Home Appliances", slug: "home-appliances", description: "Irons, blenders, fans, and small appliances", icon: "🏠", sort_order: 7 },
    others("Electronics & Gadgets"),
  ],
  "Home & Living": [
    { name: "Furniture", slug: "furniture", description: "Beds, sofas, tables, chairs, and storage", icon: "🛋️", sort_order: 1 },
    { name: "Kitchen & Dining", slug: "kitchen-dining", description: "Cookware, utensils, dinner sets, and glassware", icon: "🍽️", sort_order: 2 },
    { name: "Home Décor", slug: "home-decor", description: "Vases, wall art, clocks, mirrors, and candles", icon: "🖼️", sort_order: 3 },
    { name: "Bedding & Linens", slug: "bedding-linens", description: "Bed sheets, pillows, blankets, and towels", icon: "🛏️", sort_order: 4 },
    { name: "Lighting", slug: "lighting", description: "Lamps, bulbs, and decorative lights", icon: "💡", sort_order: 5 },
    { name: "Storage & Organizers", slug: "storage-organizers", description: "Racks, boxes, and home organizers", icon: "📦", sort_order: 6 },
    { name: "Cleaning & Supplies", slug: "cleaning-supplies", description: "Cleaning tools, detergents, and supplies", icon: "🧹", sort_order: 7 },
    others("Home & Living"),
  ],
  "Health & Beauty": [
    { name: "Skincare", slug: "skincare", description: "Creams, serums, sunscreens, and face masks", icon: "🧴", sort_order: 1 },
    { name: "Makeup", slug: "makeup", description: "Lipsticks, foundations, eyeshadows, and palettes", icon: "💄", sort_order: 2 },
    { name: "Hair Care", slug: "hair-care", description: "Shampoos, conditioners, oils, and styling", icon: "💇", sort_order: 3 },
    { name: "Fragrances & Attar", slug: "fragrances-attar", description: "Perfumes, attars, and body sprays", icon: "🌸", sort_order: 4 },
    { name: "Personal Care", slug: "personal-care", description: "Soaps, lotions, oral care, and hygiene", icon: "🧼", sort_order: 5 },
    { name: "Men's Grooming", slug: "mens-grooming", description: "Beard care, shaving, and men's kits", icon: "🧔", sort_order: 6 },
    others("Health & Beauty"),
  ],
  "Books & Stationery": [
    { name: "Fiction & Novels", slug: "fiction-novels", description: "Novels, literature, and fiction books", icon: "📖", sort_order: 1 },
    { name: "Educational & Exam", slug: "educational-exam", description: "Textbooks, guides, and exam prep", icon: "📚", sort_order: 2 },
    { name: "Islamic & Religious", slug: "islamic-religious", description: "Quran, Islamic books, and religious literature", icon: "☪️", sort_order: 3 },
    { name: "Stationery & Office", slug: "stationery-office", description: "Pens, notebooks, and office essentials", icon: "✏️", sort_order: 4 },
    { name: "Art & Craft Supplies", slug: "art-craft-supplies", description: "Colors, brushes, and craft kits", icon: "🎨", sort_order: 5 },
    others("Books & Stationery"),
  ],
  "Sports & Fitness": [
    { name: "Exercise Equipment", slug: "exercise-equipment", description: "Dumbbells, mats, and home gym gear", icon: "🏋️", sort_order: 1 },
    { name: "Sportswear", slug: "sportswear", description: "Activewear, tracksuits, and sports shoes", icon: "👟", sort_order: 2 },
    { name: "Outdoor & Adventure", slug: "outdoor-adventure", description: "Camping, hiking, and cycling gear", icon: "⛺", sort_order: 3 },
    { name: "Team Sports", slug: "team-sports", description: "Cricket, football, and team gear", icon: "🏏", sort_order: 4 },
    { name: "Supplements", slug: "supplements", description: "Protein, vitamins, and nutrition", icon: "🥤", sort_order: 5 },
    others("Sports & Fitness"),
  ],
  "Toys & Baby Care": [
    { name: "Toys & Games", slug: "toys-games", description: "Toys, puzzles, and board games", icon: "🧸", sort_order: 1 },
    { name: "Baby Gear", slug: "baby-gear", description: "Strollers, carriers, and baby furniture", icon: "👶", sort_order: 2 },
    { name: "Baby Clothing", slug: "baby-clothing", description: "Onesies, bibs, and infant wear", icon: "🍼", sort_order: 3 },
    { name: "Diapers & Wipes", slug: "diapers-wipes", description: "Diapers, wipes, and changing essentials", icon: "🧷", sort_order: 4 },
    { name: "Feeding & Nursing", slug: "feeding-nursing", description: "Bottles, sterilizers, and feeding sets", icon: "🍼", sort_order: 5 },
    others("Toys & Baby Care"),
  ],
  "Automotive Accessories": [
    { name: "Car Electronics", slug: "car-electronics", description: "Stereos, dashcams, and GPS", icon: "📻", sort_order: 1 },
    { name: "Car Care", slug: "car-care", description: "Cleaning kits, waxes, and fresheners", icon: "🧽", sort_order: 2 },
    { name: "Interior Accessories", slug: "interior-accessories", description: "Seat covers, mats, and organizers", icon: "💺", sort_order: 3 },
    { name: "Exterior & Parts", slug: "exterior-parts", description: "Lights, mirrors, and body accessories", icon: "🔧", sort_order: 4 },
    { name: "Motorcycle Accessories", slug: "motorcycle-accessories", description: "Helmets, gloves, and bike covers", icon: "🏍️", sort_order: 5 },
    { name: "Oils & Fluids", slug: "oils-fluids", description: "Engine oil, coolants, and fluids", icon: "🛢️", sort_order: 6 },
    others("Automotive Accessories"),
  ],
  "Handmade & Crafts": [
    { name: "Home Decor Crafts", slug: "home-decor-crafts", description: "Handmade décor and wall pieces", icon: "🖼️", sort_order: 1 },
    { name: "Jewelry & Beads", slug: "jewelry-beads", description: "Handmade jewelry and beadwork", icon: "📿", sort_order: 2 },
    { name: "Custom Gifts", slug: "custom-gifts", description: "Personalized and gift crafts", icon: "🎁", sort_order: 3 },
    { name: "Art & Paintings", slug: "art-paintings", description: "Paintings, calligraphy, and art", icon: "🎨", sort_order: 4 },
    { name: "Resin & Clay", slug: "resin-clay", description: "Resin art, clay crafts, and keychains", icon: "🪨", sort_order: 5 },
    others("Handmade & Crafts"),
  ],
  "Sanitary and Fittings": [
    { name: "Taps & Mixers", slug: "taps-mixers", description: "Basin, kitchen, and shower mixers", icon: "🚰", sort_order: 1 },
    { name: "Pipes & Connectors", slug: "pipes-connectors", description: "PVC, PPR, elbows, and joints", icon: "🔧", sort_order: 2 },
    { name: "Bathroom Accessories", slug: "bathroom-accessories", description: "Soap dishes, towel rails, and mirrors", icon: "🪞", sort_order: 3 },
    { name: "Toilet & Cistern", slug: "toilet-cistern", description: "Commodes, seats, and flush tanks", icon: "🚽", sort_order: 4 },
    { name: "Showers & Bath", slug: "showers-bath", description: "Shower heads, hand showers, and baths", icon: "🚿", sort_order: 5 },
    { name: "Valves & Hardware", slug: "valves-hardware", description: "Ball valves, gate valves, and fittings", icon: "⚙️", sort_order: 6 },
    { name: "Sinks & Basins", slug: "sinks-basins", description: "Wash basins, kitchen sinks, and pedestals", icon: "🧼", sort_order: 7 },
    others("Sanitary and Fittings"),
  ],
  "Home Maintenance & Repair": [
    { name: "Plumbing", slug: "plumbing", description: "Plumbers and water-line repair", icon: "🔧", sort_order: 1 },
    { name: "Electrical", slug: "electrical", description: "Electricians and wiring work", icon: "⚡", sort_order: 2 },
    { name: "AC & Cooling", slug: "ac-cooling", description: "AC install, gas, and repair", icon: "❄️", sort_order: 3 },
    { name: "Carpentry", slug: "carpentry", description: "Woodwork and furniture repair", icon: "🪚", sort_order: 4 },
    { name: "Painting & Polish", slug: "painting-polish", description: "Painting, polish, and finishing", icon: "🖌️", sort_order: 5 },
    { name: "Appliance Repair", slug: "appliance-repair", description: "Fridge, washing machine, and appliance fix", icon: "🛠️", sort_order: 6 },
    others("Home Maintenance & Repair"),
  ],
  "Security & Surveillance": [
    { name: "CCTV Cameras", slug: "cctv-cameras", description: "CCTV cameras and kits", icon: "📹", sort_order: 1 },
    { name: "Installation & Setup", slug: "installation-setup", description: "On-site CCTV and alarm installation", icon: "🛠️", sort_order: 2 },
    { name: "Alarms & Sensors", slug: "alarms-sensors", description: "Burglar alarms and motion sensors", icon: "🚨", sort_order: 3 },
    { name: "Access Control", slug: "access-control", description: "Biometric and door access systems", icon: "🔐", sort_order: 4 },
    { name: "DVR / NVR & Storage", slug: "dvr-nvr-storage", description: "Recorders, hard disks, and storage", icon: "💾", sort_order: 5 },
    others("Security & Surveillance"),
  ],
  "Tech & IT Services": [
    { name: "Laptop & PC Repair", slug: "laptop-pc-repair", description: "Laptop and desktop repair", icon: "💻", sort_order: 1 },
    { name: "Mobile Repair", slug: "mobile-repair", description: "Phone screen, battery, and software", icon: "📱", sort_order: 2 },
    { name: "Networking & Wi‑Fi", slug: "networking-wifi", description: "Routers, LAN, and Wi‑Fi setup", icon: "📶", sort_order: 3 },
    { name: "Software & Web", slug: "software-web", description: "Software install, websites, and apps", icon: "🌐", sort_order: 4 },
    { name: "Data Recovery", slug: "data-recovery", description: "Recover files from drives and phones", icon: "💽", sort_order: 5 },
    { name: "IT Support & Training", slug: "it-support-training", description: "On-call IT support and basic training", icon: "🧑‍💻", sort_order: 6 },
    others("Tech & IT Services"),
  ],
  "Personal & Professional Services": [
    { name: "Salon & Beauty", slug: "salon-beauty", description: "Hair, makeup, and beauty services", icon: "💇", sort_order: 1 },
    { name: "Spa & Wellness", slug: "spa-wellness", description: "Massage, spa, and wellness", icon: "🧘", sort_order: 2 },
    { name: "Tutoring & Coaching", slug: "tutoring-coaching", description: "Home tuition and exam coaching", icon: "📘", sort_order: 3 },
    { name: "Cleaning & Maid", slug: "cleaning-maid", description: "Home cleaning and maid services", icon: "🧹", sort_order: 4 },
    { name: "Events & Photography", slug: "events-photography", description: "Events, photography, and videography", icon: "📸", sort_order: 5 },
    { name: "Legal & Accounting", slug: "legal-accounting", description: "Legal advice and accounting help", icon: "⚖️", sort_order: 6 },
    { name: "Printing & Documents", slug: "printing-documents", description: "Photocopy, printing, and documents", icon: "🖨️", sort_order: 7 },
    others("Personal & Professional Services"),
  ],
  "Others / Universal": [
    { name: "General Merchandise", slug: "general-merchandise", description: "Mixed everyday products", icon: "📦", sort_order: 1 },
    { name: "Gifts & Party", slug: "gifts-party", description: "Gifts, balloons, and party supplies", icon: "🎈", sort_order: 2 },
    { name: "Multi-Category Store", slug: "multi-category-store", description: "Stores selling across categories", icon: "🏪", sort_order: 3 },
    others("Others / Universal"),
  ],
};

/** Flatten catalog for seeding scripts. */
export function listCatalogSeedRows(): Array<
  CatalogSubCategory & { category: string }
> {
  const rows: Array<CatalogSubCategory & { category: string }> = [];
  for (const [category, subs] of Object.entries(SUBCATEGORY_CATALOG)) {
    for (const s of subs) {
      rows.push({ category, ...s });
    }
  }
  return rows;
}
