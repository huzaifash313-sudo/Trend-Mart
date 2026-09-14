/**
 * Grocery starter catalog — loose / weighed staples + common kiryana items.
 *
 * Barcodes are INTERNAL shop codes (TMG-0001…), not manufacturer EAN/UPC.
 * Use for open/tol items (daal, chawal, spices) where packs have no barcode.
 * Images are licensed Unsplash food photos (category-matched), not scraped brand packs.
 */

export type GroceryStarterItem = {
  /** Internal POS scan code, e.g. TMG-0001 */
  barcode: string;
  name: string;
  /** Display / filter bucket (matched to platform sub-categories when possible) */
  subCategory: string;
  unit: string;
  description: string;
  /** Suggested PKR retail — merchant should adjust */
  price: number;
  /** Maps to GROCERY_IMAGE_BY_KEY */
  imageKey: string;
};

/** Stable Unsplash food photos — not brand packaging. */
export const GROCERY_IMAGE_BY_KEY: Record<string, string> = {
  pulses:
    "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=70",
  rice:
    "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?auto=format&fit=crop&w=600&q=70",
  flour:
    "https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=70",
  spices:
    "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=600&q=70",
  oil:
    "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=70",
  sugar:
    "https://images.unsplash.com/photo-1497534547324-0ebb3f03954a?auto=format&fit=crop&w=600&q=70",
  dairy:
    "https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=70",
  tea:
    "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=600&q=70",
  dryfruit:
    "https://images.unsplash.com/photo-1606923829579-0cb981a83e2e?auto=format&fit=crop&w=600&q=70",
  veg:
    "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=70",
  fruit:
    "https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=70",
  snack:
    "https://images.unsplash.com/photo-1621939514649-280e2ee25f60?auto=format&fit=crop&w=600&q=70",
  cleaning:
    "https://images.unsplash.com/photo-1563453392212-326f5e854473?auto=format&fit=crop&w=600&q=70",
  personal:
    "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?auto=format&fit=crop&w=600&q=70",
  beverage:
    "https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=600&q=70",
  household:
    "https://images.unsplash.com/photo-1556912173-46c336c7fd55?auto=format&fit=crop&w=600&q=70",
  baby:
    "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?auto=format&fit=crop&w=600&q=70",
  default:
    "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=70",
};

type Seed = {
  subCategory: string;
  imageKey: string;
  unit: string;
  price: number;
  description: string;
  names: string[];
};

const SEEDS: Seed[] = [
  {
    subCategory: "Pulses / Daal",
    imageKey: "pulses",
    unit: "per kg",
    price: 280,
    description: "Loose / weighed — adjust rate to your local wholesale.",
    names: [
      "Masoor Dal",
      "Masoor Dal Washed",
      "Moong Dal",
      "Moong Dal Chilka",
      "Moong Sabut",
      "Mash Dal",
      "Mash Sabut",
      "Chana Dal",
      "Chana White",
      "Chana Black (Kala Chana)",
      "Kabuli Chana",
      "Rajma Red",
      "Rajma White",
      "Lobia White",
      "Lobia Red",
      "Lobia Black",
      "Arhar / Toor Dal",
      "Urad Dal",
      "Soybean",
      "Moth Dal",
      "Kulthi Dal",
      "Mix Dal",
      "Daal Mash Special",
      "Daal Moong Special",
    ],
  },
  {
    subCategory: "Rice / Chawal",
    imageKey: "rice",
    unit: "per kg",
    price: 320,
    description: "Loose rice — set grade and rate per your stock.",
    names: [
      "Basmati Rice Super Kernel",
      "Basmati Rice 1121",
      "Basmati Rice 386",
      "Sella Rice",
      "Sella Rice Golden",
      "Irri-6 Rice",
      "Irri-9 Rice",
      "Broken Rice",
      "Brown Rice",
      "Steam Rice",
      "Kainat Rice",
      "Super Basmati",
      "Rice PK-386",
      "Rice for Biryani",
      "Rice for Pulao",
      "Local White Rice",
      "Parboiled Rice",
      "Jeera Rice Mix",
    ],
  },
  {
    subCategory: "Flour / Atta",
    imageKey: "flour",
    unit: "per kg",
    price: 140,
    description: "Loose flour / milled staples.",
    names: [
      "Wheat Atta (Chakki)",
      "Wheat Atta Fine",
      "Maida",
      "Suji / Rava",
      "Besan",
      "Besan Fine",
      "Corn Flour",
      "Rice Flour",
      "Bajra Flour",
      "Jowar Flour",
      "Barley Flour",
      "Multigrain Atta",
      "Dalia / Broken Wheat",
      "Sattu",
      "Custard Powder (loose ref)",
    ],
  },
  {
    subCategory: "Spices / Masala",
    imageKey: "spices",
    unit: "per kg",
    price: 450,
    description: "Whole / ground spices sold by weight.",
    names: [
      "Red Chilli Powder",
      "Red Chilli Whole",
      "Turmeric Powder (Haldi)",
      "Coriander Powder (Dhania)",
      "Coriander Whole",
      "Cumin (Zeera)",
      "Cumin Powder",
      "Black Pepper Whole",
      "Black Pepper Powder",
      "Garam Masala",
      "Chat Masala",
      "Chaat Masala Loose",
      "Salt Iodized",
      "Himalayan Pink Salt",
      "Rock Salt (Kala Namak)",
      "Mustard Seeds (Rai)",
      "Fennel (Saunf)",
      "Fenugreek (Methi Dana)",
      "Fenugreek Leaves Dry",
      "Cardamom Green (Elaichi)",
      "Cardamom Black",
      "Cloves (Laung)",
      "Cinnamon (Dalchini)",
      "Bay Leaf (Tez Patta)",
      "Nutmeg (Jaiphal)",
      "Mace (Javitri)",
      "Star Anise",
      "Carom Seeds (Ajwain)",
      "Nigella (Kalonji)",
      "Sesame White (Til)",
      "Sesame Black",
      "Poppy Seeds (Khashkhash)",
      "Tamarind (Imli)",
      "Amchur Powder",
      "Anardana",
      "Kasuri Methi",
      "Biryani Masala Mix",
      "Karahi Masala Mix",
      "Nihari Masala Mix",
      "Haleem Masala Mix",
      "Fish Masala Mix",
      "Chicken Masala Mix",
      "Meat Masala Mix",
      "Paya Masala Mix",
      "Achar Masala",
      "Jalapeno / Chilli Flakes",
    ],
  },
  {
    subCategory: "Oil / Ghee",
    imageKey: "oil",
    unit: "per litre",
    price: 520,
    description: "Cooking oils — open tin / litre rate.",
    names: [
      "Cooking Oil (loose / tin)",
      "Canola Oil",
      "Sunflower Oil",
      "Soybean Oil",
      "Corn Oil",
      "Mustard Oil",
      "Olive Oil (cooking)",
      "Olive Oil Extra Virgin",
      "Coconut Oil",
      "Desi Ghee",
      "Banaspati Ghee",
      "Dairy Ghee",
      "Palm Oil",
    ],
  },
  {
    subCategory: "Sugar / Sweeteners",
    imageKey: "sugar",
    unit: "per kg",
    price: 180,
    description: "Sugar and sweeteners by weight.",
    names: [
      "White Sugar",
      "Brown Sugar",
      "Caster Sugar",
      "Icing Sugar",
      "Gur / Jaggery",
      "Shakkar",
      "Misri",
      "Honey (loose)",
      "Glucose",
    ],
  },
  {
    subCategory: "Dry Fruits / Nuts",
    imageKey: "dryfruit",
    unit: "per kg",
    price: 1200,
    description: "Dry fruits sold loose by weight.",
    names: [
      "Almonds (Badam)",
      "Cashew (Kaju)",
      "Walnuts (Akhrot)",
      "Pistachio (Pista)",
      "Raisins (Kishmish)",
      "Dates (Khajoor) Loose",
      "Apricot Dry (Khurmani)",
      "Fig Dry (Anjeer)",
      "Peanuts (Moongphali)",
      "Peanuts Roasted",
      "Chilgoza",
      "Mix Dry Fruit",
      "Coconut Desiccated",
      "Coconut Whole",
    ],
  },
  {
    subCategory: "Tea / Coffee",
    imageKey: "tea",
    unit: "per kg",
    price: 900,
    description: "Loose tea / coffee by weight.",
    names: [
      "Black Tea Loose",
      "Tapal-style Loose Tea",
      "Green Tea Loose",
      "Kashmiri Tea / Pink Tea Mix",
      "Cardamom Tea Mix",
      "Coffee Powder Loose",
      "Instant Coffee Refill",
      "Tea Whitener Ref",
    ],
  },
  {
    subCategory: "Dairy & Eggs",
    imageKey: "dairy",
    unit: "per kg / unit",
    price: 220,
    description: "Common dairy — confirm unit with your supplier.",
    names: [
      "Fresh Milk (per litre)",
      "Yogurt / Dahi (per kg)",
      "Butter Loose",
      "Cream Loose",
      "Cheese Block",
      "Eggs (per dozen)",
      "Eggs Tray (30)",
      "Khoya",
      "Lassi Fresh",
    ],
  },
  {
    subCategory: "Vegetables (common)",
    imageKey: "veg",
    unit: "per kg",
    price: 80,
    description: "Daily veg — rates change daily; update often.",
    names: [
      "Potato",
      "Onion",
      "Tomato",
      "Garlic",
      "Ginger",
      "Green Chilli",
      "Coriander Fresh",
      "Mint Fresh",
      "Lemon",
      "Cucumber",
      "Carrot",
      "Peas",
      "Spinach",
      "Cabbage",
      "Cauliflower",
      "Lady Finger (Bhindi)",
      "Brinjal",
      "Bitter Gourd",
      "Bottle Gourd",
      "Pumpkin",
      "Capsicum",
      "Radish",
      "Turnip",
      "Beetroot",
      "Corn Cob",
    ],
  },
  {
    subCategory: "Fruits (common)",
    imageKey: "fruit",
    unit: "per kg",
    price: 200,
    description: "Seasonal fruit — update price frequently.",
    names: [
      "Banana",
      "Apple",
      "Orange",
      "Kinnow",
      "Mango",
      "Grapes",
      "Watermelon",
      "Melon",
      "Papaya",
      "Guava",
      "Pomegranate",
      "Pear",
      "Peach",
      "Strawberry",
      "Cherry",
    ],
  },
  {
    subCategory: "Snacks / Namkeen",
    imageKey: "snack",
    unit: "per kg",
    price: 350,
    description: "Loose namkeen / snacks by weight.",
    names: [
      "Mix Namkeen",
      "Dal Moth",
      "Chanachur",
      "Sev",
      "Gathiya",
      "Papri",
      "Bhujia",
      "Roasted Chana",
      "Murmura / Puffed Rice",
      "Popcorn Loose",
      "Biscuits Loose (per kg)",
      "Rusks Loose",
      "Candy Mix Loose",
    ],
  },
  {
    subCategory: "Cleaning / Household",
    imageKey: "cleaning",
    unit: "per kg / piece",
    price: 150,
    description: "Kiryana cleaning staples.",
    names: [
      "Washing Powder Loose",
      "Detergent Bar",
      "Dish Wash Bar",
      "Dish Wash Liquid Refill",
      "Phenyl",
      "Floor Cleaner",
      "Toilet Cleaner",
      "Soap Laundry",
      "Bleach",
      "Scrub Pad",
      "Match Box",
      "Candle",
      "Tissue Roll",
      "Garbage Bag",
      "Aluminium Foil",
      "Cling Film",
    ],
  },
  {
    subCategory: "Personal Care (kiryana)",
    imageKey: "personal",
    unit: "piece",
    price: 120,
    description: "Common cosmetics / personal care sold in grocery shops.",
    names: [
      "Bath Soap",
      "Hand Wash",
      "Shampoo Sachet Pack",
      "Shampoo Bottle",
      "Hair Oil",
      "Toothpaste",
      "Toothbrush",
      "Face Cream",
      "Body Lotion",
      "Talcum Powder",
      "Sanitary Pad Pack",
      "Cotton Pack",
      "Razors Pack",
      "Perfume Roll-on",
      "Vaseline / Petroleum Jelly",
      "Lip Balm",
      "Nail Polish Remover",
      "Baby Soap",
      "Baby Oil",
      "Diaper Pack (small)",
    ],
  },
  {
    subCategory: "Beverages (pack)",
    imageKey: "beverage",
    unit: "bottle / pack",
    price: 180,
    description:
      "Common soft drinks / juices — suggested names; replace image/barcode with your stock brand later.",
    names: [
      "Soft Drink 250ml",
      "Soft Drink 500ml",
      "Soft Drink 1 Litre",
      "Soft Drink 1.5 Litre",
      "Soft Drink 2.25 Litre",
      "Cola 1 Litre",
      "Cola 1.5 Litre",
      "Lemon Drink 1 Litre",
      "Lemon Drink 1.5 Litre",
      "Orange Drink 1 Litre",
      "Energy Drink Can",
      "Mineral Water 500ml",
      "Mineral Water 1.5 Litre",
      "Mineral Water 6L",
      "Juice Pack 200ml",
      "Juice 1 Litre",
      "Milk Pack 250ml",
      "Milk Pack 1 Litre",
      "Flavoured Milk",
      "Yogurt Drink Bottle",
    ],
  },
  {
    subCategory: "Baby & Misc",
    imageKey: "baby",
    unit: "piece / pack",
    price: 250,
    description: "Misc kiryana extras.",
    names: [
      "Baby Formula (ref)",
      "Cerelac-style Cereal (ref)",
      "Feeding Bottle",
      "Battery AA Pack",
      "Battery AAA Pack",
      "LED Bulb",
      "Extension Board",
      "Notebook",
      "Pen Pack",
      "Glue Stick",
    ],
  },
  {
    subCategory: "Meat & Frozen (common)",
    imageKey: "default",
    unit: "per kg",
    price: 650,
    description: "If your grocery also sells basic meat — optional.",
    names: [
      "Chicken Whole",
      "Chicken Boneless",
      "Mutton",
      "Beef",
      "Keema Chicken",
      "Keema Beef",
      "Fish Rohu",
      "Prawns",
      "Frozen Peas",
      "Frozen Paratha",
      "Frozen Nuggets",
    ],
  },
];

/** Half-kg variants for core staples (same internal family, different code). */
const HALF_KG_FROM = new Set([
  "Pulses / Daal",
  "Rice / Chawal",
  "Flour / Atta",
  "Spices / Masala",
  "Sugar / Sweeteners",
  "Dry Fruits / Nuts",
  "Tea / Coffee",
]);

function padCode(n: number): string {
  return `TMG-${String(n).padStart(4, "0")}`;
}

let _cache: GroceryStarterItem[] | null = null;

/**
 * Build the full grocery starter list (internal barcodes TMG-0001…).
 * Includes per-kg staples + 500g variants for weighable categories.
 */
export function getGroceryStarterPack(): GroceryStarterItem[] {
  if (_cache) return _cache;

  const items: GroceryStarterItem[] = [];
  let n = 1;

  for (const seed of SEEDS) {
    for (const rawName of seed.names) {
      const name = `${rawName} (${seed.unit})`;
      items.push({
        barcode: padCode(n++),
        name,
        subCategory: seed.subCategory,
        unit: seed.unit,
        description: seed.description,
        price: seed.price,
        imageKey: seed.imageKey,
      });

      if (HALF_KG_FROM.has(seed.subCategory) && seed.unit === "per kg") {
        items.push({
          barcode: padCode(n++),
          name: `${rawName} (500g)`,
          subCategory: seed.subCategory,
          unit: "500g",
          description: seed.description,
          price: Math.max(20, Math.round(seed.price / 2)),
          imageKey: seed.imageKey,
        });
        items.push({
          barcode: padCode(n++),
          name: `${rawName} (5kg pack)`,
          subCategory: seed.subCategory,
          unit: "5kg",
          description: seed.description,
          price: Math.round(seed.price * 5 * 0.95),
          imageKey: seed.imageKey,
        });
      }
    }
  }

  _cache = items;
  return items;
}

export function groceryStarterPackCount(): number {
  return getGroceryStarterPack().length;
}

export function groceryStarterImageUrl(imageKey: string): string {
  return GROCERY_IMAGE_BY_KEY[imageKey] || GROCERY_IMAGE_BY_KEY.default;
}
