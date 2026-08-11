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
    { name: "Frozen & Ready Meals", slug: "frozen-ready-meals", description: "Frozen meals and ready-to-cook items", icon: "🧊", sort_order: 8 },
    { name: "Meat & Chicken", slug: "meat-chicken", description: "Fresh meat and poultry", icon: "🍗", sort_order: 9 },
    { name: "Baby Food", slug: "baby-food", description: "Baby cereals and food jars", icon: "🍼", sort_order: 10 },
    { name: "Pet Food", slug: "pet-food", description: "Food for cats, dogs, and pets", icon: "🐾", sort_order: 11 },
    { name: "Instant Noodles & Pantry", slug: "instant-noodles-pantry", description: "Instant noodles and pantry packs", icon: "🍜", sort_order: 12 },
    { name: "Others / General", slug: "grocery-kiryana-others", description: "Other grocery items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Fruits & Vegetables": [
    { name: "Fresh Fruits", slug: "fresh-fruits", description: "Seasonal fruits", icon: "🍎", sort_order: 1 },
    { name: "Fresh Vegetables", slug: "fresh-vegetables", description: "Daily sabzi", icon: "🥬", sort_order: 2 },
    { name: "Leafy Greens", slug: "leafy-greens", description: "Saag and salad leaves", icon: "🥗", sort_order: 3 },
    { name: "Dry Fruits & Nuts", slug: "dry-fruits-nuts", description: "Almonds, dates, nuts", icon: "🥜", sort_order: 4 },
    { name: "Exotic & Imported", slug: "exotic-imported", description: "Imported produce", icon: "🥭", sort_order: 5 },
    { name: "Cut Fruit & Juices", slug: "cut-fruit-juices", description: "Fresh cut fruit and juices", icon: "🥤", sort_order: 6 },
    { name: "Seasonal Boxes", slug: "seasonal-boxes", description: "Curated seasonal produce boxes", icon: "🧺", sort_order: 7 },
    { name: "Others / General", slug: "fruits-vegetables-others", description: "Other produce", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Bakery & Sweets": [
    { name: "Cakes & Pastries", slug: "cakes-pastries", description: "Cakes and bakery sweets", icon: "🎂", sort_order: 1 },
    { name: "Bread & Bun", slug: "bread-bun", description: "Fresh bread", icon: "🍞", sort_order: 2 },
    { name: "Mithai & Desi Sweets", slug: "mithai-desi", description: "Traditional sweets", icon: "🍬", sort_order: 3 },
    { name: "Cookies & Rusk", slug: "cookies-rusk", description: "Biscuits and rusk", icon: "🍪", sort_order: 4 },
    { name: "Custom Orders", slug: "custom-orders", description: "Made-to-order bakery", icon: "✨", sort_order: 5 },
    { name: "Nimco & Namkeen", slug: "nimco-namkeen", description: "Savory snacks and nimco", icon: "🥨", sort_order: 6 },
    { name: "Ice Cream & Frozen Desserts", slug: "ice-cream-frozen-desserts", description: "Ice cream and chilled desserts", icon: "🍨", sort_order: 7 },
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
    { name: "Breakfast", slug: "breakfast", description: "Breakfast meals and nashta", icon: "🍳", sort_order: 9 },
    { name: "Seafood", slug: "seafood", description: "Fish, prawns, and seafood meals", icon: "🦐", sort_order: 10 },
    { name: "Healthy / Salads", slug: "healthy-salads", description: "Healthy meals and salads", icon: "🥗", sort_order: 11 },
    { name: "Desserts & Shakes", slug: "desserts-shakes", description: "Sweet treats and shakes", icon: "🥤", sort_order: 12 },
    { name: "Others / General", slug: "fast-food-restaurants-others", description: "Other food items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Pharmacy & Medical": [
    { name: "Medicines", slug: "medicines", description: "OTC and prescription", icon: "💊", sort_order: 1 },
    { name: "First Aid", slug: "first-aid", description: "Bandages and kits", icon: "🩹", sort_order: 2 },
    { name: "Vitamins & Supplements", slug: "vitamins-supplements", description: "Health supplements", icon: "🧴", sort_order: 3 },
    { name: "Baby Care", slug: "pharma-baby-care", description: "Baby health products", icon: "🍼", sort_order: 4 },
    { name: "Personal Care", slug: "pharma-personal-care", description: "Hygiene products", icon: "🧼", sort_order: 5 },
    { name: "Medical Devices", slug: "medical-devices", description: "Meters, monitors, and devices", icon: "🩺", sort_order: 6 },
    { name: "Women's Health", slug: "womens-health", description: "Women's health essentials", icon: "🌸", sort_order: 7 },
    { name: "Elderly Care", slug: "elderly-care", description: "Senior care and mobility support", icon: "🧓", sort_order: 8 },
    { name: "Others / General", slug: "pharmacy-medical-others", description: "Other medical items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Fashion & Apparel": [
    { name: "Men's Wear", slug: "mens-wear", description: "Clothes for men", icon: "👔", sort_order: 1 },
    { name: "Women's Wear", slug: "womens-wear", description: "Clothes for women", icon: "👗", sort_order: 2 },
    { name: "Kids Wear", slug: "kids-wear", description: "Clothes for kids", icon: "🧒", sort_order: 3 },
    { name: "Footwear", slug: "footwear", description: "Shoes and sandals", icon: "👟", sort_order: 4 },
    { name: "Bags & Accessories", slug: "bags-accessories", description: "Bags and fashion extras", icon: "👜", sort_order: 5 },
    { name: "Unstitched / Lawn", slug: "unstitched-lawn", description: "Unstitched fabric and lawn suits", icon: "🧵", sort_order: 6 },
    { name: "Eastern Wear & Abaya", slug: "eastern-wear-abaya", description: "Eastern outfits and abayas", icon: "🧕", sort_order: 7 },
    { name: "Watches", slug: "watches", description: "Wrist watches and timepieces", icon: "⌚", sort_order: 8 },
    { name: "Undergarments", slug: "undergarments", description: "Innerwear and essentials", icon: "🧦", sort_order: 9 },
    { name: "Others / General", slug: "fashion-apparel-others", description: "Other fashion items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Electronics & Gadgets": [
    { name: "Mobiles & Accessories", slug: "mobiles-accessories", description: "Phones and accessories", icon: "📱", sort_order: 1 },
    { name: "Audio & Earbuds", slug: "audio-earbuds", description: "Headphones and speakers", icon: "🎧", sort_order: 2 },
    { name: "Computers & Laptops", slug: "computers-laptops", description: "PCs and laptops", icon: "💻", sort_order: 3 },
    { name: "Smart Home", slug: "smart-home", description: "Smart devices", icon: "🏠", sort_order: 4 },
    { name: "Power Banks & Cables", slug: "power-cables", description: "Charging gear", icon: "🔌", sort_order: 5 },
    { name: "Gaming", slug: "gaming", description: "Gaming gear and accessories", icon: "🎮", sort_order: 6 },
    { name: "Wearables", slug: "wearables", description: "Smart watches and wearable tech", icon: "⌚", sort_order: 7 },
    { name: "Cameras", slug: "cameras", description: "Cameras and photography gear", icon: "📷", sort_order: 8 },
    { name: "Others / General", slug: "electronics-gadgets-others", description: "Other gadgets", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Home & Living": [
    { name: "Kitchen & Dining", slug: "kitchen-dining", description: "Kitchenware", icon: "🍽️", sort_order: 1 },
    { name: "Furniture", slug: "furniture", description: "Home furniture", icon: "🛋️", sort_order: 2 },
    { name: "Decor & Lighting", slug: "decor-lighting", description: "Home decor", icon: "💡", sort_order: 3 },
    { name: "Bedding & Bath", slug: "bedding-bath", description: "Bed and bath linen", icon: "🛏️", sort_order: 4 },
    { name: "Storage & Organizers", slug: "storage-organizers", description: "Storage solutions", icon: "📦", sort_order: 5 },
    { name: "Small Appliances", slug: "small-appliances", description: "Small home and kitchen appliances", icon: "🔌", sort_order: 6 },
    { name: "Cleaning Tools", slug: "cleaning-tools", description: "Mops, brushes, and cleaning tools", icon: "🧽", sort_order: 7 },
    { name: "Others / General", slug: "home-living-others", description: "Other home items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Health & Beauty": [
    { name: "Skincare", slug: "skincare", description: "Face and body care", icon: "✨", sort_order: 1 },
    { name: "Makeup", slug: "makeup", description: "Cosmetics", icon: "💄", sort_order: 2 },
    { name: "Hair Care", slug: "hair-care", description: "Hair products", icon: "💇", sort_order: 3 },
    { name: "Fragrance", slug: "fragrance", description: "Perfumes and attar", icon: "🌸", sort_order: 4 },
    { name: "Personal Hygiene", slug: "personal-hygiene", description: "Daily hygiene", icon: "🪥", sort_order: 5 },
    { name: "Men's Grooming", slug: "mens-grooming", description: "Beard, shave, and grooming items", icon: "🪒", sort_order: 6 },
    { name: "Organic / Herbal", slug: "organic-herbal", description: "Organic and herbal care", icon: "🌿", sort_order: 7 },
    { name: "Others / General", slug: "health-beauty-others", description: "Other beauty items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Books & Stationery": [
    { name: "School Books", slug: "school-books", description: "Academic books", icon: "📖", sort_order: 1 },
    { name: "Novels & Magazines", slug: "novels-magazines", description: "Reading material", icon: "📚", sort_order: 2 },
    { name: "Notebooks & Pens", slug: "notebooks-pens", description: "Stationery basics", icon: "✏️", sort_order: 3 },
    { name: "Art Supplies", slug: "art-supplies", description: "Drawing and crafts", icon: "🎨", sort_order: 4 },
    { name: "Office Supplies", slug: "office-supplies", description: "Office stationery", icon: "📎", sort_order: 5 },
    { name: "Islamic Books", slug: "islamic-books", description: "Quran, hadith, and Islamic books", icon: "🕌", sort_order: 6 },
    { name: "Exam & Test Prep", slug: "exam-test-prep", description: "Entry test and exam preparation", icon: "📝", sort_order: 7 },
    { name: "Others / General", slug: "books-stationery-others", description: "Other stationery", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Sports & Fitness": [
    { name: "Gym & Fitness", slug: "gym-fitness", description: "Gym gear", icon: "🏋️", sort_order: 1 },
    { name: "Outdoor Sports", slug: "outdoor-sports", description: "Cricket, football, etc.", icon: "⚽", sort_order: 2 },
    { name: "Sportswear", slug: "sportswear", description: "Activewear", icon: "👕", sort_order: 3 },
    { name: "Nutrition", slug: "sports-nutrition", description: "Protein and supplements", icon: "🥤", sort_order: 4 },
    { name: "Cricket", slug: "cricket", description: "Cricket bats, balls, and gear", icon: "🏏", sort_order: 5 },
    { name: "Cycling", slug: "cycling", description: "Bicycles and cycling accessories", icon: "🚲", sort_order: 6 },
    { name: "Others / General", slug: "sports-fitness-others", description: "Other sports items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Toys & Baby Care": [
    { name: "Toys & Games", slug: "toys-games", description: "Kids toys", icon: "🧸", sort_order: 1 },
    { name: "Baby Clothing", slug: "baby-clothing", description: "Infant wear", icon: "👶", sort_order: 2 },
    { name: "Diapers & Feeding", slug: "diapers-feeding", description: "Feeding and diapers", icon: "🍼", sort_order: 3 },
    { name: "Nursery Essentials", slug: "nursery-essentials", description: "Nursery products", icon: "🛏️", sort_order: 4 },
    { name: "Educational Toys", slug: "educational-toys", description: "Learning toys and activities", icon: "🧩", sort_order: 5 },
    { name: "Strollers & Gear", slug: "strollers-gear", description: "Strollers and baby travel gear", icon: "🛒", sort_order: 6 },
    { name: "Others / General", slug: "toys-baby-care-others", description: "Other baby items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Automotive Accessories": [
    { name: "Car Care", slug: "car-care", description: "Cleaning and polish", icon: "🧽", sort_order: 1 },
    { name: "Interior Accessories", slug: "interior-accessories", description: "Seat covers and mats", icon: "💺", sort_order: 2 },
    { name: "Electronics & Audio", slug: "auto-electronics", description: "Car electronics", icon: "📻", sort_order: 3 },
    { name: "Bike Accessories", slug: "bike-accessories", description: "Motorcycle gear", icon: "🏍️", sort_order: 4 },
    { name: "Tools & Spare Parts", slug: "tools-spare-parts", description: "Tools and parts", icon: "🔧", sort_order: 5 },
    { name: "Tyres & Batteries", slug: "tyres-batteries", description: "Vehicle tyres and batteries", icon: "🔋", sort_order: 6 },
    { name: "Helmets & Safety", slug: "helmets-safety", description: "Helmets and road safety gear", icon: "🪖", sort_order: 7 },
    { name: "Others / General", slug: "automotive-accessories-others", description: "Other auto items", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Handmade & Crafts": [
    { name: "Handmade Decor", slug: "handmade-decor", description: "Handcrafted decor", icon: "🏺", sort_order: 1 },
    { name: "Jewelry & Accessories", slug: "handmade-jewelry", description: "Handmade jewelry", icon: "💍", sort_order: 2 },
    { name: "Custom Gifts", slug: "custom-gifts", description: "Personalized gifts", icon: "🎁", sort_order: 3 },
    { name: "Art & Paintings", slug: "art-paintings", description: "Original art", icon: "🖼️", sort_order: 4 },
    { name: "Embroidery / Ajrak / Khussa", slug: "embroidery-ajrak-khussa", description: "Local embroidery, ajrak, and khussa", icon: "🧶", sort_order: 5 },
    { name: "Mehndi Props", slug: "mehndi-props", description: "Mehndi decor and event props", icon: "🎀", sort_order: 6 },
    { name: "Others / General", slug: "handmade-crafts-others", description: "Other crafts", icon: "📦", sort_order: 999, is_others: true },
  ],
  "Home Maintenance & Repair": [
    { name: "Plumbing", slug: "plumbing", description: "Plumber services", icon: "🚰", sort_order: 1 },
    { name: "Electrical", slug: "electrical", description: "Electrician services", icon: "⚡", sort_order: 2 },
    { name: "AC & Cooling", slug: "ac-cooling", description: "AC repair and install", icon: "❄️", sort_order: 3 },
    { name: "Carpentry & Furniture", slug: "carpentry-furniture", description: "Wood and furniture work", icon: "🪵", sort_order: 4 },
    { name: "Painting & Renovation", slug: "painting-renovation", description: "Paint and remodel", icon: "🖌️", sort_order: 5 },
    { name: "Pest Control", slug: "pest-control", description: "Pest control services", icon: "🐜", sort_order: 6 },
    { name: "Deep Cleaning", slug: "deep-cleaning", description: "Deep cleaning for homes and offices", icon: "🧼", sort_order: 7 },
    { name: "Generator / UPS", slug: "generator-ups", description: "Generator and UPS repair", icon: "🔋", sort_order: 8 },
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
    { name: "Tailoring", slug: "tailoring", description: "Tailoring and alterations", icon: "🪡", sort_order: 6 },
    { name: "Laundry / Dry Clean", slug: "laundry-dry-clean", description: "Laundry and dry cleaning", icon: "👕", sort_order: 7 },
    { name: "Packers & Movers", slug: "packers-movers", description: "Moving and packing services", icon: "📦", sort_order: 8 },
    { name: "Driving School", slug: "driving-school", description: "Driving lessons and training", icon: "🚗", sort_order: 9 },
    { name: "Bridal / Mehndi", slug: "bridal-mehndi", description: "Bridal and mehndi services", icon: "💐", sort_order: 10 },
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
