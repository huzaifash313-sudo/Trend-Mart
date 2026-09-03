/* -------------------------------------------------------------------------- */
/*  Category → variant templates (client-only presets, no DB change)           */
/*  One pack per real merchant use-case; everything editable / skippable.      */
/* -------------------------------------------------------------------------- */

import type { VariantGroup } from "@/types";
import { PRODUCT_CATEGORIES } from "@/types";

export interface VariantTemplatePack {
  id: string;
  /** Short button label, e.g. "Size + Color" */
  label: string;
  /** One-line helper under the button */
  hint: string;
  groups: VariantGroup[];
}

function opts(...labels: string[]): VariantGroup["options"] {
  return labels.map((label) => ({ label, is_available: true }));
}

function group(name: string, labels: string[]): VariantGroup {
  return { name, options: opts(...labels) };
}

/** Deep-clone groups so rows / forms never share references. */
export function cloneVariantGroups(groups: VariantGroup[]): VariantGroup[] {
  return JSON.parse(JSON.stringify(groups)) as VariantGroup[];
}

function groupNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Add groups from `incoming` without replacing existing ones (matched by name).
 * Lets merchants stack Portion + Spice + Add-ons instead of picking one pack.
 */
export function mergeVariantGroups(
  existing: VariantGroup[],
  incoming: VariantGroup[],
): VariantGroup[] {
  const result = cloneVariantGroups(existing);
  const seen = new Set(result.map((g) => groupNameKey(g.name)));

  for (const group of incoming) {
    const name = group.name.trim();
    const key = groupNameKey(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(cloneVariantGroups([group])[0]!);
  }

  return result;
}

/** Build a ready-to-edit group from a preset label (Size, Portion, …). */
export function createGroupFromPreset(name: string): VariantGroup | null {
  const clean = name.trim();
  if (!clean) return null;
  const pool = getOptionPoolForGroup(clean);
  return {
    name: clean,
    options: pool.length
      ? pool.map((label) => ({ label, is_available: true }))
      : [],
  };
}

/** Unique single-group names suggested for this shop category. */
export function getQuickGroupNamesForCategory(category?: string | null): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const pack of getVariantTemplates(category)) {
    for (const group of pack.groups) {
      const clean = group.name.trim();
      const key = groupNameKey(clean);
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      names.push(clean);
    }
  }
  return names;
}

/** Single-group shortcuts (Size only, Flavour, Portion, …) — easiest path. */
export function getSimpleTemplates(category?: string | null): VariantTemplatePack[] {
  return getVariantTemplates(category).filter((pack) => pack.groups.length === 1);
}

/** Multi-group shortcuts (Portion + Spice, Size + Color, …). */
export function getComboTemplates(category?: string | null): VariantTemplatePack[] {
  return getVariantTemplates(category).filter((pack) => pack.groups.length > 1);
}

/** One-line empty-state hint for the product editor. */
export function categoryVariantHint(category?: string | null): string {
  const key = (category ?? "").trim();
  const hints: Record<string, string> = {
    "Fashion & Apparel": "Size, color, ya shoe size — simple se shuru karo.",
    "Fast Food & Restaurants": "Portion, spice, ya flavour — sirf ek type bhi chalega.",
    "Grocery & Kiryana": "Weight, pack, ya flavour — mix sirf zarurat pe.",
    "Bakery & Sweets": "Cake size, flavour, ya weight — simple option pehle.",
    "Fruits & Vegetables": "Weight ya dozen — bilkul simple.",
    "Electronics & Gadgets": "Color, storage, ya warranty — ek type kaafi.",
    "Health & Beauty": "Shade, scent, ya bottle size — simple se start.",
    "Home & Living": "Color, bed size, ya set — jo chahiye woh tap karo.",
    "Pharmacy & Medical": "Strength, pack, ya form — medicine SKU easy.",
    "Books & Stationery": "Color, pack, ya pages — optional.",
    "Sports & Fitness": "Size, shoe size, ya weight — sports wear easy.",
    "Toys & Baby Care": "Age, diaper size, ya color — kids items.",
    "Automotive Accessories": "Vehicle fit, size, ya oil volume.",
    "Handmade & Crafts": "Size, color, ya set — handmade pieces.",
    "Home Maintenance & Repair": "Duration ya package — service plans.",
    "Security & Surveillance": "Camera pack ya package.",
    "Tech & IT Services": "Package ya duration — service tiers.",
    "Personal & Professional Services": "Package, visit, ya duration.",
  };
  return (
    hints[key] ??
    "Sirf zarurat ho to options add karo. Simple (1 type) ya mix (2 types) — dono chalenge."
  );
}

/** Common option pools — used for quick-add chips inside the editor. */
export const OPTION_POOLS: Record<string, string[]> = {
  /* Fashion / general apparel */
  Size: ["XS", "S", "M", "L", "XL", "XXL", "3XL"],
  "Kids Size": ["0-3M", "3-6M", "6-12M", "1-2Y", "2-3Y", "3-4Y", "5-6Y", "7-8Y", "9-10Y"],
  "Shoe Size": ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45"],
  Color: [
    "Black",
    "White",
    "Red",
    "Blue",
    "Green",
    "Navy",
    "Beige",
    "Brown",
    "Pink",
    "Grey",
    "Maroon",
    "Yellow",
    "Purple",
    "Orange",
    "Gold",
    "Silver",
  ],
  Material: ["Cotton", "Lawn", "Linen", "Silk", "Chiffon", "Denim", "Polyester", "Wool", "Leather"],
  Set: ["1 piece", "2 piece", "3 piece", "Unstitched", "Stitched"],

  /* Food */
  Portion: ["Small", "Regular", "Large", "Family", "Party"],
  "Spice Level": ["Mild", "Medium", "Spicy", "Extra Spicy"],
  Flavour: [
    "Original",
    "Onion",
    "Apple",
    "Aloe",
    "Honey",
    "Coconut",
    "Menthol",
    "Lemon",
    "Chocolate",
    "Vanilla",
    "Strawberry",
    "Mango",
    "Chicken",
    "Beef",
    "Mutton",
    "Veg",
    "BBQ",
  ],
  Crust: ["Thin", "Thick", "Cheese burst", "Stuffed"],
  "Add-ons": [
    "Extra cheese",
    "Extra sauce",
    "No onion",
    "Extra topping",
    "Extra meat",
    "Drink add-on",
  ],

  /* Grocery / produce / bakery */
  Weight: ["250g", "500g", "1kg", "2kg", "5kg", "10kg"],
  "Produce Weight": ["250g", "500g", "1kg", "2kg", "5kg", "Per piece"],
  Pack: ["Single", "Pack of 3", "Pack of 6", "Pack of 12", "Box", "Dozen"],
  Volume: ["250ml", "500ml", "1L", "1.5L", "2L", "5L"],
  "Piece Size": ["1 pc", "Half dozen", "1 dozen", "2 dozen"],
  "Cake Size": ["0.5 pound", "1 pound", "1.5 pound", "2 pound", "3 pound", "Custom"],
  Grade: ["A grade", "B grade", "Premium", "Economy"],

  /* Electronics */
  Storage: ["32GB", "64GB", "128GB", "256GB", "512GB", "1TB"],
  RAM: ["4GB", "6GB", "8GB", "12GB", "16GB", "32GB"],
  Network: ["4G", "5G", "Wi-Fi only"],
  Warranty: ["No warranty", "3 months", "6 months", "1 year", "2 years"],

  /* Beauty / pharmacy */
  Shade: ["Fair", "Light", "Medium", "Tan", "Deep", "01", "02", "03", "04", "05"],
  "Beauty Volume": ["15ml", "30ml", "50ml", "100ml", "200ml", "500ml"],
  Scent: ["Floral", "Fresh", "Woody", "Citrus", "Musk", "Unscented"],
  "Hair Type": ["All", "Oily", "Dry", "Normal", "Colored", "Damaged"],
  Strength: ["250mg", "500mg", "650mg", "1g", "5ml", "10ml"],
  Form: ["Tablet", "Capsule", "Syrup", "Cream", "Drops", "Injection"],
  "Pharma Pack": ["Strip", "Bottle", "Box", "Tube", "Pack of 10", "Pack of 30"],

  /* Home */
  "Bed Size": ["Single", "Double", "Queen", "King"],
  "Home Size": ["Small", "Medium", "Large", "XL"],
  Capacity: ["1.5L", "2L", "3L", "5L", "10L", "20L"],
  Pieces: ["1 pc", "2 pcs", "4 pcs", "6 pcs", "12 pcs", "24 pcs"],

  /* Sports */
  "Sports Size": ["XS", "S", "M", "L", "XL", "XXL"],
  Resistance: ["Light", "Medium", "Heavy", "Extra Heavy"],
  "Equipment Weight": ["1kg", "2kg", "5kg", "10kg", "15kg", "20kg"],

  /* Baby / toys */
  Age: ["0-1 yr", "1-3 yr", "3-5 yr", "5-8 yr", "8-12 yr", "12+ yr"],
  "Diaper Size": ["NB", "S", "M", "L", "XL", "XXL"],

  /* Auto */
  "Vehicle Fit": [
    "Universal",
    "Car",
    "Bike / Motorcycle",
    "Suzuki",
    "Toyota",
    "Honda",
    "Hyundai",
    "Other",
  ],
  "Auto Size": ["S", "M", "L", "XL", "Custom fit"],

  /* Stationery */
  Ruling: ["Plain", "Ruled", "Grid", "Dotted"],
  "Page Count": ["40 pages", "80 pages", "100 pages", "200 pages", "300 pages"],
  Language: ["English", "Urdu", "Bilingual"],

  /* Services */
  Duration: ["30 min", "1 hour", "2 hours", "Half day", "Full day", "Per visit"],
  Package: ["Basic", "Standard", "Premium", "Custom"],
  "Visit Type": ["One-time", "Weekly", "Monthly", "Emergency"],
  "Camera Pack": ["1 camera", "2 cameras", "4 cameras", "8 cameras", "16 cameras"],
  "Service Type": ["At shop", "At home", "Online", "On-site"],
};

const SIZE = () => group("Size", OPTION_POOLS.Size);
const KIDS_SIZE = () => group("Kids Size", OPTION_POOLS["Kids Size"]);
const SHOE_SIZE = () => group("Shoe Size", OPTION_POOLS["Shoe Size"]);
const COLOR = () => group("Color", OPTION_POOLS.Color);
const MATERIAL = () => group("Material", OPTION_POOLS.Material);
const SET = () => group("Set", OPTION_POOLS.Set);
const PORTION = () => group("Portion", OPTION_POOLS.Portion);
const SPICE = () => group("Spice Level", OPTION_POOLS["Spice Level"]);
const FLAVOUR = () => group("Flavour", OPTION_POOLS.Flavour);
const CRUST = () => group("Crust", OPTION_POOLS.Crust);
const ADDONS = () => group("Add-ons", OPTION_POOLS["Add-ons"]);
const STORAGE = () => group("Storage", OPTION_POOLS.Storage);
const RAM = () => group("RAM", OPTION_POOLS.RAM);
const NETWORK = () => group("Network", OPTION_POOLS.Network);
const WARRANTY = () => group("Warranty", OPTION_POOLS.Warranty);
const WEIGHT = () => group("Weight", OPTION_POOLS.Weight);
const PRODUCE_WEIGHT = () => group("Weight", OPTION_POOLS["Produce Weight"]);
const PACK = () => group("Pack", OPTION_POOLS.Pack);
const VOLUME = () => group("Volume", OPTION_POOLS.Volume);
const PIECE = () => group("Piece Size", OPTION_POOLS["Piece Size"]);
const CAKE_SIZE = () => group("Cake Size", OPTION_POOLS["Cake Size"]);
const GRADE = () => group("Grade", OPTION_POOLS.Grade);
const SHADE = () => group("Shade", OPTION_POOLS.Shade);
const BEAUTY_VOLUME = () => group("Volume", OPTION_POOLS["Beauty Volume"]);
const SCENT = () => group("Scent", OPTION_POOLS.Scent);
const HAIR_TYPE = () => group("Hair Type", OPTION_POOLS["Hair Type"]);
const STRENGTH = () => group("Strength", OPTION_POOLS.Strength);
const FORM = () => group("Form", OPTION_POOLS.Form);
const PHARMA_PACK = () => group("Pack", OPTION_POOLS["Pharma Pack"]);
const BED_SIZE = () => group("Bed Size", OPTION_POOLS["Bed Size"]);
const HOME_SIZE = () => group("Size", OPTION_POOLS["Home Size"]);
const CAPACITY = () => group("Capacity", OPTION_POOLS.Capacity);
const PIECES = () => group("Pieces", OPTION_POOLS.Pieces);
const SPORTS_SIZE = () => group("Size", OPTION_POOLS["Sports Size"]);
const RESISTANCE = () => group("Resistance", OPTION_POOLS.Resistance);
const EQUIP_WEIGHT = () => group("Weight", OPTION_POOLS["Equipment Weight"]);
const AGE = () => group("Age", OPTION_POOLS.Age);
const DIAPER = () => group("Diaper Size", OPTION_POOLS["Diaper Size"]);
const VEHICLE = () => group("Vehicle Fit", OPTION_POOLS["Vehicle Fit"]);
const AUTO_SIZE = () => group("Size", OPTION_POOLS["Auto Size"]);
const RULING = () => group("Ruling", OPTION_POOLS.Ruling);
const PAGES = () => group("Page Count", OPTION_POOLS["Page Count"]);
const LANGUAGE = () => group("Language", OPTION_POOLS.Language);
const DURATION = () => group("Duration", OPTION_POOLS.Duration);
const PACKAGE = () => group("Package", OPTION_POOLS.Package);
const VISIT = () => group("Visit Type", OPTION_POOLS["Visit Type"]);
const CAMERAS = () => group("Camera Pack", OPTION_POOLS["Camera Pack"]);
const SERVICE_TYPE = () => group("Service Type", OPTION_POOLS["Service Type"]);

function packs(
  ...items: Array<{ id: string; label: string; hint: string; groups: VariantGroup[] }>
): VariantTemplatePack[] {
  return items;
}

/** Fallback when shop category is unknown / Others. */
const GENERIC_PACKS = packs(
  {
    id: "size-color",
    label: "Size + Color",
    hint: "Clothes, shoes, accessories",
    groups: [SIZE(), COLOR()],
  },
  {
    id: "size-only",
    label: "Size only",
    hint: "One size chart",
    groups: [SIZE()],
  },
  {
    id: "color-only",
    label: "Color only",
    hint: "Same item, different colors",
    groups: [COLOR()],
  },
  {
    id: "portion",
    label: "Portion",
    hint: "Small / Regular / Large",
    groups: [PORTION()],
  },
  {
    id: "weight-pack",
    label: "Weight + Pack",
    hint: "Grocery-style packs",
    groups: [WEIGHT(), PACK()],
  },
  {
    id: "package",
    label: "Package",
    hint: "Basic / Standard / Premium",
    groups: [PACKAGE()],
  },
);

const BY_CATEGORY: Record<string, VariantTemplatePack[]> = {
  "Fashion & Apparel": packs(
    {
      id: "fashion-size-color",
      label: "Size + Color",
      hint: "Ready-made clothes, jeans, tops",
      groups: [SIZE(), COLOR()],
    },
    {
      id: "fashion-size",
      label: "Size only",
      hint: "Same color, many sizes",
      groups: [SIZE()],
    },
    {
      id: "fashion-color",
      label: "Color only",
      hint: "Dupattas, one-size items",
      groups: [COLOR()],
    },
    {
      id: "fashion-shoe",
      label: "Shoe size + Color",
      hint: "Shoes, sandals, slippers",
      groups: [SHOE_SIZE(), COLOR()],
    },
    {
      id: "fashion-kids",
      label: "Kids size + Color",
      hint: "Kids & baby wear",
      groups: [KIDS_SIZE(), COLOR()],
    },
    {
      id: "fashion-set-color",
      label: "Set + Color",
      hint: "2/3 piece suits, unstitched",
      groups: [SET(), COLOR()],
    },
    {
      id: "fashion-material",
      label: "Material + Color",
      hint: "Fabric / lawn by meter",
      groups: [MATERIAL(), COLOR()],
    },
  ),

  "Handmade & Crafts": packs(
    {
      id: "craft-size-color",
      label: "Size + Color",
      hint: "Handmade wearables",
      groups: [SIZE(), COLOR()],
    },
    {
      id: "craft-color",
      label: "Color only",
      hint: "Same design, colors",
      groups: [COLOR()],
    },
    {
      id: "craft-material-color",
      label: "Material + Color",
      hint: "Craft materials",
      groups: [MATERIAL(), COLOR()],
    },
    {
      id: "craft-set",
      label: "Set / Pieces",
      hint: "Gift sets, multi-piece",
      groups: [PIECES()],
    },
    {
      id: "craft-size",
      label: "Size only",
      hint: "Custom sized pieces",
      groups: [HOME_SIZE()],
    },
  ),

  "Sports & Fitness": packs(
    {
      id: "sports-size-color",
      label: "Size + Color",
      hint: "Kits, jerseys, wear",
      groups: [SPORTS_SIZE(), COLOR()],
    },
    {
      id: "sports-shoe",
      label: "Shoe size + Color",
      hint: "Sports shoes",
      groups: [SHOE_SIZE(), COLOR()],
    },
    {
      id: "sports-size",
      label: "Size only",
      hint: "Gloves, apparel",
      groups: [SPORTS_SIZE()],
    },
    {
      id: "sports-weight",
      label: "Equipment weight",
      hint: "Dumbbells, plates",
      groups: [EQUIP_WEIGHT()],
    },
    {
      id: "sports-resistance",
      label: "Resistance",
      hint: "Bands, levels",
      groups: [RESISTANCE()],
    },
    {
      id: "sports-color",
      label: "Color only",
      hint: "Accessories, balls",
      groups: [COLOR()],
    },
  ),

  "Toys & Baby Care": packs(
    {
      id: "baby-kids-color",
      label: "Kids size + Color",
      hint: "Baby / kids clothes",
      groups: [KIDS_SIZE(), COLOR()],
    },
    {
      id: "baby-diaper",
      label: "Diaper size",
      hint: "Diapers & pull-ups",
      groups: [DIAPER()],
    },
    {
      id: "baby-age",
      label: "Age group",
      hint: "Toys by age",
      groups: [AGE()],
    },
    {
      id: "baby-age-color",
      label: "Age + Color",
      hint: "Toys with colors",
      groups: [AGE(), COLOR()],
    },
    {
      id: "baby-pack",
      label: "Pack size",
      hint: "Wipes, bottles, multipacks",
      groups: [PACK()],
    },
    {
      id: "baby-color",
      label: "Color only",
      hint: "Same toy / item colors",
      groups: [COLOR()],
    },
  ),

  "Fast Food & Restaurants": packs(
    {
      id: "food-portion",
      label: "Portion",
      hint: "Small / Regular / Large / Family",
      groups: [PORTION()],
    },
    {
      id: "food-spice",
      label: "Spice level",
      hint: "Mild → Extra spicy",
      groups: [SPICE()],
    },
    {
      id: "food-portion-spice",
      label: "Portion + Spice",
      hint: "Full meal options",
      groups: [PORTION(), SPICE()],
    },
    {
      id: "food-flavour",
      label: "Flavour",
      hint: "Drinks, burgers, BBQ",
      groups: [FLAVOUR()],
    },
    {
      id: "food-portion-flavour",
      label: "Portion + Flavour",
      hint: "Pizzas, rolls, wraps",
      groups: [PORTION(), FLAVOUR()],
    },
    {
      id: "food-crust",
      label: "Crust + Size",
      hint: "Pizza crust options",
      groups: [CRUST(), PORTION()],
    },
    {
      id: "food-addons",
      label: "Add-ons",
      hint: "Extras customer can pick",
      groups: [ADDONS()],
    },
  ),

  "Bakery & Sweets": packs(
    {
      id: "bakery-cake",
      label: "Cake size",
      hint: "0.5 → 3 pound cakes",
      groups: [CAKE_SIZE()],
    },
    {
      id: "bakery-cake-flavour",
      label: "Cake size + Flavour",
      hint: "Birthday / custom cakes",
      groups: [CAKE_SIZE(), FLAVOUR()],
    },
    {
      id: "bakery-piece",
      label: "Piece / dozen",
      hint: "Mithai, cookies, pastries",
      groups: [PIECE()],
    },
    {
      id: "bakery-flavour",
      label: "Flavour",
      hint: "Sweets & desserts",
      groups: [FLAVOUR()],
    },
    {
      id: "bakery-weight",
      label: "Weight",
      hint: "Halwa, barfi by kg",
      groups: [WEIGHT()],
    },
    {
      id: "bakery-pack",
      label: "Pack / box",
      hint: "Gift boxes, packs",
      groups: [PACK()],
    },
  ),

  "Grocery & Kiryana": packs(
    {
      id: "grocery-weight",
      label: "Weight",
      hint: "Atta, sugar, rice, spices",
      groups: [WEIGHT()],
    },
    {
      id: "grocery-volume",
      label: "Volume (litre)",
      hint: "Oil, milk, drinks",
      groups: [VOLUME()],
    },
    {
      id: "grocery-pack",
      label: "Pack size",
      hint: "Soap, noodles, multipacks",
      groups: [PACK()],
    },
    {
      id: "grocery-weight-pack",
      label: "Weight + Pack",
      hint: "Both together",
      groups: [WEIGHT(), PACK()],
    },
    {
      id: "grocery-flavour",
      label: "Flavour / type",
      hint: "Tea, biscuits, snacks, shampoo",
      groups: [FLAVOUR()],
    },
    {
      id: "grocery-flavour-volume",
      label: "Flavour + Size",
      hint: "Shampoo / soap: 5 flavours × 2 bottles",
      groups: [FLAVOUR(), VOLUME()],
    },
  ),

  "Fruits & Vegetables": packs(
    {
      id: "produce-weight",
      label: "Weight",
      hint: "Per kg / half kg / piece",
      groups: [PRODUCE_WEIGHT()],
    },
    {
      id: "produce-dozen",
      label: "Dozen / pack",
      hint: "Eggs, bananas, trays",
      groups: [PACK()],
    },
    {
      id: "produce-grade",
      label: "Grade + Weight",
      hint: "Premium vs economy",
      groups: [GRADE(), PRODUCE_WEIGHT()],
    },
    {
      id: "produce-piece",
      label: "Piece size",
      hint: "Watermelon, coconut, etc.",
      groups: [PIECE()],
    },
  ),

  "Electronics & Gadgets": packs(
    {
      id: "elec-color",
      label: "Color only",
      hint: "Cables, cases, earbuds",
      groups: [COLOR()],
    },
    {
      id: "elec-storage",
      label: "Storage only",
      hint: "64GB / 128GB / 256GB",
      groups: [STORAGE()],
    },
    {
      id: "elec-warranty",
      label: "Warranty",
      hint: "Refurbished / used gear",
      groups: [WARRANTY()],
    },
    {
      id: "elec-storage-color",
      label: "Storage + Color",
      hint: "Phones & tablets",
      groups: [STORAGE(), COLOR()],
    },
    {
      id: "elec-storage-ram",
      label: "Storage + RAM",
      hint: "Laptops / phones",
      groups: [STORAGE(), RAM()],
    },
    {
      id: "elec-full-phone",
      label: "Storage + RAM + Color",
      hint: "Full phone SKU",
      groups: [STORAGE(), RAM(), COLOR()],
    },
    {
      id: "elec-network",
      label: "Network + Storage",
      hint: "4G / 5G / Wi-Fi",
      groups: [NETWORK(), STORAGE()],
    },
  ),

  "Health & Beauty": packs(
    {
      id: "beauty-flavour",
      label: "Flavour / type",
      hint: "Shampoo, soap, face wash types",
      groups: [FLAVOUR()],
    },
    {
      id: "beauty-shade",
      label: "Shade",
      hint: "Foundation, lipstick, powder",
      groups: [SHADE()],
    },
    {
      id: "beauty-volume",
      label: "Volume / size",
      hint: "Creams, serums, bottles",
      groups: [BEAUTY_VOLUME()],
    },
    {
      id: "beauty-shade-volume",
      label: "Shade + Volume",
      hint: "Full beauty SKU",
      groups: [SHADE(), BEAUTY_VOLUME()],
    },
    {
      id: "beauty-scent",
      label: "Scent",
      hint: "Perfume, body spray",
      groups: [SCENT()],
    },
    {
      id: "beauty-scent-volume",
      label: "Scent + Volume",
      hint: "Perfume bottle sizes",
      groups: [SCENT(), BEAUTY_VOLUME()],
    },
    {
      id: "beauty-flavour-volume",
      label: "Flavour + Size",
      hint: "Shampoo: flavours × bottle sizes",
      groups: [FLAVOUR(), BEAUTY_VOLUME()],
    },
    {
      id: "beauty-hair",
      label: "Hair type",
      hint: "Shampoo / hair care",
      groups: [HAIR_TYPE()],
    },
    {
      id: "beauty-color",
      label: "Color",
      hint: "Nail paint, accessories",
      groups: [COLOR()],
    },
  ),

  "Home & Living": packs(
    {
      id: "home-size",
      label: "Size only",
      hint: "Curtains, cushions — same color",
      groups: [HOME_SIZE()],
    },
    {
      id: "home-bed",
      label: "Bed size",
      hint: "Sheets & mattress sizes",
      groups: [BED_SIZE()],
    },
    {
      id: "home-bed-color",
      label: "Bed size + Color",
      hint: "Sheets, comforters, mattress",
      groups: [BED_SIZE(), COLOR()],
    },
    {
      id: "home-size-color",
      label: "Size + Color",
      hint: "Curtains, cushions, decor",
      groups: [HOME_SIZE(), COLOR()],
    },
    {
      id: "home-color",
      label: "Color only",
      hint: "Same item, colors",
      groups: [COLOR()],
    },
    {
      id: "home-capacity",
      label: "Capacity",
      hint: "Cookware, jars, tanks",
      groups: [CAPACITY()],
    },
    {
      id: "home-pieces",
      label: "Pieces / set",
      hint: "Dinner sets, spoons",
      groups: [PIECES()],
    },
    {
      id: "home-material",
      label: "Material + Color",
      hint: "Wood, metal, fabric items",
      groups: [MATERIAL(), COLOR()],
    },
  ),

  "Pharmacy & Medical": packs(
    {
      id: "pharma-pack",
      label: "Pack",
      hint: "Strip / bottle / box",
      groups: [PHARMA_PACK()],
    },
    {
      id: "pharma-strength",
      label: "Strength / dosage",
      hint: "250mg, 500mg, syrup ml",
      groups: [STRENGTH()],
    },
    {
      id: "pharma-strength-pack",
      label: "Strength + Pack",
      hint: "Full medicine SKU",
      groups: [STRENGTH(), PHARMA_PACK()],
    },
    {
      id: "pharma-form",
      label: "Form",
      hint: "Tablet / syrup / cream",
      groups: [FORM()],
    },
    {
      id: "pharma-volume",
      label: "Volume",
      hint: "Syrups, sanitizers",
      groups: [BEAUTY_VOLUME()],
    },
  ),

  "Books & Stationery": packs(
    {
      id: "books-pack",
      label: "Pack / set",
      hint: "Pens, pencils, sets",
      groups: [PACK()],
    },
    {
      id: "books-color",
      label: "Color",
      hint: "Notebooks, covers, pens",
      groups: [COLOR()],
    },
    {
      id: "books-ruling",
      label: "Ruling + Pages",
      hint: "Notebooks & registers",
      groups: [RULING(), PAGES()],
    },
    {
      id: "books-language",
      label: "Language",
      hint: "Books / guides",
      groups: [LANGUAGE()],
    },
    {
      id: "books-pages",
      label: "Page count",
      hint: "Diaries, registers",
      groups: [PAGES()],
    },
  ),

  "Automotive Accessories": packs(
    {
      id: "auto-fit",
      label: "Vehicle fit",
      hint: "Car / bike specific parts",
      groups: [VEHICLE()],
    },
    {
      id: "auto-fit-color",
      label: "Fit + Color",
      hint: "Seat covers, mats",
      groups: [VEHICLE(), COLOR()],
    },
    {
      id: "auto-size-color",
      label: "Size + Color",
      hint: "Universal covers, mats",
      groups: [AUTO_SIZE(), COLOR()],
    },
    {
      id: "auto-size",
      label: "Size only",
      hint: "Fitment sizes",
      groups: [AUTO_SIZE()],
    },
    {
      id: "auto-volume",
      label: "Volume",
      hint: "Engine oil, fluids",
      groups: [VOLUME()],
    },
    {
      id: "auto-color",
      label: "Color only",
      hint: "Lights, accessories",
      groups: [COLOR()],
    },
  ),

  "Home Maintenance & Repair": packs(
    {
      id: "svc-duration",
      label: "Duration",
      hint: "Job time packages",
      groups: [DURATION()],
    },
    {
      id: "svc-package",
      label: "Package",
      hint: "Basic / Standard / Premium",
      groups: [PACKAGE()],
    },
    {
      id: "svc-visit",
      label: "Visit type",
      hint: "One-time / monthly / emergency",
      groups: [VISIT()],
    },
    {
      id: "svc-package-visit",
      label: "Package + Visit",
      hint: "Full service SKU",
      groups: [PACKAGE(), VISIT()],
    },
    {
      id: "svc-type",
      label: "Service type",
      hint: "At home / on-site",
      groups: [SERVICE_TYPE()],
    },
  ),

  "Security & Surveillance": packs(
    {
      id: "sec-cameras",
      label: "Camera pack",
      hint: "1 → 16 camera kits",
      groups: [CAMERAS()],
    },
    {
      id: "sec-package",
      label: "Package",
      hint: "Basic / Premium install",
      groups: [PACKAGE()],
    },
    {
      id: "sec-cameras-package",
      label: "Cameras + Package",
      hint: "Full CCTV offer",
      groups: [CAMERAS(), PACKAGE()],
    },
    {
      id: "sec-duration",
      label: "Monitoring duration",
      hint: "Monthly monitoring plans",
      groups: [DURATION()],
    },
    {
      id: "sec-warranty",
      label: "Warranty",
      hint: "Hardware warranty",
      groups: [WARRANTY()],
    },
  ),

  "Tech & IT Services": packs(
    {
      id: "tech-duration",
      label: "Duration",
      hint: "Hourly / day packages",
      groups: [DURATION()],
    },
    {
      id: "tech-package",
      label: "Package",
      hint: "Basic / Premium support",
      groups: [PACKAGE()],
    },
    {
      id: "tech-type",
      label: "Service type",
      hint: "Online / on-site / shop",
      groups: [SERVICE_TYPE()],
    },
    {
      id: "tech-package-duration",
      label: "Package + Duration",
      hint: "Full IT service SKU",
      groups: [PACKAGE(), DURATION()],
    },
    {
      id: "tech-visit",
      label: "Visit type",
      hint: "One-time / monthly AMC",
      groups: [VISIT()],
    },
  ),

  "Personal & Professional Services": packs(
    {
      id: "pro-duration",
      label: "Duration",
      hint: "Session length",
      groups: [DURATION()],
    },
    {
      id: "pro-package",
      label: "Package",
      hint: "Service tiers",
      groups: [PACKAGE()],
    },
    {
      id: "pro-type",
      label: "Service type",
      hint: "At shop / home / online",
      groups: [SERVICE_TYPE()],
    },
    {
      id: "pro-package-duration",
      label: "Package + Duration",
      hint: "Full booking options",
      groups: [PACKAGE(), DURATION()],
    },
    {
      id: "pro-visit",
      label: "Visit / plan",
      hint: "One-time / weekly / monthly",
      groups: [VISIT()],
    },
  ),

  "Others / Universal": GENERIC_PACKS,
};

/**
 * Suggested one-tap packs for a shop category.
 * Always returns at least the generic packs.
 */
export function getVariantTemplates(category?: string | null): VariantTemplatePack[] {
  const key = (category ?? "").trim();
  if (key && BY_CATEGORY[key]) return BY_CATEGORY[key];
  return GENERIC_PACKS;
}

/**
 * Dev/QA helper: every PRODUCT_CATEGORIES entry must have packs defined.
 * Returns missing labels (empty = all covered).
 */
export function missingVariantTemplateCategories(): string[] {
  return PRODUCT_CATEGORIES.filter((c) => !BY_CATEGORY[c]?.length);
}

/** Whether this category usually needs variants (hint for empty-state copy). */
export function categoryUsuallyHasVariants(category?: string | null): boolean {
  const key = (category ?? "").trim();
  if (!key) return true;
  const rarely = new Set([
    "Pharmacy & Medical",
    "Books & Stationery",
    "Fruits & Vegetables",
  ]);
  return !rarely.has(key);
}

/** Suggested option chips for a group name (Size, Color, …). */
export function getOptionPoolForGroup(groupName: string): string[] {
  const exact = OPTION_POOLS[groupName];
  if (exact) return exact;
  const lower = groupName.trim().toLowerCase();
  for (const [key, labels] of Object.entries(OPTION_POOLS)) {
    if (key.toLowerCase() === lower) return labels;
  }
  if (lower.includes("shoe")) return OPTION_POOLS["Shoe Size"];
  if (lower.includes("kids") || lower.includes("baby size")) return OPTION_POOLS["Kids Size"];
  if (lower.includes("diaper")) return OPTION_POOLS["Diaper Size"];
  if (lower.includes("bed")) return OPTION_POOLS["Bed Size"];
  if (lower.includes("cake")) return OPTION_POOLS["Cake Size"];
  if (lower.includes("crust")) return OPTION_POOLS.Crust;
  if (lower.includes("add-on") || lower.includes("addon")) return OPTION_POOLS["Add-ons"];
  if (lower.includes("material") || lower.includes("fabric")) return OPTION_POOLS.Material;
  if (lower.includes("set") && !lower.includes("reset")) return OPTION_POOLS.Set;
  if (lower.includes("size") || lower.includes("portion")) return OPTION_POOLS.Size;
  if (lower.includes("color") || lower.includes("colour")) return OPTION_POOLS.Color;
  if (lower.includes("spice")) return OPTION_POOLS["Spice Level"];
  if (lower.includes("flavour") || lower.includes("flavor")) return OPTION_POOLS.Flavour;
  if (lower.includes("storage") || lower.includes("gb")) return OPTION_POOLS.Storage;
  if (lower.includes("ram")) return OPTION_POOLS.RAM;
  if (lower.includes("network") || lower.includes("5g") || lower.includes("4g")) {
    return OPTION_POOLS.Network;
  }
  if (lower.includes("warranty")) return OPTION_POOLS.Warranty;
  if (lower.includes("weight") || lower.includes("kg")) return OPTION_POOLS.Weight;
  if (lower.includes("camera")) return OPTION_POOLS["Camera Pack"];
  if (lower.includes("pack")) return OPTION_POOLS.Pack;
  if (lower.includes("shade")) return OPTION_POOLS.Shade;
  if (lower.includes("volume") || lower.includes("ml") || lower.includes("litre")) {
    return OPTION_POOLS.Volume;
  }
  if (lower.includes("scent") || lower.includes("fragrance")) return OPTION_POOLS.Scent;
  if (lower.includes("hair")) return OPTION_POOLS["Hair Type"];
  if (lower.includes("strength") || lower.includes("dosage") || lower.includes("mg")) {
    return OPTION_POOLS.Strength;
  }
  if (lower.includes("form")) return OPTION_POOLS.Form;
  if (lower.includes("capacity")) return OPTION_POOLS.Capacity;
  if (lower.includes("piece")) return OPTION_POOLS.Pieces;
  if (lower.includes("resistance")) return OPTION_POOLS.Resistance;
  if (lower.includes("age")) return OPTION_POOLS.Age;
  if (lower.includes("vehicle") || lower.includes("fit")) return OPTION_POOLS["Vehicle Fit"];
  if (lower.includes("ruling")) return OPTION_POOLS.Ruling;
  if (lower.includes("page")) return OPTION_POOLS["Page Count"];
  if (lower.includes("language")) return OPTION_POOLS.Language;
  if (lower.includes("duration") || lower.includes("hour") || lower.includes("min")) {
    return OPTION_POOLS.Duration;
  }
  if (lower.includes("package") || lower.includes("plan")) return OPTION_POOLS.Package;
  if (lower.includes("visit")) return OPTION_POOLS["Visit Type"];
  if (lower.includes("service")) return OPTION_POOLS["Service Type"];
  if (lower.includes("grade")) return OPTION_POOLS.Grade;
  return [];
}

/**
 * Drop blank option labels and empty groups before persisting.
 * Returns null when nothing usable remains.
 */
export function sanitizeVariantGroups(
  groups: VariantGroup[] | null | undefined,
): VariantGroup[] | null {
  if (!groups?.length) return null;
  const cleaned = groups
    .map((g) => ({
      name: g.name.trim(),
      options: g.options
        .map((o) => ({ ...o, label: o.label.trim() }))
        .filter((o) => o.label.length > 0),
    }))
    .filter((g) => {
      if (g.name === "__sku_matrix__") return g.options.length > 0;
      return g.name.length > 0 && g.options.length > 0;
    });
  return cleaned.length > 0 ? cleaned : null;
}

/** Extra groups merchants can still add on top of a template. */
export const EXTRA_GROUP_PRESETS = [
  "Size",
  "Color",
  "Shoe Size",
  "Kids Size",
  "Material",
  "Set",
  "Portion",
  "Spice Level",
  "Flavour",
  "Crust",
  "Add-ons",
  "Storage",
  "RAM",
  "Weight",
  "Pack",
  "Volume",
  "Shade",
  "Scent",
  "Bed Size",
  "Capacity",
  "Age",
  "Vehicle Fit",
  "Duration",
  "Package",
  "Warranty",
] as const;
