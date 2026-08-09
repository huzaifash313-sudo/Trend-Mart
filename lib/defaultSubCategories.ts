/* -------------------------------------------------------------------------- */
/*  Built-in sub-category catalog (Pakistan retail + services)                 */
/*  Used when Supabase seed rows are missing so UI never shows only Others.    */
/* -------------------------------------------------------------------------- */

export interface DefaultSubCategoryDef {
  name: string;
  slug: string;
  description: string;
  icon: string;
  sort_order: number;
  is_others?: boolean;
}

/** Stable synthetic id prefix — product save resolves these via seed API. */
export const SEED_SUB_ID_PREFIX = "seed:";

export function seedSubCategoryId(category: string, slug: string): string {
  const cat = category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return `${SEED_SUB_ID_PREFIX}${cat}:${slug}`;
}

export function isSeedSubCategoryId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SEED_SUB_ID_PREFIX);
}

export function parseSeedSubCategoryId(
  id: string,
): { categorySlug: string; slug: string } | null {
  if (!isSeedSubCategoryId(id)) return null;
  const rest = id.slice(SEED_SUB_ID_PREFIX.length);
  const idx = rest.indexOf(":");
  if (idx <= 0) return null;
  return { categorySlug: rest.slice(0, idx), slug: rest.slice(idx + 1) };
}

/**
 * Full default taxonomy keyed by main shop category.
 * Keep in sync with PRODUCT_CATEGORIES in types/index.ts.
 */
export const DEFAULT_SUB_CATEGORIES: Record<string, DefaultSubCategoryDef[]> = {
  "Grocery & Kiryana": [
    { name: "Atta, Rice & Daal", slug: "atta-rice-daal", description: "Staples and grains", icon: "🌾", sort_order: 1 },
    { name: "Oil & Ghee", slug: "oil-ghee", description: "Cooking oils and ghee", icon: "🫙", sort_order: 2 },
    { name: "Spices & Masala", slug: "spices-masala", description: "Spices and seasoning", icon: "🌶️", sort_order: 3 },
    { name: "Snacks & Biscuits", slug: "snacks-biscuits", description: "Packed snacks", icon: "🍪", sort_order: 4 },
    { name: "Beverages", slug: "beverages", description: "Drinks and juices", icon: "🧃", sort_order: 5 },
    { name: "Dairy & Eggs", slug: "dairy-eggs", description: "Milk, yogurt, eggs", icon: "🥚", sort_order: 6 },
    { name: "Household Essentials", slug: "household-essentials", description: "Cleaning and daily needs", icon: "🧹", sort_order: 7 },
    { name: "Others / General", slug: "grocery-kiryana-others", description: "Other grocery items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Fruits & Vegetables": [
    { name: "Fresh Fruits", slug: "fresh-fruits", description: "Seasonal fruits", icon: "🍎", sort_order: 1 },
    { name: "Fresh Vegetables", slug: "fresh-vegetables", description: "Daily sabzi", icon: "🥬", sort_order: 2 },
    { name: "Leafy Greens", slug: "leafy-greens", description: "Saag and salad leaves", icon: "🥗", sort_order: 3 },
    { name: "Dry Fruits & Nuts", slug: "dry-fruits-nuts", description: "Almonds, dates, nuts", icon: "🥜", sort_order: 4 },
    { name: "Exotic & Imported", slug: "exotic-imported", description: "Imported produce", icon: "🥭", sort_order: 5 },
    { name: "Others / General", slug: "fruits-vegetables-others", description: "Other produce", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Bakery & Sweets": [
    { name: "Cakes & Pastries", slug: "cakes-pastries", description: "Cakes and bakery sweets", icon: "🎂", sort_order: 1 },
    { name: "Bread & Bun", slug: "bread-bun", description: "Fresh bread", icon: "🍞", sort_order: 2 },
    { name: "Mithai & Desi Sweets", slug: "mithai-desi", description: "Traditional sweets", icon: "🍬", sort_order: 3 },
    { name: "Cookies & Rusk", slug: "cookies-rusk", description: "Biscuits and rusk", icon: "🍪", sort_order: 4 },
    { name: "Custom Orders", slug: "custom-orders", description: "Made-to-order bakery", icon: "✨", sort_order: 5 },
    { name: "Others / General", slug: "bakery-sweets-others", description: "Other bakery items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Fast Food & Restaurants": [
    { name: "Burgers", slug: "burgers", description: "Burgers and smash burgers", icon: "🍔", sort_order: 1 },
    { name: "Shawarma & Rolls", slug: "shawarma-rolls", description: "Shawarma, wraps, rolls", icon: "🌯", sort_order: 2 },
    { name: "Deals & Combos", slug: "deals-combos", description: "Family deals and meal boxes", icon: "🔥", sort_order: 3 },
    { name: "Desi & BBQ", slug: "desi-bbq", description: "Biryani, karahi, BBQ", icon: "🍖", sort_order: 4 },
    { name: "Pizza & Pasta", slug: "pizza-pasta", description: "Pizza and pasta", icon: "🍕", sort_order: 5 },
    { name: "Fries & Sides", slug: "fries-sides", description: "Fries and sides", icon: "🍟", sort_order: 6 },
    { name: "Cafe & Beverages", slug: "cafe-beverages", description: "Coffee, chai, shakes", icon: "☕", sort_order: 7 },
    { name: "Chinese & Asian", slug: "chinese-asian", description: "Chinese and Asian meals", icon: "🥡", sort_order: 8 },
    { name: "Others / General", slug: "fast-food-restaurants-others", description: "Other food items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Pharmacy & Medical": [
    { name: "Medicines", slug: "medicines", description: "OTC and prescription", icon: "💊", sort_order: 1 },
    { name: "First Aid", slug: "first-aid", description: "Bandages and kits", icon: "🩹", sort_order: 2 },
    { name: "Vitamins & Supplements", slug: "vitamins-supplements", description: "Health supplements", icon: "🧴", sort_order: 3 },
    { name: "Baby Care", slug: "pharma-baby-care", description: "Baby health products", icon: "🍼", sort_order: 4 },
    { name: "Personal Care", slug: "pharma-personal-care", description: "Hygiene products", icon: "🧼", sort_order: 5 },
    { name: "Others / General", slug: "pharmacy-medical-others", description: "Other medical items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Fashion & Apparel": [
    { name: "Men's Wear", slug: "mens-wear", description: "Clothes for men", icon: "👔", sort_order: 1 },
    { name: "Women's Wear", slug: "womens-wear", description: "Clothes for women", icon: "👗", sort_order: 2 },
    { name: "Kids Wear", slug: "kids-wear", description: "Clothes for kids", icon: "🧒", sort_order: 3 },
    { name: "Footwear", slug: "footwear", description: "Shoes and sandals", icon: "👟", sort_order: 4 },
    { name: "Bags & Accessories", slug: "bags-accessories", description: "Bags and fashion extras", icon: "👜", sort_order: 5 },
    { name: "Others / General", slug: "fashion-apparel-others", description: "Other fashion items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Electronics & Gadgets": [
    { name: "Mobiles & Accessories", slug: "mobiles-accessories", description: "Phones and accessories", icon: "📱", sort_order: 1 },
    { name: "Audio & Earbuds", slug: "audio-earbuds", description: "Headphones and speakers", icon: "🎧", sort_order: 2 },
    { name: "Computers & Laptops", slug: "computers-laptops", description: "PCs and laptops", icon: "💻", sort_order: 3 },
    { name: "Smart Home", slug: "smart-home", description: "Smart devices", icon: "🏠", sort_order: 4 },
    { name: "Power Banks & Cables", slug: "power-cables", description: "Charging gear", icon: "🔌", sort_order: 5 },
    { name: "Others / General", slug: "electronics-gadgets-others", description: "Other gadgets", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Home & Living": [
    { name: "Kitchen & Dining", slug: "kitchen-dining", description: "Kitchenware", icon: "🍽️", sort_order: 1 },
    { name: "Furniture", slug: "furniture", description: "Home furniture", icon: "🛋️", sort_order: 2 },
    { name: "Decor & Lighting", slug: "decor-lighting", description: "Home decor", icon: "💡", sort_order: 3 },
    { name: "Bedding & Bath", slug: "bedding-bath", description: "Bed and bath linen", icon: "🛏️", sort_order: 4 },
    { name: "Storage & Organizers", slug: "storage-organizers", description: "Storage solutions", icon: "📦", sort_order: 5 },
    { name: "Others / General", slug: "home-living-others", description: "Other home items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Health & Beauty": [
    { name: "Skincare", slug: "skincare", description: "Face and body care", icon: "✨", sort_order: 1 },
    { name: "Makeup", slug: "makeup", description: "Cosmetics", icon: "💄", sort_order: 2 },
    { name: "Hair Care", slug: "hair-care", description: "Hair products", icon: "💇", sort_order: 3 },
    { name: "Fragrance", slug: "fragrance", description: "Perfumes and attar", icon: "🌸", sort_order: 4 },
    { name: "Personal Hygiene", slug: "personal-hygiene", description: "Daily hygiene", icon: "🪥", sort_order: 5 },
    { name: "Others / General", slug: "health-beauty-others", description: "Other beauty items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Books & Stationery": [
    { name: "School Books", slug: "school-books", description: "Academic books", icon: "📖", sort_order: 1 },
    { name: "Novels & Magazines", slug: "novels-magazines", description: "Reading material", icon: "📚", sort_order: 2 },
    { name: "Notebooks & Pens", slug: "notebooks-pens", description: "Stationery basics", icon: "✏️", sort_order: 3 },
    { name: "Art Supplies", slug: "art-supplies", description: "Drawing and crafts", icon: "🎨", sort_order: 4 },
    { name: "Office Supplies", slug: "office-supplies", description: "Office stationery", icon: "📎", sort_order: 5 },
    { name: "Others / General", slug: "books-stationery-others", description: "Other stationery", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Sports & Fitness": [
    { name: "Gym & Fitness", slug: "gym-fitness", description: "Gym gear", icon: "🏋️", sort_order: 1 },
    { name: "Outdoor Sports", slug: "outdoor-sports", description: "Cricket, football, etc.", icon: "⚽", sort_order: 2 },
    { name: "Sportswear", slug: "sportswear", description: "Activewear", icon: "👕", sort_order: 3 },
    { name: "Nutrition", slug: "sports-nutrition", description: "Protein and supplements", icon: "🥤", sort_order: 4 },
    { name: "Others / General", slug: "sports-fitness-others", description: "Other sports items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Toys & Baby Care": [
    { name: "Toys & Games", slug: "toys-games", description: "Kids toys", icon: "🧸", sort_order: 1 },
    { name: "Baby Clothing", slug: "baby-clothing", description: "Infant wear", icon: "👶", sort_order: 2 },
    { name: "Diapers & Feeding", slug: "diapers-feeding", description: "Feeding and diapers", icon: "🍼", sort_order: 3 },
    { name: "Nursery Essentials", slug: "nursery-essentials", description: "Nursery products", icon: "🛏️", sort_order: 4 },
    { name: "Others / General", slug: "toys-baby-care-others", description: "Other baby items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Automotive Accessories": [
    { name: "Car Care", slug: "car-care", description: "Cleaning and polish", icon: "🧽", sort_order: 1 },
    { name: "Interior Accessories", slug: "interior-accessories", description: "Seat covers and mats", icon: "💺", sort_order: 2 },
    { name: "Electronics & Audio", slug: "auto-electronics", description: "Car electronics", icon: "📻", sort_order: 3 },
    { name: "Bike Accessories", slug: "bike-accessories", description: "Motorcycle gear", icon: "🏍️", sort_order: 4 },
    { name: "Tools & Spare Parts", slug: "tools-spare-parts", description: "Tools and parts", icon: "🔧", sort_order: 5 },
    { name: "Others / General", slug: "automotive-accessories-others", description: "Other auto items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Handmade & Crafts": [
    { name: "Handmade Decor", slug: "handmade-decor", description: "Handcrafted decor", icon: "🏺", sort_order: 1 },
    { name: "Jewelry & Accessories", slug: "handmade-jewelry", description: "Handmade jewelry", icon: "💍", sort_order: 2 },
    { name: "Custom Gifts", slug: "custom-gifts", description: "Personalized gifts", icon: "🎁", sort_order: 3 },
    { name: "Art & Paintings", slug: "art-paintings", description: "Original art", icon: "🖼️", sort_order: 4 },
    { name: "Others / General", slug: "handmade-crafts-others", description: "Other crafts", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Home Maintenance & Repair": [
    { name: "Plumbing", slug: "plumbing", description: "Plumber services", icon: "🚰", sort_order: 1 },
    { name: "Electrical", slug: "electrical", description: "Electrician services", icon: "⚡", sort_order: 2 },
    { name: "AC & Cooling", slug: "ac-cooling", description: "AC repair and install", icon: "❄️", sort_order: 3 },
    { name: "Carpentry & Furniture", slug: "carpentry-furniture", description: "Wood and furniture work", icon: "🪵", sort_order: 4 },
    { name: "Painting & Renovation", slug: "painting-renovation", description: "Paint and remodel", icon: "🖌️", sort_order: 5 },
    { name: "Others / General", slug: "home-maintenance-repair-others", description: "Other repair services", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Security & Surveillance": [
    { name: "CCTV Cameras", slug: "cctv-cameras", description: "Camera systems", icon: "📹", sort_order: 1 },
    { name: "Alarm Systems", slug: "alarm-systems", description: "Security alarms", icon: "🚨", sort_order: 2 },
    { name: "Access Control", slug: "access-control", description: "Locks and entry systems", icon: "🔐", sort_order: 3 },
    { name: "Installation & Setup", slug: "security-installation", description: "Install services", icon: "🛠️", sort_order: 4 },
    { name: "Others / General", slug: "security-surveillance-others", description: "Other security items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Tech & IT Services": [
    { name: "Laptop & PC Repair", slug: "laptop-pc-repair", description: "Computer repair", icon: "🖥️", sort_order: 1 },
    { name: "Mobile Repair", slug: "mobile-repair", description: "Phone repair", icon: "📱", sort_order: 2 },
    { name: "Networking & WiFi", slug: "networking-wifi", description: "Network setup", icon: "📶", sort_order: 3 },
    { name: "Software & Web", slug: "software-web", description: "Software and websites", icon: "🌐", sort_order: 4 },
    { name: "Data Recovery", slug: "data-recovery", description: "Recover lost data", icon: "💾", sort_order: 5 },
    { name: "IT Support Packages", slug: "it-support-packages", description: "Ongoing IT support", icon: "🧰", sort_order: 6 },
    { name: "Others / General", slug: "tech-it-services-others", description: "Other IT services", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Personal & Professional Services": [
    { name: "Tutoring & Coaching", slug: "tutoring-coaching", description: "Education services", icon: "🎓", sort_order: 1 },
    { name: "Beauty & Salon", slug: "beauty-salon", description: "Salon services", icon: "💇", sort_order: 2 },
    { name: "Cleaning Services", slug: "cleaning-services", description: "Home and office cleaning", icon: "✨", sort_order: 3 },
    { name: "Event & Photography", slug: "event-photography", description: "Events and photos", icon: "📸", sort_order: 4 },
    { name: "Legal & Accounting", slug: "legal-accounting", description: "Professional services", icon: "📑", sort_order: 5 },
    { name: "Others / General", slug: "personal-professional-services-others", description: "Other services", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Others / Universal": [
    { name: "General Merchandise", slug: "general-merchandise", description: "Mixed products", icon: "🛍️", sort_order: 1 },
    { name: "Seasonal Deals", slug: "seasonal-deals", description: "Limited-time offers", icon: "🏷️", sort_order: 2 },
    { name: "Others / General", slug: "others-universal-others", description: "Everything else", icon: "📦", sort_order: 999, is_others: true },
  ],
};

export function getDefaultSubCategories(category: string): DefaultSubCategoryDef[] {
  return DEFAULT_SUB_CATEGORIES[category] ?? [
    {
      name: "Others / General",
      slug: `${category.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}-others`,
      description: `General items in ${category}`,
      icon: "📦",
      sort_order: 999,
      is_others: true,
    },
  ];
}
