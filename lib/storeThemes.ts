/* -------------------------------------------------------------------------- */
/*  TrendsMart — Dynamic Category-Based Store Themes & Layouts                  */
/*                                                                             */
/*  Each shop category receives a distinct visual identity:                    */
/*   - Garments/Boutique: elegant image galleries, variant showcases          */
/*   - Food: warm amber palette, compact menu-style grid                      */
/*   - Electronics: tech-blue theme, spec-focused cards                       */
/*   - Grocery: earthy green palette, fresh produce layout                   */
/*   - Cosmetics: glam pink/purple, luxury product focus                     */
/*                                                                             */
/*  Themes control: banner gradients, accent colors, card styles, grid       */
/*  columns, and optional category-specific UI components.                   */
/* -------------------------------------------------------------------------- */

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

// ─── Theme Map ────────────────────────────────────────────────────────────────

export const CATEGORY_THEMES: Record<string, StoreTheme> = {
  Boutique: {
    label: "Boutique",
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
      "Discover elegant fashion, lawn suits, kurtis, and accessories from local boutiques.",
  },
  Food: {
    label: "Food",
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
      "Order freshly prepared meals, burgers, pizza, biryani, and more from local restaurants.",
  },
  Grocery: {
    label: "Grocery",
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
      "Shop fresh groceries, aata, chawal, dairy, and daily essentials from neighborhood kiryana stores.",
  },
  Electronics: {
    label: "Electronics",
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
      "Browse smartphones, laptops, accessories, and gadgets from trusted electronics vendors.",
  },
  Cosmetics: {
    label: "Cosmetics",
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
      "Explore makeup, skincare, fragrances, and beauty products from local cosmetic shops.",
  },

  // ── Service Provider Themes ─────────────────────────────────────────────

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
      "Hire trusted electricians, plumbers, AC technicians, and home repair professionals in your area. Browse service packages, view past work, and book directly via WhatsApp.",
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
      "Professional CCTV and security camera installation services. Protect your home or business with expert surveillance setup, maintenance, and monitoring solutions.",
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
      "Expert computer repair, network setup, IT support, and tech troubleshooting. From laptop fixes to office Wi-Fi installation — reliable professionals at your doorstep.",
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
      "Connect with personal and professional service providers — from tutoring and consulting to event planning and freelance expertise. Book consultations and services seamlessly.",
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
  return CATEGORY_THEMES[category] ?? DEFAULT_THEME;
}

/**
 * Determine if a category should render service-provider chrome
 * (booking, availability, packages). Product grids still show when the
 * shop has catalog items — many IT/service merchants sell courses or kits.
 */
export function isServiceTheme(category?: string): boolean {
  if (!category) return false;
  const serviceCategories = [
    "Home Maintenance & Repair",
    "Security & Surveillance",
    "Tech & IT Services",
    "Personal & Professional Services",
  ];
  return serviceCategories.includes(category);
}
/**
 * Get a Tailwind gradient class for category-specific shop cards on the homepage.
 */
export function getShopCardGradient(category?: string): string {
  const theme = getStoreTheme(category);
  return `bg-gradient-to-br ${theme.bannerGradient}`;
}