/* -------------------------------------------------------------------------- */
/*  TrendMart — Centralized TypeScript Types                                  */
/*  Matches Supabase schema: shops, products, auth.users                      */
/* -------------------------------------------------------------------------- */

// ─── Shop (public.shops table) ──────────────────────────────────────────────
export interface Shop {
  id: string;
  /** FK to auth.users — nullable if user is deleted (ON DELETE SET NULL) */
  owner_id?: string | null;
  name: string;
  category: string;
  location: string;
  whatsapp_number: string;
  logo_url?: string | null;
  banner_url?: string | null;
  is_live: boolean;
  created_at?: string;
  /** Optional social media & contact links for merchant storefronts. */
  instagram_handle?: string | null;
  facebook_url?: string | null;
  secondary_phone?: string | null;
  /** Optional business hours and operational status (Prompt 82). */
  business_hours?: string | null;
  /** Optional operational status text (e.g., 'Open Today: 9 AM - 10 PM', 'Temporarily Closed'). */
  operating_status?: string | null;
  /** Optional accent color for store branding (e.g., '#10b981'). */
  accent_color?: string | null;
  /** Optional store bio / description for the shop profile. */
  store_bio?: string | null;
  /** Optional promotional announcement text displayed as a marquee banner (Prompt 97). */
  announcement?: string | null;
  /** Service provider: areas covered (e.g., "Gulberg, DHA — Lahore"). */
  service_area?: string | null;
  /** Service provider: hourly rate in PKR. */
  hourly_rate?: number | null;
  /** Service provider: one-time call-out / visit charge. */
  call_out_charge?: number | null;
  /** Service provider: accepts emergency/urgent calls. */
  emergency_available?: boolean;
  /** Shop type: 'retail' (default) or 'service'. */
  shop_type?: string;
  /** Merchant-set pin latitude, used for proximity sorting & radius enforcement. */
  latitude?: number | null;
  /** Merchant-set pin longitude, used for proximity sorting & radius enforcement. */
  longitude?: number | null;
  /** Delivery/service radius in km — customers outside this range won't see the shop. */
  service_radius_km?: number | null;
  /** Optional named delivery zones/localities the shop explicitly serves. */
  delivery_zones?: string[] | null;
  /** Human-readable, reverse-geocoded address for the merchant's pinned location. */
  address_display?: string | null;
  /** Minimum order subtotal (PKR) required before checkout is allowed. 0/null = no minimum. */
  min_order_amount?: number | null;
  /** Subtotal (PKR) at/above which delivery becomes free, overriding delivery fees. Null = never free automatically. */
  free_delivery_threshold?: number | null;
  /** Flat delivery fee (PKR) charged within the service radius, before any per-km surcharge. */
  delivery_fee_flat?: number | null;
  /** Additional delivery fee (PKR) charged per km of customer distance, on top of the flat fee. */
  delivery_fee_per_km?: number | null;
  /**
   * Super-Admin review status — distinct from `is_live` (which merchants
   * control themselves to open/close for business). A store is only visible
   * to customers when `is_live = true` AND `verification_status = 'approved'`.
   * New stores default to 'pending' until reviewed.
   */
  verification_status?: ShopVerificationStatus;
}

export type ShopVerificationStatus = "pending" | "approved" | "rejected";

/** A shop is publicly discoverable only when both conditions hold. */
export function isShopPubliclyVisible(shop: Pick<Shop, "is_live" | "verification_status">): boolean {
  return !!shop.is_live && (shop.verification_status ?? "approved") === "approved";
}

  // ─── Shop Form (subset used when creating / updating a shop) ───────────────
/** Form data type — optional DB fields are normalised to plain strings. */
export interface ShopFormData {
  name: string;
  category: string;
  location: string;
  whatsapp_number: string;
  logo_url: string;
  banner_url: string;
  is_live: boolean;
  instagram_handle: string;
  facebook_url: string;
  secondary_phone: string;
  /** Business hours (e.g., 'Mon-Sat: 9 AM - 10 PM') */
  business_hours: string;
  /** Operating status (e.g., 'Open Today: 9 AM - 10 PM', 'Temporarily Closed') */
  operating_status: string;
  /** Accent color hex code for store branding (e.g., '#10b981') */
  accent_color: string;
  /** Store bio / description for the shop profile */
  store_bio: string;
  /** Promotional announcement text for storefront banner marquee (Prompt 97) */
  announcement: string;
  /** Service provider: areas covered (comma-separated). */
  service_area: string;
  /** Service provider: hourly rate as string (form input). */
  hourly_rate: string;
  /** Service provider: call-out charge as string (form input). */
  call_out_charge: string;
  /** Service provider: accepts emergency calls. */
  emergency_available: boolean;
  /** Shop type: 'retail' or 'service'. */
  shop_type: string;
  /** Merchant-set pin latitude. `null` if not yet set. */
  latitude: number | null;
  /** Merchant-set pin longitude. `null` if not yet set. */
  longitude: number | null;
  /** Delivery/service radius in km (e.g. 3, 5, 10). */
  service_radius_km: number;
  /** Reverse-geocoded, human-readable address for the pinned location. */
  address_display: string;
  /** Minimum order subtotal (PKR, form input string) required before checkout. */
  min_order_amount: string;
  /** Subtotal (PKR, form input string) at/above which delivery becomes free. */
  free_delivery_threshold: string;
  /** Flat delivery fee (PKR, form input string) within the service radius. */
  delivery_fee_flat: string;
  /** Additional delivery fee (PKR, form input string) charged per km of distance. */
  delivery_fee_per_km: string;
}

// ─── Order Status Lifecycle (Prompt 4) ───────────────────────────────────────
/** Strict order lifecycle: Pending -> Processing -> Dispatched -> Delivered or Cancelled */
export type OrderStatus =
  | "Pending"
  | "Processing"
  | "Dispatched"
  | "Delivered"
  | "Cancelled";

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  Pending: ["Processing", "Cancelled"],
  Processing: ["Dispatched", "Cancelled"],
  Dispatched: ["Delivered", "Cancelled"],
  Delivered: [],
  Cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  Pending: "Pending",
  Processing: "Processing",
  Dispatched: "Dispatched",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
};

export function isValidOrderTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return ORDER_STATUS_FLOW[current]?.includes(next) ?? false;
}

// ─── Product Variant ────────────────────────────────────────────────────────
export interface ProductVariant {
  label: string;       // e.g. "S", "M", "L" or "Red", "Blue"
  price_adj?: number;  // optional price adjustment (+/-)
  is_available?: boolean;
  /** Per-variant stock quantity (Prompt 2) */
  stock?: number;
  /** Low-stock warning threshold for this variant */
  low_stock_threshold?: number;
  /** SKU for this specific variant */
  sku?: string;
}

// ─── Product Variant Group ──────────────────────────────────────────────────
export interface VariantGroup {
  name: string;         // e.g. "Size", "Color"
  options: ProductVariant[];
}

// ─── Inventory Snapshot (Prompt 2: bulk editing state) ──────────────────────
export interface InventorySnapshot {
  /** Composite key: `${productId}::${variantLabel}` */
  key: string;
  product_id: string;
  product_name: string;
  variant_label: string;
  variant_group: string;
  stock: number;
  low_stock_threshold: number;
  is_available: boolean;
  price: number;
  price_adj?: number;
  shop_id: string;
}

// ─── Sub-Category (public.sub_categories table) ────────────────────────────
export interface SubCategory {
  id: string;
  category: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  sort_order: number;
  is_others: boolean;
  created_at?: string;
  updated_at?: string;
}

// ─── Product (public.products table) ───────────────────────────────────────
export interface Product {
  id: string;
  shop_id: string;
  name: string;
  title?: string | null;
  description: string;
  price: number;
  /**
   * Original ("before discount") price for showing markdown/discount badges.
   * Badge only renders when this is greater than `price`. This is the single
   * canonical field for markdown pricing — use `getProductDiscount()` from
   * `lib/formatters` to read it safely.
   */
  original_price?: number | null;
  /**
   * @deprecated Legacy alias for `original_price` from an earlier schema
   * revision. No longer written by the app; kept only so pre-existing rows
   * that have this set (but not `original_price`) still render a discount
   * badge. Always read pricing via `getProductDiscount()`.
   */
  compare_at_price?: number | null;
  currency: string;
  image_url?: string | null;
  /** JSON array of image URLs for product gallery */
  images?: string[] | null;
  is_available: boolean;
  /** Stock status: in_stock, low_stock, out_of_stock, pre_order */
  stock_status?: string;
  /** Optional product variants (sizes, colors, etc.) stored as JSON */
  variants?: VariantGroup[] | null;
  /** FK to main category */
  category_id?: string | null;
  /** FK to sub_category */
  sub_category_id?: string | null;
  created_at?: string;
}

// ─── Product Form (subset used when creating / updating a product) ──────────
/** Form data type — includes all enhanced fields for marketplace product creation. */
export interface ProductFormData {
  name: string;
  title?: string;
  description: string;
  price: number;
  /** Original ("before discount") price. Set > `price` to show a markdown badge. */
  original_price?: number | null;
  image_url: string;
  images?: string[] | null;
  is_available: boolean;
  stock_status?: string;
  /** FK to main category string */
  category_id?: string | null;
  /** FK to sub_category UUID */
  sub_category_id?: string | null;
  /** Optional product variants (sizes, colors, etc.) */
  variants?: VariantGroup[] | null;
}

// ─── Review (public.reviews table) ──────────────────────────────────────────
export interface Review {
  id: string;
  shop_id: string;
  customer_name: string;
  rating: number; // 1-5
  comment: string;
  created_at?: string;
}

// ─── Analytics Log (public.analytics_logs table) ────────────────────────────
export interface AnalyticsLog {
  id: string;
  shop_id: string;
  event_type: "shop_view" | "product_click";
  product_id?: string | null;
  visitor_ip?: string | null;
  user_agent?: string | null;
  created_at?: string;
}

// ─── Analytics Summary (aggregated stats) ───────────────────────────────────
export interface AnalyticsSummary {
  total_views: number;
  total_product_clicks: number;
  views_today: number;
  clicks_today: number;
}

// ─── Story (future public.stories table) ───────────────────────────────────
export interface Story {
  id: string;
  shop_id: string;
  image_url?: string | null;
  caption?: string | null;
  /** Stories expire after 24 hours */
  expires_at?: string;
  created_at?: string;
}

// ─── User Profile (derived from Supabase auth.users) ───────────────────────
export interface UserProfile {
  id: string;
  email?: string;
  created_at?: string;
  /** Convenience: the user's shop id, if they have created one */
  shop_id?: string | null;
}

// ─── Order Item (line item within an order) ─────────────────────────────────
export interface OrderItem {
  /** Optional product ID */
  product_id?: string;
  name: string;
  price: number;
  /** Selected variant label (e.g. "Size: M", "Color: Red") if applicable */
  variant?: string;
}

// ─── Order (public.orders table) ────────────────────────────────────────────
export interface Order {
  id: string;
  shop_id: string;
  customer_name: string;
  customer_phone: string;
  items_json: OrderItem[];
  total_amount: number;
  status: OrderStatus;
  created_at: string;
  /** Timestamp when order was last updated (for tracking lifecycle changes) */
  updated_at?: string;
  /** Optional tracking number / dispatch reference */
  tracking_number?: string | null;
}

// ─── Merchant Analytics Summary (dashboard cards) ───────────────────────────
export interface MerchantAnalytics {
  total_revenue: number;
  active_product_count: number;
  total_store_views: number;
  pending_orders_count: number;
}

// ─── WhatsApp Order Item (used when pre-filling WhatsApp messages) ──────────
export interface WhatsAppOrderItem {
  id: string;
  name: string;
  price: number;
}

// ─── Shop Category ─────────────────────────────────────────────────────────
export type ShopCategory =
  | "All"
  | "Fashion & Apparel"
  | "Electronics & Gadgets"
  | "Home & Living"
  | "Health & Beauty"
  | "Books & Stationery"
  | "Sports & Fitness"
  | "Toys & Baby Care"
  | "Automotive Accessories"
  | "Handmade & Crafts"
  | "Home Maintenance & Repair"
  | "Security & Surveillance"
  | "Tech & IT Services"
  | "Personal & Professional Services"
  | "Others / Universal";

export const SHOP_CATEGORIES: readonly ShopCategory[] = [
  "All",
  "Fashion & Apparel",
  "Electronics & Gadgets",
  "Home & Living",
  "Health & Beauty",
  "Books & Stationery",
  "Sports & Fitness",
  "Toys & Baby Care",
  "Automotive Accessories",
  "Handmade & Crafts",
  "Home Maintenance & Repair",
  "Security & Surveillance",
  "Tech & IT Services",
  "Personal & Professional Services",
  "Others / Universal",
] as const;

/** Categories available for shop creation (excludes "All" pseudo-category). */
export const PRODUCT_CATEGORIES: readonly string[] = [
  "Fashion & Apparel",
  "Electronics & Gadgets",
  "Home & Living",
  "Health & Beauty",
  "Books & Stationery",
  "Sports & Fitness",
  "Toys & Baby Care",
  "Automotive Accessories",
  "Handmade & Crafts",
  "Home Maintenance & Repair",
  "Security & Surveillance",
  "Tech & IT Services",
  "Personal & Professional Services",
  "Others / Universal",
] as const;

/** Service-oriented categories that should trigger the service storefront layout. */
export const SERVICE_CATEGORIES: ReadonlySet<string> = new Set([
  "Home Maintenance & Repair",
  "Security & Surveillance",
  "Tech & IT Services",
  "Personal & Professional Services",
]);

/** Check if a category is a service-provider type. */
export function isServiceCategory(category?: string): boolean {
  return category ? SERVICE_CATEGORIES.has(category) : false;
}

/** Professional icons for each shop category (used in sidebar, search, etc.) */
export const CATEGORY_ICONS: Record<string, string> = {
  "Fashion & Apparel": "👗",
  "Electronics & Gadgets": "📱",
  "Home & Living": "🏠",
  "Health & Beauty": "💄",
  "Books & Stationery": "📚",
  "Sports & Fitness": "🏋️",
  "Toys & Baby Care": "🧸",
  "Automotive Accessories": "🚗",
  "Handmade & Crafts": "🎨",
  "Home Maintenance & Repair": "🔧",
  "Security & Surveillance": "📹",
  "Tech & IT Services": "💻",
  "Personal & Professional Services": "💼",
  "Others / Universal": "📦",
};

/** Elegant gradient palette for category cards/banners */
export const CATEGORY_GRADIENTS: Record<string, string> = {
  "Fashion & Apparel": "from-pink-400 to-rose-500",
  "Electronics & Gadgets": "from-blue-400 to-cyan-500",
  "Home & Living": "from-amber-400 to-orange-500",
  "Health & Beauty": "from-emerald-400 to-teal-500",
  "Books & Stationery": "from-indigo-400 to-violet-500",
  "Sports & Fitness": "from-red-400 to-orange-500",
  "Toys & Baby Care": "from-yellow-400 to-pink-400",
  "Automotive Accessories": "from-slate-500 to-zinc-600",
  "Handmade & Crafts": "from-fuchsia-400 to-purple-500",
  "Home Maintenance & Repair": "from-orange-500 to-amber-600",
  "Security & Surveillance": "from-slate-600 to-slate-800",
  "Tech & IT Services": "from-cyan-500 to-blue-600",
  "Personal & Professional Services": "from-violet-500 to-purple-600",
  "Others / Universal": "from-gray-400 to-zinc-500",
};

// ─── User Location (Geo-Location & Delivery Zone) ───────────────────────────
export interface UserLocation {
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
  /** Human-readable city / area name — resolved via reverse geocoding or manual selection. */
  city: string | null;
  /** Delivery zone / locality (e.g., "Gujranwala", "Lahore", "Gulberg"). */
  deliveryZone: string | null;
  /** Street-level address resolved via reverse geocoding (e.g., "123 Main St, Gulberg, Lahore"). */
  address?: string | null;
  /** When this location was last updated (epoch ms). */
  updatedAt: number;
  /** Source of the location data: 'gps', 'manual', 'cached'. */
  source: "gps" | "manual" | "cached";
}

/** Cities supported for manual selection / delivery zone matching. */
export const SUPPORTED_CITIES: readonly string[] = [
  "Gujranwala",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Karachi",
  "Multan",
  "Sialkot",
  "Gujrat",
  "Wazirabad",
  "Hafizabad",
  "Daska",
  "Kamoke",
  "Nowshera Virkan",
  "Jehlum",
  "Narowal",
  "Sheikhupura",
] as const;

export type SupportedCity = (typeof SUPPORTED_CITIES)[number];

// ─── Health Check Result (Prompt 99) ────────────────────────────────────────
export interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: {
    supabase_connection: { ok: boolean; latency_ms: number; error?: string };
    tables: {
      shops: { ok: boolean; row_count: number; error?: string };
      products: { ok: boolean; row_count: number; error?: string };
      orders: { ok: boolean; row_count: number; error?: string };
    };
    env_variables: { ok: boolean; missing: string[]; present: string[] };
  };
  uptime_seconds?: number;
}

// ─── Admin Dashboard Types (Prompt 1) ────────────────────────────────────────

/** Aggregated platform-wide metrics for the super-admin dashboard. */
export interface PlatformMetrics {
  total_merchants: number;
  active_merchants: number;
  suspended_merchants: number;
  total_orders: number;
  total_revenue: number;
  orders_today: number;
  revenue_today: number;
  pending_verifications: number;
}

/** Merchant record with verification status for admin review. */
export interface AdminMerchantRecord {
  shop_id: string;
  owner_id: string | null;
  shop_name: string;
  category: string;
  location: string;
  is_live: boolean;
  verified: boolean;
  suspended: boolean;
  /** Super-Admin review status — 'pending' shops sit in the approval queue. */
  verification_status: ShopVerificationStatus;
  order_count: number;
  total_revenue: number;
  product_count: number;
  created_at: string;
  whatsapp_number: string;
}

/** Platform category taxonomy entry. */
export interface CategoryTaxonomy {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  parent_id?: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** Real-time transaction event (websocket payload). */
export interface TransactionEvent {
  order_id: string;
  shop_id: string;
  shop_name: string;
  amount: number;
  status: OrderStatus;
  customer_name: string;
  timestamp: string;
}

// ─── Invoice Types (Prompt 3) ────────────────────────────────────────────────

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  merchant: {
    name: string;
    address: string;
    phone: string;
    email?: string;
    logo?: string;
  };
  customer: {
    name: string;
    phone: string;
    email?: string;
    address?: string;
  };
  items: InvoiceLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  currency: string;
  notes?: string;
  orderStatus: OrderStatus;
  trackingNumber?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  variant?: string;
}

export interface SalesSummary {
  period: "weekly" | "monthly";
  startDate: string;
  endDate: string;
  totalOrders: number;
  totalRevenue: number;
  totalTax: number;
  ordersByStatus: Record<OrderStatus, number>;
  topProducts: { name: string; quantity: number; revenue: number }[];
  dailyBreakdown: { date: string; orders: number; revenue: number }[];
}

// ─── Notification Types (Prompt 4) ───────────────────────────────────────────

export interface OrderStatusNotification {
  orderId: string;
  shopId: string;
  shopName: string;
  previousStatus: OrderStatus;
  newStatus: OrderStatus;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  timestamp: string;
  trackingNumber?: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: "realtime" | "email" | "sms" | "push";
  description: string;
  is_active: boolean;
}

// ─── Support Desk (public.support_tickets table) ────────────────────────────
export type SupportTicketCategory =
  | "general"
  | "order"
  | "merchant"
  | "technical"
  | "billing"
  | "other";

export type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface SupportTicket {
  id: string;
  user_id?: string | null;
  name: string;
  email: string;
  phone?: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface SupportTicketFormData {
  name: string;
  email: string;
  phone: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
}

// ─── Promotional Ads / Sponsored Banners (public.promotional_ads table) ────
export type PromoAdStatus = "pending" | "approved" | "rejected";
export type PromoAdPlacement = "homepage_top" | "homepage_feed";

export interface PromotionalAd {
  id: string;
  /** NULL = platform/house ad created directly by an admin. */
  shop_id: string | null;
  title: string;
  subtitle?: string | null;
  image_url: string;
  link_url: string;
  badge_label?: string | null;
  placement: PromoAdPlacement;
  status: PromoAdStatus;
  is_active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  sort_order: number;
  impression_count: number;
  click_count: number;
  rejection_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  updated_at?: string;
  /** Populated client-side for merchant/admin management views. */
  shop_name?: string;
}

export interface PromotionalAdFormData {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  badge_label: string;
  placement: PromoAdPlacement;
  starts_at: string;
  ends_at: string;
}