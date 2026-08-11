"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — EN/UR translation dictionary (reserved for future i18n)       */
/*                                                                            */
/*  The sidebar language toggle was removed because almost all UI still uses  */
/*  hardcoded English — switching only flipped LTR→RTL without real Urdu.     */
/*  When wiring proper Urdu: wrap the app in LanguageProvider again and       */
/*  replace hardcoded copy with t.* keys from this file (expand as needed).   */
/* -------------------------------------------------------------------------- */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export type Language = "en" | "ur";

export interface LanguageStrings {
  // Navigation
  nav_home: string;
  nav_shop: string;
  nav_orders: string;
  nav_dashboard: string;
  nav_wishlist: string;
  nav_search: string;
  nav_login: string;
  nav_signup: string;
  nav_logout: string;
  nav_profile: string;

  // Storefront
  store_open: string;
  store_closed: string;
  store_featured: string;
  store_all_shops: string;
  store_categories: string;
  store_search_placeholder: string;
  store_no_results: string;
  store_view_shop: string;
  store_contact: string;
  store_follow: string;
  store_share: string;
  store_location: string;
  store_whatsapp: string;
  store_products: string;
  store_announcement: string;

  // Product
  product_add_to_cart: string;
  product_buy_now: string;
  product_out_of_stock: string;
  product_in_stock: string;
  product_low_stock: string;
  product_price: string;
  product_variant: string;
  product_select_variant: string;
  product_quantity: string;
  product_description: string;
  product_available: string;
  product_unavailable: string;

  // Cart & Checkout
  cart_title: string;
  cart_empty: string;
  cart_subtotal: string;
  cart_discount: string;
  cart_total: string;
  cart_checkout: string;
  cart_continue_shopping: string;
  cart_coupon_code: string;
  cart_coupon_placeholder: string;
  cart_coupon_apply: string;
  cart_coupon_remove: string;
  cart_coupon_invalid: string;
  cart_coupon_valid: string;

  // Checkout Form
  checkout_title: string;
  checkout_full_name: string;
  checkout_phone: string;
  checkout_address: string;
  checkout_address_placeholder: string;
  checkout_notes: string;
  checkout_notes_placeholder: string;
  checkout_place_order: string;
  checkout_review_order: string;
  checkout_delivery_details: string;
  checkout_sending_to: string;
  checkout_order_sent: string;
  checkout_opening_whatsapp: string;
  checkout_error: string;

  // Orders
  orders_title: string;
  orders_empty: string;
  orders_track: string;
  orders_status_pending: string;
  orders_status_processing: string;
  orders_status_dispatched: string;
  orders_status_delivered: string;
  orders_status_cancelled: string;
  orders_ref: string;
  orders_total: string;
  orders_date: string;

  // Dashboard
  dashboard_title: string;
  dashboard_revenue: string;
  dashboard_orders: string;
  dashboard_products: string;
  dashboard_views: string;
  dashboard_pending: string;
  dashboard_manage_products: string;
  dashboard_manage_coupons: string;
  dashboard_manage_orders: string;
  dashboard_manage_stories: string;
  dashboard_edit_shop: string;
  dashboard_analytics: string;
  dashboard_export: string;
  dashboard_inventory: string;

  // General UI
  ui_loading: string;
  ui_error: string;
  ui_retry: string;
  ui_save: string;
  ui_cancel: string;
  ui_delete: string;
  ui_edit: string;
  ui_create: string;
  ui_confirm: string;
  ui_close: string;
  ui_back: string;
  ui_next: string;
  ui_previous: string;
  ui_yes: string;
  ui_no: string;
  ui_search: string;
  ui_filter: string;
  ui_clear: string;
  ui_select: string;
  ui_all: string;
  ui_none: string;
  ui_optional: string;
  ui_required: string;

  // Stories
  stories_title: string;
  stories_view_store: string;
  stories_no_stories: string;

  // Wishlist
  wishlist_title: string;
  wishlist_empty: string;
  wishlist_added: string;
  wishlist_removed: string;

  // Footer/General
  footer_tagline: string;
  footer_powered_by: string;

  // Language switcher label
  lang_switch: string;
  lang_english: string;
  lang_urdu: string;
}

interface LanguageContextValue {
  lang: Language;
  /** Current language code. */
  setLang: (lang: Language) => void;
  /** Toggle between en/ur. */
  toggleLang: () => void;
  /** All translated strings for the current language. */
  t: LanguageStrings;
  /** HTML dir attribute value ("ltr" | "rtl") */
  dir: "ltr" | "rtl";
  /** Whether current language is RTL (Urdu). */
  isRTL: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Translation Map                                                           */
/* -------------------------------------------------------------------------- */

const en: LanguageStrings = {
  nav_home: "Home",
  nav_shop: "Shops",
  nav_orders: "Orders",
  nav_dashboard: "Dashboard",
  nav_wishlist: "Wishlist",
  nav_search: "Search",
  nav_login: "Login",
  nav_signup: "Sign Up",
  nav_logout: "Logout",
  nav_profile: "Profile",

  store_open: "Open",
  store_closed: "Closed",
  store_featured: "Featured",
  store_all_shops: "All Shops",
  store_categories: "Categories",
  store_search_placeholder: "Search shops, products...",
  store_no_results: "No shops found.",
  store_view_shop: "View Shop",
  store_contact: "Contact",
  store_follow: "Follow",
  store_share: "Share",
  store_location: "Location",
  store_whatsapp: "WhatsApp",
  store_products: "Products",
  store_announcement: "Announcement",

  product_add_to_cart: "Add to Cart",
  product_buy_now: "Buy Now",
  product_out_of_stock: "Out of Stock",
  product_in_stock: "In Stock",
  product_low_stock: "Low Stock",
  product_price: "Price",
  product_variant: "Variant",
  product_select_variant: "Select variant",
  product_quantity: "Qty",
  product_description: "Description",
  product_available: "Available",
  product_unavailable: "Unavailable",

  cart_title: "Shopping Cart",
  cart_empty: "Your cart is empty.",
  cart_subtotal: "Subtotal",
  cart_discount: "Discount",
  cart_total: "Total",
  cart_checkout: "Checkout via WhatsApp",
  cart_continue_shopping: "Continue Shopping",
  cart_coupon_code: "Coupon Code",
  cart_coupon_placeholder: "Enter code",
  cart_coupon_apply: "Apply",
  cart_coupon_remove: "Remove",
  cart_coupon_invalid: "Invalid coupon",
  cart_coupon_valid: "Coupon applied!",

  checkout_title: "WhatsApp Checkout",
  checkout_full_name: "Full Name",
  checkout_phone: "Phone Number",
  checkout_address: "Delivery Address",
  checkout_address_placeholder: "House #, Street, Area, City",
  checkout_notes: "Delivery Notes",
  checkout_notes_placeholder: "Any special instructions...",
  checkout_place_order: "Place Order",
  checkout_review_order: "Review Order",
  checkout_delivery_details: "Delivery Details",
  checkout_sending_to: "Sending order to",
  checkout_order_sent: "Order Sent!",
  checkout_opening_whatsapp: "Opening WhatsApp...",
  checkout_error: "Something went wrong. Please try again.",

  orders_title: "My Orders",
  orders_empty: "No orders yet.",
  orders_track: "Track Order",
  orders_status_pending: "Pending",
  orders_status_processing: "Processing",
  orders_status_dispatched: "Dispatched",
  orders_status_delivered: "Delivered",
  orders_status_cancelled: "Cancelled",
  orders_ref: "Ref",
  orders_total: "Total",
  orders_date: "Date",

  dashboard_title: "Dashboard",
  dashboard_revenue: "Total Revenue",
  dashboard_orders: "Total Orders",
  dashboard_products: "Products",
  dashboard_views: "Store Views",
  dashboard_pending: "Pending Orders",
  dashboard_manage_products: "Manage Products",
  dashboard_manage_coupons: "Manage Coupons",
  dashboard_manage_orders: "Manage Orders",
  dashboard_manage_stories: "Manage Stories",
  dashboard_edit_shop: "Edit Shop",
  dashboard_analytics: "Analytics",
  dashboard_export: "Export Data",
  dashboard_inventory: "Inventory",

  ui_loading: "Loading...",
  ui_error: "An error occurred.",
  ui_retry: "Retry",
  ui_save: "Save",
  ui_cancel: "Cancel",
  ui_delete: "Delete",
  ui_edit: "Edit",
  ui_create: "Create",
  ui_confirm: "Confirm",
  ui_close: "Close",
  ui_back: "Back",
  ui_next: "Next",
  ui_previous: "Previous",
  ui_yes: "Yes",
  ui_no: "No",
  ui_search: "Search",
  ui_filter: "Filter",
  ui_clear: "Clear",
  ui_select: "Select",
  ui_all: "All",
  ui_none: "None",
  ui_optional: "Optional",
  ui_required: "Required",

  stories_title: "Stories",
  stories_view_store: "View Store",
  stories_no_stories: "No active stories.",

  wishlist_title: "My Wishlist",
  wishlist_empty: "Your wishlist is empty.",
  wishlist_added: "Added to wishlist",
  wishlist_removed: "Removed from wishlist",

  footer_tagline: "Your Local Shopping Hub",
  footer_powered_by: "Powered by TrendMart",

  lang_switch: "اردو",
  lang_english: "English",
  lang_urdu: "اردو",
};

const ur: LanguageStrings = {
  nav_home: "ہوم",
  nav_shop: "دکانیں",
  nav_orders: "آرڈرز",
  nav_dashboard: "ڈیش بورڈ",
  nav_wishlist: "پسندیدہ",
  nav_search: "تلاش",
  nav_login: "لاگ ان",
  nav_signup: "سائن اپ",
  nav_logout: "لاگ آؤٹ",
  nav_profile: "پروفائل",

  store_open: "کھلا ہے",
  store_closed: "بند ہے",
  store_featured: "نمایاں",
  store_all_shops: "تمام دکانیں",
  store_categories: "اقسام",
  store_search_placeholder: "دکانیں، مصنوعات تلاش کریں...",
  store_no_results: "کوئی دکان نہیں ملی۔",
  store_view_shop: "دکان دیکھیں",
  store_contact: "رابطہ",
  store_follow: "فالو",
  store_share: "شیئر",
  store_location: "مقام",
  store_whatsapp: "واٹس ایپ",
  store_products: "مصنوعات",
  store_announcement: "اعلان",

  product_add_to_cart: "کارٹ میں ڈالیں",
  product_buy_now: "ابھی خریدیں",
  product_out_of_stock: "اسٹاک ختم",
  product_in_stock: "دستیاب ہے",
  product_low_stock: "محدود اسٹاک",
  product_price: "قیمت",
  product_variant: "ورائٹی",
  product_select_variant: "ورائٹی منتخب کریں",
  product_quantity: "مقدار",
  product_description: "تفصیل",
  product_available: "دستیاب",
  product_unavailable: "غیر دستیاب",

  cart_title: "خریداری کی ٹوکری",
  cart_empty: "آپ کی کارٹ خالی ہے۔",
  cart_subtotal: "کل رقم",
  cart_discount: "رعایت",
  cart_total: "ٹوٹل",
  cart_checkout: "واٹس ایپ سے آرڈر کریں",
  cart_continue_shopping: "مزید خریداری کریں",
  cart_coupon_code: "کوپن کوڈ",
  cart_coupon_placeholder: "کوڈ درج کریں",
  cart_coupon_apply: "لگائیں",
  cart_coupon_remove: "ہٹائیں",
  cart_coupon_invalid: "غلط کوپن",
  cart_coupon_valid: "کوپن لاگو!",

  checkout_title: "واٹس ایپ چیک آؤٹ",
  checkout_full_name: "پورا نام",
  checkout_phone: "فون نمبر",
  checkout_address: "ڈیلیوری کا پتہ",
  checkout_address_placeholder: "گھر نمبر، گلی، علاقہ، شہر",
  checkout_notes: "ڈیلیوری نوٹس",
  checkout_notes_placeholder: "کوئی خاص ہدایات...",
  checkout_place_order: "آرڈر کریں",
  checkout_review_order: "آرڈر کا جائزہ",
  checkout_delivery_details: "ڈیلیوری کی تفصیلات",
  checkout_sending_to: "آرڈر بھیجا جا رہا ہے",
  checkout_order_sent: "آرڈر بھیج دیا گیا!",
  checkout_opening_whatsapp: "واٹس ایپ کھل رہا ہے...",
  checkout_error: "کچھ غلط ہو گیا۔ براہ کرم دوبارہ کوشش کریں۔",

  orders_title: "میرے آرڈرز",
  orders_empty: "ابھی تک کوئی آرڈر نہیں۔",
  orders_track: "آرڈر ٹریک کریں",
  orders_status_pending: "زیر التواء",
  orders_status_processing: "پروسیسنگ",
  orders_status_dispatched: "بھیج دیا گیا",
  orders_status_delivered: "ڈیلیور ہوگیا",
  orders_status_cancelled: "منسوخ",
  orders_ref: "حوالہ",
  orders_total: "کل",
  orders_date: "تاریخ",

  dashboard_title: "ڈیش بورڈ",
  dashboard_revenue: "کل آمدنی",
  dashboard_orders: "کل آرڈرز",
  dashboard_products: "مصنوعات",
  dashboard_views: "دکان کے وزٹ",
  dashboard_pending: "زیر التواء آرڈرز",
  dashboard_manage_products: "مصنوعات کا انتظام",
  dashboard_manage_coupons: "کوپن کا انتظام",
  dashboard_manage_orders: "آرڈرز کا انتظام",
  dashboard_manage_stories: "سٹوریز کا انتظام",
  dashboard_edit_shop: "دکان میں تبدیلی",
  dashboard_analytics: "تجزیات",
  dashboard_export: "ڈیٹا ایکسپورٹ",
  dashboard_inventory: "انوینٹری",

  ui_loading: "لوڈ ہو رہا ہے...",
  ui_error: "ایک خرابی پیش آگئی۔",
  ui_retry: "دوبارہ کوشش",
  ui_save: "محفوظ کریں",
  ui_cancel: "منسوخ",
  ui_delete: "حذف کریں",
  ui_edit: "ترمیم",
  ui_create: "بنائیں",
  ui_confirm: "تصدیق",
  ui_close: "بند کریں",
  ui_back: "واپس",
  ui_next: "اگلا",
  ui_previous: "پچھلا",
  ui_yes: "ہاں",
  ui_no: "نہیں",
  ui_search: "تلاش",
  ui_filter: "فلٹر",
  ui_clear: "صاف کریں",
  ui_select: "منتخب کریں",
  ui_all: "تمام",
  ui_none: "کوئی نہیں",
  ui_optional: "اختیاری",
  ui_required: "ضروری",

  stories_title: "سٹوریز",
  stories_view_store: "دکان دیکھیں",
  stories_no_stories: "کوئی فعال سٹوری نہیں۔",

  wishlist_title: "میری پسندیدہ",
  wishlist_empty: "آپ کی پسندیدہ فہرست خالی ہے۔",
  wishlist_added: "پسندیدہ میں شامل",
  wishlist_removed: "پسندیدہ سے ہٹا دیا",

  footer_tagline: "آپ کا مقامی شاپنگ مرکز",
  footer_powered_by: "TrendMart کے ذریعے",

  lang_switch: "English",
  lang_english: "English",
  lang_urdu: "اردو",
};

const TRANSLATIONS: Record<Language, LanguageStrings> = { en, ur };

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "trendmart_language";

function persistLanguage(lang: Language): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Ignore
  }
}

function loadLanguageFromStorage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "ur" || saved === "en") return saved;
  } catch {
    // Ignore
  }
  return "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [lang, setLangState] = useState<Language>("en");
  const [isLoadingFromStorage, setIsLoadingFromStorage] = useState(true);

  // Load language from localStorage after hydration to avoid SSR mismatch
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = loadLanguageFromStorage();
      setLangState(stored);
      setHydrated(true);
      setIsLoadingFromStorage(false);
    }
  }, []);

  const setLang = useCallback((newLang: Language) => {
    setLangState(newLang);
    if (hydrated) persistLanguage(newLang);
  }, [hydrated]);

  const toggleLang = useCallback(() => {
    setLangState((prev) => {
      const next = prev === "en" ? "ur" : "en";
      if (hydrated) persistLanguage(next);
      return next;
    });
  }, [hydrated]);

  // Apply dir attribute to <html> element whenever language changes
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.dir = lang === "ur" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const isRTL = lang === "ur";
  const dir = isRTL ? "rtl" : "ltr";
  const t = TRANSLATIONS[lang];

  const value = useMemo<LanguageContextValue>(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
      dir,
      isRTL,
    }),
    [lang, setLang, toggleLang, t, dir, isRTL],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hook                                                                       */
/* -------------------------------------------------------------------------- */

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used within <LanguageProvider>");
  }
  return ctx;
}

/**
 * Convenience hook that returns only the translation object `t`.
 */
export function useTranslation(): LanguageStrings {
  return useLanguage().t;
}