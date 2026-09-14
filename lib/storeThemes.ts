/* -------------------------------------------------------------------------- */
/*  TrendsMart — Dynamic Category-Based Store Themes & Layouts                  */
/*  Keys match canonical ShopCategory names; legacy aliases resolve via         */
/*  normalizeShopCategory so old shop.category values still theme correctly.    */
/* -------------------------------------------------------------------------- */

import { normalizeShopCategory } from "@/lib/categoryCatalog";
import { isServiceCategory } from "@/types";

// ─── Theme Definition ─────────────────────────────────────────────────────────

export interface StoreTheme {
  /** Human-readable label */
  label: string;
  /** Category icon emoji */
  icon: string;
  /** Tailwind CSS gradient classes for the hero banner area */
  bannerGradient: string;
  /** Primary accent color (Tailwind class: bg-, text-, border- prefixes) */
  accentColor: string;
  /** Accent hex code */
  accentHex: string;
  /** Secondary color for subtle highlights */
  secondaryHex: string;
  /** Background gradient for product cards */
  cardGradient: string;
  /** Badge style for category pills */
  badgeClass: string;
  /** Text color for price display */
  priceColor: string;
  /** Button style for CTA actions */
  buttonClass: string;
  /** Grid columns for product display: "2" | "3" | "4" */
  productColumns: "2" | "3" | "4";
  /** Whether to show variant selectors prominently */
  showVariantsProminent: boolean;
  /** Whether to use a gallery-style layout */
  useGalleryLayout: boolean;
  /** Category description for the storefront header */
  categoryDescription: string;
}

// ─── Theme Map (canonical names) ──────────────────────────────────────────────

export const CATEGORY_THEMES: Record<string, StoreTheme> = {
  "Fashion & Apparel": {
    label: "Fashion & Apparel",
    icon: "👗",
    bannerGradient: "from-pink-500 via-rose-400 to-purple-500",
    accentColor: "pink",
    accentHex: "#ec4899",
    secondaryHex: "#fdf2f8",
    cardGradient: "from-pink-50 to-rose-100 dark:from-pink-950 dark:to-rose-900",
    badgeClass:
      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    priceColor: "text-pink-600 dark:text-pink-400",
    buttonClass:
      "bg-pink-600 hover:bg-pink-700 focus:ring-pink-500 text-white",
    productColumns: "3",
    showVariantsProminent: true,
    useGalleryLayout: true,
    categoryDescription:
      "Discover fashion, lawn suits, kurtis, footwear, and accessories from local boutiques.",
  },
  "Fast Food & Restaurants": {
    label: "Fast Food & Restaurants",
    icon: "🍔",
    bannerGradient: "from-amber-500 via-orange-500 to-red-500",
    accentColor: "amber",
    accentHex: "#f59e0b",
    secondaryHex: "#fffbeb",
    cardGradient:
      "from-amber-50 to-orange-100 dark:from-amber-950 dark:to-orange-900",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    priceColor: "text-amber-600 dark:text-amber-400",
    buttonClass:
      "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Order burgers, pizza, biryani, BBQ, and more from neighborhood restaurants.",
  },
  "Cafe & Beverages": {
    label: "Cafe & Beverages",
    icon: "☕",
    bannerGradient: "from-amber-700 via-stone-600 to-stone-800",
    accentColor: "amber",
    accentHex: "#b45309",
    secondaryHex: "#fffbeb",
    cardGradient:
      "from-amber-50 to-stone-100 dark:from-amber-950 dark:to-stone-900",
    badgeClass:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    priceColor: "text-amber-700 dark:text-amber-400",
    buttonClass:
      "bg-amber-800 hover:bg-amber-900 focus:ring-amber-600 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Coffee, chai, fresh juices, shakes, and light cafe bites nearby.",
  },
  "Grocery & Kiryana": {
    label: "Grocery & Kiryana",
    icon: "🛒",
    bannerGradient: "from-emerald-500 via-green-600 to-teal-600",
    accentColor: "emerald",
    accentHex: "#10b981",
    secondaryHex: "#ecfdf5",
    cardGradient:
      "from-emerald-50 to-green-100 dark:from-emerald-950 dark:to-green-900",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    priceColor: "text-emerald-600 dark:text-emerald-400",
    buttonClass:
      "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Shop groceries, aata, chawal, dairy, and daily essentials from local kiryana stores.",
  },
  "Fruits & Vegetables": {
    label: "Fruits & Vegetables",
    icon: "🥬",
    bannerGradient: "from-green-400 via-lime-500 to-emerald-600",
    accentColor: "lime",
    accentHex: "#65a30d",
    secondaryHex: "#f7fee7",
    cardGradient:
      "from-lime-50 to-green-100 dark:from-lime-950 dark:to-green-900",
    badgeClass:
      "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300",
    priceColor: "text-lime-700 dark:text-lime-400",
    buttonClass:
      "bg-lime-600 hover:bg-lime-700 focus:ring-lime-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Fresh seasonal fruit, sabzi, herbs, and ready-cut produce packs.",
  },
  "Meat & Seafood": {
    label: "Meat & Seafood",
    icon: "🥩",
    bannerGradient: "from-rose-600 via-red-600 to-red-800",
    accentColor: "rose",
    accentHex: "#e11d48",
    secondaryHex: "#fff1f2",
    cardGradient:
      "from-rose-50 to-red-100 dark:from-rose-950 dark:to-red-900",
    badgeClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400",
    priceColor: "text-rose-600 dark:text-rose-400",
    buttonClass:
      "bg-rose-600 hover:bg-rose-700 focus:ring-rose-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Fresh chicken, mutton, beef, fish, and marinated BBQ packs from local butchers.",
  },
  "Bakery & Sweets": {
    label: "Bakery & Sweets",
    icon: "🧁",
    bannerGradient: "from-amber-300 via-orange-400 to-rose-400",
    accentColor: "orange",
    accentHex: "#f97316",
    secondaryHex: "#fff7ed",
    cardGradient:
      "from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-900",
    badgeClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    priceColor: "text-orange-600 dark:text-orange-400",
    buttonClass:
      "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Fresh bread, cakes, mithai, cookies, and savory bakery favourites.",
  },
  "Electronics & Gadgets": {
    label: "Electronics & Gadgets",
    icon: "📱",
    bannerGradient: "from-blue-600 via-indigo-600 to-slate-800",
    accentColor: "blue",
    accentHex: "#3b82f6",
    secondaryHex: "#eff6ff",
    cardGradient:
      "from-blue-50 to-indigo-100 dark:from-blue-950 dark:to-indigo-900",
    badgeClass:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    priceColor: "text-blue-600 dark:text-blue-400",
    buttonClass:
      "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white",
    productColumns: "3",
    showVariantsProminent: true,
    useGalleryLayout: false,
    categoryDescription:
      "Smartphones, laptops, accessories, and gadgets from trusted local vendors.",
  },
  "Health & Beauty": {
    label: "Health & Beauty",
    icon: "💄",
    bannerGradient: "from-fuchsia-400 via-pink-500 to-rose-400",
    accentColor: "fuchsia",
    accentHex: "#d946ef",
    secondaryHex: "#fdf4ff",
    cardGradient:
      "from-fuchsia-50 to-pink-100 dark:from-fuchsia-950 dark:to-pink-900",
    badgeClass:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
    priceColor: "text-fuchsia-600 dark:text-fuchsia-400",
    buttonClass:
      "bg-fuchsia-600 hover:bg-fuchsia-700 focus:ring-fuchsia-500 text-white",
    productColumns: "3",
    showVariantsProminent: true,
    useGalleryLayout: true,
    categoryDescription:
      "Makeup, skincare, fragrances, attar, and personal care from local beauty shops.",
  },
  "Pharmacy & Medical": {
    label: "Pharmacy & Medical",
    icon: "💊",
    bannerGradient: "from-teal-400 via-cyan-500 to-sky-600",
    accentColor: "teal",
    accentHex: "#14b8a6",
    secondaryHex: "#f0fdfa",
    cardGradient:
      "from-teal-50 to-cyan-100 dark:from-teal-950 dark:to-cyan-900",
    badgeClass:
      "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    priceColor: "text-teal-600 dark:text-teal-400",
    buttonClass:
      "bg-teal-600 hover:bg-teal-700 focus:ring-teal-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Medicines, OTC, vitamins, and medical devices from nearby pharmacies.",
  },
  "Home & Living": {
    label: "Home & Living",
    icon: "🏠",
    bannerGradient: "from-amber-400 via-orange-500 to-yellow-600",
    accentColor: "amber",
    accentHex: "#f59e0b",
    secondaryHex: "#fffbeb",
    cardGradient:
      "from-amber-50 to-orange-100 dark:from-amber-950 dark:to-orange-900",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    priceColor: "text-amber-600 dark:text-amber-400",
    buttonClass:
      "bg-amber-600 hover:bg-amber-700 focus:ring-amber-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: true,
    categoryDescription:
      "Furniture, kitchenware, décor, bedding, and home essentials.",
  },
  "Books & Stationery": {
    label: "Books & Stationery",
    icon: "📚",
    bannerGradient: "from-indigo-400 via-violet-500 to-purple-600",
    accentColor: "indigo",
    accentHex: "#6366f1",
    secondaryHex: "#eef2ff",
    cardGradient:
      "from-indigo-50 to-violet-100 dark:from-indigo-950 dark:to-violet-900",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    priceColor: "text-indigo-600 dark:text-indigo-400",
    buttonClass:
      "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Books, exam guides, Islamic literature, stationery, and art supplies.",
  },
  "Sports & Fitness": {
    label: "Sports & Fitness",
    icon: "🏋️",
    bannerGradient: "from-red-400 via-orange-500 to-amber-500",
    accentColor: "red",
    accentHex: "#ef4444",
    secondaryHex: "#fef2f2",
    cardGradient:
      "from-red-50 to-orange-100 dark:from-red-950 dark:to-orange-900",
    badgeClass:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    priceColor: "text-red-600 dark:text-red-400",
    buttonClass:
      "bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Gym gear, sportswear, cricket kits, and fitness supplements.",
  },
  "Toys & Baby Care": {
    label: "Toys & Baby Care",
    icon: "🧸",
    bannerGradient: "from-yellow-400 via-pink-400 to-rose-400",
    accentColor: "pink",
    accentHex: "#ec4899",
    secondaryHex: "#fdf2f8",
    cardGradient:
      "from-pink-50 to-yellow-100 dark:from-pink-950 dark:to-yellow-900",
    badgeClass:
      "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    priceColor: "text-pink-600 dark:text-pink-400",
    buttonClass:
      "bg-pink-600 hover:bg-pink-700 focus:ring-pink-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Toys, baby gear, diapers, feeding sets, and kids essentials.",
  },
  "Automotive Accessories": {
    label: "Automotive Accessories",
    icon: "🚗",
    bannerGradient: "from-slate-500 via-zinc-600 to-zinc-800",
    accentColor: "slate",
    accentHex: "#475569",
    secondaryHex: "#f8fafc",
    cardGradient:
      "from-slate-50 to-zinc-100 dark:from-slate-950 dark:to-zinc-900",
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
    priceColor: "text-slate-600 dark:text-slate-400",
    buttonClass:
      "bg-slate-700 hover:bg-slate-800 focus:ring-slate-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Car care, bike accessories, oils, electronics, and spare parts.",
  },
  "Handmade & Crafts": {
    label: "Handmade & Crafts",
    icon: "🎨",
    bannerGradient: "from-fuchsia-400 via-purple-500 to-violet-600",
    accentColor: "fuchsia",
    accentHex: "#d946ef",
    secondaryHex: "#fdf4ff",
    cardGradient:
      "from-fuchsia-50 to-purple-100 dark:from-fuchsia-950 dark:to-purple-900",
    badgeClass:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-400",
    priceColor: "text-fuchsia-600 dark:text-fuchsia-400",
    buttonClass:
      "bg-fuchsia-600 hover:bg-fuchsia-700 focus:ring-fuchsia-500 text-white",
    productColumns: "3",
    showVariantsProminent: true,
    useGalleryLayout: true,
    categoryDescription:
      "Handmade décor, jewelry, custom gifts, resin art, and crafts.",
  },
  "Home Maintenance & Repair": {
    label: "Home Maintenance",
    icon: "🔧",
    bannerGradient: "from-orange-500 via-amber-500 to-yellow-500",
    accentColor: "orange",
    accentHex: "#f97316",
    secondaryHex: "#fff7ed",
    cardGradient:
      "from-orange-50 to-amber-100 dark:from-orange-950 dark:to-amber-900",
    badgeClass:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    priceColor: "text-orange-600 dark:text-orange-400",
    buttonClass:
      "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Electricians, plumbers, AC technicians, and home repair pros nearby.",
  },
  "Security & Surveillance": {
    label: "Security & Surveillance",
    icon: "📹",
    bannerGradient: "from-slate-700 via-slate-800 to-zinc-900",
    accentColor: "slate",
    accentHex: "#475569",
    secondaryHex: "#f8fafc",
    cardGradient:
      "from-slate-50 to-zinc-100 dark:from-slate-950 dark:to-zinc-900",
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400",
    priceColor: "text-slate-600 dark:text-slate-400",
    buttonClass:
      "bg-slate-700 hover:bg-slate-800 focus:ring-slate-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "CCTV kits, installation, alarms, and access control for home or shop.",
  },
  "Tech & IT Services": {
    label: "Tech & IT Services",
    icon: "💻",
    bannerGradient: "from-cyan-500 via-blue-500 to-indigo-600",
    accentColor: "cyan",
    accentHex: "#06b6d4",
    secondaryHex: "#ecfeff",
    cardGradient:
      "from-cyan-50 to-blue-100 dark:from-cyan-950 dark:to-blue-900",
    badgeClass:
      "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    priceColor: "text-cyan-600 dark:text-cyan-400",
    buttonClass:
      "bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Laptop/phone repair, networking, software, and local IT support.",
  },
  "Personal & Professional Services": {
    label: "Personal Services",
    icon: "💼",
    bannerGradient: "from-violet-500 via-purple-500 to-fuchsia-600",
    accentColor: "violet",
    accentHex: "#8b5cf6",
    secondaryHex: "#f5f3ff",
    cardGradient:
      "from-violet-50 to-purple-100 dark:from-violet-950 dark:to-purple-900",
    badgeClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
    priceColor: "text-violet-600 dark:text-violet-400",
    buttonClass:
      "bg-violet-600 hover:bg-violet-700 focus:ring-violet-500 text-white",
    productColumns: "2",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "Salon, tutoring, cleaning, events, legal help, and local professionals.",
  },
  "Others / Universal": {
    label: "Others",
    icon: "📦",
    bannerGradient: "from-zinc-400 via-gray-500 to-slate-600",
    accentColor: "zinc",
    accentHex: "#71717a",
    secondaryHex: "#fafafa",
    cardGradient:
      "from-zinc-50 to-gray-100 dark:from-zinc-900 dark:to-gray-900",
    badgeClass:
      "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    priceColor: "text-zinc-700 dark:text-zinc-300",
    buttonClass:
      "bg-zinc-700 hover:bg-zinc-800 focus:ring-zinc-500 text-white",
    productColumns: "3",
    showVariantsProminent: false,
    useGalleryLayout: false,
    categoryDescription:
      "General merchandise, gifts, and multi-category neighborhood stores.",
  },
};

// ─── Default / Fallback Theme ─────────────────────────────────────────────────

export const DEFAULT_THEME: StoreTheme = {
  label: "Shop",
  icon: "🏪",
  bannerGradient: "from-emerald-500 to-emerald-700",
  accentColor: "emerald",
  accentHex: "#10b981",
  secondaryHex: "#ecfdf5",
  cardGradient: "from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-700",
  badgeClass:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  priceColor: "text-emerald-600 dark:text-emerald-400",
  buttonClass:
    "bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500 text-white",
  productColumns: "3",
  showVariantsProminent: false,
  useGalleryLayout: false,
  categoryDescription: "Browse products and place orders via WhatsApp.",
};

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Get the theme for a given shop category.
 * Falls back to DEFAULT_THEME if category is unrecognized or undefined.
 */
export function getStoreTheme(category?: string): StoreTheme {
  if (!category) return DEFAULT_THEME;
  if (CATEGORY_THEMES[category]) return CATEGORY_THEMES[category];
  const normalized = normalizeShopCategory(category);
  if (normalized && normalized !== "All" && CATEGORY_THEMES[normalized]) {
    return CATEGORY_THEMES[normalized];
  }
  return DEFAULT_THEME;
}

/**
 * Determine if a category should render service-provider chrome
 * (booking, availability, packages). Product grids still show when the
 * shop has catalog items — many IT/service merchants sell courses or kits.
 */
export function isServiceTheme(category?: string): boolean {
  return isServiceCategory(category);
}

/**
 * Get a Tailwind gradient class for category-specific shop cards on the homepage.
 */
export function getShopCardGradient(category?: string): string {
  const theme = getStoreTheme(category);
  return `bg-gradient-to-br ${theme.bannerGradient}`;
}
