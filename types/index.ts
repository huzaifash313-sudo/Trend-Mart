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
  /** Optional SEO-friendly storefront slug. Older schemas may not have this column. */
  slug?: string | null;
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
  /** TikTok username (with or without @) — storefront opens tiktok.com/@user. */
  tiktok_handle?: string | null;
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
  /** When the promotional announcement / offer expires (shop-card ticker countdown). */
  announcement_expires_at?: string | null;
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
   * Review status. New stores are auto-approved on create (no admin queue).
   * Admins may still set `rejected` or flip `is_live` for abuse cases.
   * Public visibility: `is_live = true` AND status is `approved` (or unset).
   */
  verification_status?: ShopVerificationStatus;
  /** Denormalized average of shop reviews (1–5). */
  avg_rating?: number | null;
  /** Denormalized count of shop reviews. */
  review_count?: number | null;
  /** Timestamp when sensitive info (name/phone/location) was last changed. */
  sensitive_info_updated_at?: string | null;
  /**
   * Merchant fulfillment toggles. `false` hides that channel at checkout
   * without touching the rest of the store — a restaurant can pause Delivery
   * while QR-table dine-in keeps running, and every shop can offer Pickup.
   */
  accepts_delivery?: boolean | null;
  accepts_pickup?: boolean | null;
  /**
   * Monetization tier. `'free'` (default) allows effectively-unlimited active
   * stories; `'pro'` raises the ceiling higher. No payments are wired yet —
   * an admin flips this flag (future: set automatically by the payment gateway).
   */
  subscription_tier?: "free" | "pro" | null;
  /** Max concurrently-active stories for this shop. Defaults to the
   *  effectively-unlimited free allowance (see DEFAULT_STORIES_QUOTA). */
  stories_quota?: number | null;
  /** When a Pro subscription lapses (null = not subscribed / no expiry). */
  pro_expires_at?: string | null;
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
  /** TikTok username or profile URL — saved as bare handle. */
  tiktok_handle: string;
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
  /** ISO timestamp when the announcement offer ends; empty = no expiry */
  announcement_expires_at: string;
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
  /**
   * Coverage markers for discovery:
   * `__pk_nationwide__` | `__pk_city__:Lahore` | [] (custom radius around pin).
   */
  delivery_zones: string[];
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
  /** Accept delivery orders at checkout (false hides Delivery). Default true. */
  accepts_delivery: boolean;
  /** Accept self-pickup orders at checkout (false hides Pickup). Default true. */
  accepts_pickup: boolean;
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

// ─── Dine-In Ordering (Phase 1) ──────────────────────────────────────────────
/** How an order is fulfilled. Default is 'delivery' (marketplace/WhatsApp flow). */
export type OrderType = "delivery" | "pickup" | "dine_in";

/**
 * Dine-in lifecycle (stored in orders.dine_status). Separate from the legacy
 * `status` column so the marketplace flow (Pending → Processing → Dispatched →
 * Delivered) stays untouched. The kitchen board drives dine-in only.
 */
export type DineStatus = "Pending" | "Preparing" | "Ready" | "Served" | "Cancelled";

export const DINE_STATUS_FLOW: Record<DineStatus, DineStatus[]> = {
  Pending: ["Preparing", "Cancelled"],
  Preparing: ["Ready", "Cancelled"],
  Ready: ["Served", "Cancelled"],
  Served: [],
  Cancelled: [],
};

export const DINE_STATUS_LABELS: Record<DineStatus, string> = {
  Pending: "New",
  Preparing: "Preparing",
  Ready: "Ready",
  Served: "Served",
  Cancelled: "Cancelled",
};

export function isValidDineTransition(current: DineStatus, next: DineStatus): boolean {
  return DINE_STATUS_FLOW[current]?.includes(next) ?? false;
}

/** Maps a dine-in status onto the legacy order status for shared dashboards. */
export function dineStatusToLegacy(dine: DineStatus): OrderStatus {
  switch (dine) {
    case "Preparing":
      return "Processing";
    case "Ready":
      return "Dispatched";
    case "Served":
      return "Delivered";
    case "Cancelled":
      return "Cancelled";
    default:
      return "Pending";
  }
}

/** A QR table owned by a merchant shop (public.dine_in_tables). */
export interface DineInTable {
  id: string;
  shop_id: string;
  name: string;
  qr_token: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export function isValidOrderTransition(
  current: OrderStatus,
  next: OrderStatus,
): boolean {
  return ORDER_STATUS_FLOW[current]?.includes(next) ?? false;
}

// ─── Product Variant ────────────────────────────────────────────────────────
export interface ProductVariant {
  label: string;       // e.g. "S", "M", "L" or "Red", "Blue"
  /**
   * Absolute unit price for this option (Daraz-style: different colors/sizes
   * have their own price). Overrides the product base price when set.
   */
  price?: number;
  /**
   * Original ("before discount") price for THIS option. When greater than the
   * option's effective price, the discount badge / strikethrough is computed
   * per variant instead of from the product-level `original_price`. The single
   * source of truth for variant-level discounts is `computeVariantPricing()`
   * from `lib/variantPricing`.
   */
  original_price?: number;
  /**
   * Percentage discount for this option (0-100). When set and no explicit
   * `original_price` is present, the original price is derived automatically
   * from the option's effective price: `round(price / (1 - pct/100))`.
   */
  discount_pct?: number;
  /** Optional price adjustment (+/-) on top of the base or absolute price. */
  price_adj?: number;
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

// ─── Quantity Price Tier (bulk pricing) ─────────────────────────────────────
export interface PriceTier {
  /** Starting quantity for this price (e.g. 1, 2, 6). */
  min_qty: number;
  /**
   * Pack mode (default): TOTAL price for buying exactly `min_qty` items
   * (e.g. 6 = Rs 1100). In-between / above quantities combine packs
   * intelligently (a 6-pack + singles), never showing a discount the
   * merchant didn't set. Per-unit mode: price per item for any qty >= min_qty.
   */
  price: number;
  /** "pack" (default) → price is the pack TOTAL · "unit" → price per item. */
  mode?: "pack" | "unit";
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
  /** ISO timestamp when the discount/deal ends; after this, % OFF is hidden. */
  deal_expires_at?: string | null;
  currency: string;
  image_url?: string | null;
  /** JSON array of image URLs for product gallery */
  images?: string[] | null;
  is_available: boolean;
  /** Stock status: in_stock, low_stock, out_of_stock, pre_order */
  stock_status?: string;
  /** Merchant pin-to-top flag — pinned items sort first in the storefront. */
  is_pinned?: boolean | null;
  /**
   * Total units ordered for this product across non-cancelled orders.
   * Denormalized by a DB trigger (see product_popularity_signals migration).
   * Used as a popularity signal in search / feed ranking.
   */
  orders_count?: number;
  /**
   * Total `product_click` events logged in analytics_logs for this product.
   * Denormalized by a DB trigger (see product_popularity_signals migration).
   * Used as a popularity signal in search / feed ranking.
   */
  click_count?: number;
  /**
   * Compact, URL-safe code for the direct product page `/p/{short_code}`.
   * Used in WhatsApp order links so each item deep-links straight to the
   * product photo instead of the store. Null for rows created before the
   * short-code migration was applied (links fall back to the product id).
   */
  short_code?: string | null;
  /** Optional product variants (sizes, colors, etc.) stored as JSON */
  variants?: VariantGroup[] | null;
  /** Optional quantity-based bulk pricing (e.g. 1 = 200, pack of 6 = 1100). */
  price_tiers?: PriceTier[] | null;
  /** FK to main category */
  category_id?: string | null;
  /** FK to sub_category */
  sub_category_id?: string | null;
  created_at?: string;
  /** Joined from shops — marketplace feed / multi-vendor cards */
  shop_name?: string | null;
  shop_logo_url?: string | null;
  shop_whatsapp?: string | null;
  shop_category?: string | null;
  shop_latitude?: number | null;
  shop_longitude?: number | null;
  /** Parent shop city/area text (for coverage matching). */
  shop_location?: string | null;
  /** Parent shop delivery radius in km (for coverage matching). */
  shop_service_radius_km?: number | null;
  /** Parent shop delivery coverage markers (for coverage matching). */
  shop_delivery_zones?: string[] | null;
  /** Parent shop average rating (for marketplace cards). */
  shop_avg_rating?: number | null;
  /** Parent shop review count (for marketplace cards). */
  shop_review_count?: number | null;
  /** Parent shop free-delivery threshold (for product image offer tags). */
  shop_free_delivery_threshold?: number | null;
  /** Parent shop flat delivery fee. */
  shop_delivery_fee_flat?: number | null;
  /** Parent shop per-km delivery fee. */
  shop_delivery_fee_per_km?: number | null;
  /** Parent shop announcement text. */
  shop_announcement?: string | null;
  /** Parent shop announcement expiry. */
  shop_announcement_expires_at?: string | null;
}

/** Product row enriched for the cross-store /products marketplace feed. */
export type MarketplaceProduct = Product & {
  shop_name: string;
};

// ─── Product Form (subset used when creating / updating a product) ──────────
/** Form data type — includes all enhanced fields for marketplace product creation. */
export interface ProductFormData {
  name: string;
  title?: string;
  /** Optional short product detail. Empty or omitted is allowed. */
  description?: string;
  price: number;
  /** Original ("before discount") price. Set > `price` to show a markdown badge. */
  original_price?: number | null;
  /** When the deal/% OFF ends (ISO string or empty). */
  deal_expires_at?: string | null;
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
  /** Optional quantity-based bulk pricing (e.g. 1 = 200, pack of 6 = 1100). */
  price_tiers?: PriceTier[] | null;
}

// ─── Review (public.reviews table) ──────────────────────────────────────────
export interface Review {
  id: string;
  shop_id: string;
  customer_name: string;
  rating: number; // 1-5
  comment: string;
  created_at?: string;
  user_id?: string | null;
  merchant_reply?: string | null;
  merchant_reply_at?: string | null;
  verified_purchase?: boolean;
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
  /** Joined from shops — shown on tray + viewer header */
  shop_name?: string | null;
  shop_logo_url?: string | null;
  /** Joined shop geo fields — used to filter stories by customer location. */
  shop_latitude?: number | null;
  shop_longitude?: number | null;
  shop_service_radius_km?: number | null;
  shop_delivery_zones?: string[] | null;
  shop_location?: string | null;
  shop_is_live?: boolean | null;
  shop_verification_status?: string | null;
}

// ─── Story Subscription Quota ────────────────────────────────────────────────
/** A shop's current story allowance + usage, resolved for the merchant UI. */
export interface StoryQuota {
  tier: "free" | "pro";
  /** Max concurrently-active stories this shop may have. */
  quota: number;
  /** Number of stories currently live (not yet expired). */
  activeCount: number;
  /** Slots left before the shop hits its ceiling. */
  remaining: number;
  /** True when a Pro subscription has lapsed and behaves as free. */
  isProLapsed: boolean;
}

/**
 * Effective-unlimited allowance: any quota at or above this value is treated as
 * "unlimited" in merchant-facing UI copy. It is a high soft ceiling purely as an
 * anti-flood safety net — real stores never approach it (24h expiry + soft
 * oldest-replaced posting).
 */
export const STORY_QUOTA_EFFECTIVE_UNLIMITED = 100;

/** Free shops may keep this many active stories — effectively unlimited. */
export const DEFAULT_STORIES_QUOTA = STORY_QUOTA_EFFECTIVE_UNLIMITED;
/** Pro shops get an even higher ceiling so the tier stays meaningful. */
export const PRO_STORIES_QUOTA = 200;

/** True when a quota should be presented as "unlimited" in the UI. */
export function isUnlimitedStoryQuota(quota: number): boolean {
  return quota >= STORY_QUOTA_EFFECTIVE_UNLIMITED;
}

/**
 * Resolve a shop's effective story quota. Pro only counts while its expiry
 * (if any) is still in the future — lapsed Pro behaves as the free default.
 * An admin can still tune a shop below the free allowance.
 */
export function getStoriesQuota(
  shop?: Pick<
    Shop,
    "subscription_tier" | "stories_quota" | "pro_expires_at"
  > | null,
): number {
  if (!shop) return DEFAULT_STORIES_QUOTA;
  const tier = shop.subscription_tier ?? "free";
  const expiry = shop.pro_expires_at ? new Date(shop.pro_expires_at).getTime() : null;
  const proActive = tier === "pro" && (expiry === null || expiry > Date.now());
  const base = proActive ? PRO_STORIES_QUOTA : DEFAULT_STORIES_QUOTA;
  return Math.max(shop.stories_quota ?? base, 1);
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
  /** Unit price (PKR). Line total = price × quantity when quantity is set. */
  price: number;
  /** Original ("before discount") unit price (PKR). Set when the item had a
   *  markdown/deal so bills can show the strikethrough and savings. */
  original_price?: number;
  /** Quantity ordered (defaults to 1 when omitted). */
  quantity?: number;
  /** Selected variant label (e.g. "Size: M", "Color: Red") if applicable */
  variant?: string;
  /** Per-item special instructions (spice level, flavour, etc.) */
  notes?: string;
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
  /** Authenticated buyer, when the order was placed while signed in */
  customer_user_id?: string | null;
  /** Optional customer/order-level notes (sanitized on the server). */
  notes?: string;
  /** Fulfilment mode — 'dine_in' for QR table orders. */
  order_type?: OrderType;
  /** Linked dine-in table (dine_in_tables.id) when order_type = 'dine_in'. */
  table_id?: string | null;
  /** Human table label stored on the order (e.g. "Table 3") for fast rendering. */
  table_code?: string | null;
  /** Dine-in lifecycle status (kitchen board). Null for delivery/pickup orders. */
  dine_status?: DineStatus | null;
  /**
   * Pre-discount items subtotal (server-stored money breakdown). Present on
   * orders created after the order-money migration; falls back to the sum of
   * items_json on older rows.
   */
  subtotal_amount?: number | null;
  /**
   * Delivery fee charged (Rs). 0 for self-pickup / free delivery / no fee.
   * Server-stored so bills and order summaries can show the exact charge.
   */
  delivery_fee?: number | null;
  /** Coupon discount applied (Rs), when a coupon was used. */
  discount_amount?: number | null;
  /** Coupon code used, when any. */
  coupon_code?: string | null;
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
  | "Grocery & Kiryana"
  | "Fruits & Vegetables"
  | "Bakery & Sweets"
  | "Fast Food & Restaurants"
  | "Pharmacy & Medical"
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
  "Grocery & Kiryana",
  "Fruits & Vegetables",
  "Bakery & Sweets",
  "Fast Food & Restaurants",
  "Pharmacy & Medical",
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
  "Grocery & Kiryana",
  "Fruits & Vegetables",
  "Bakery & Sweets",
  "Fast Food & Restaurants",
  "Pharmacy & Medical",
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

/** Food categories that should get the QR table dining feature. */
export const DINE_IN_CATEGORIES: ReadonlySet<string> = new Set([
  "Fast Food & Restaurants",
  "Bakery & Sweets",
]);

/** Check if a shop category is eligible for QR table ordering. */
export function isDineInCategory(category?: string | null): boolean {
  return category ? DINE_IN_CATEGORIES.has(category) : false;
}

/** Professional icons for each shop category (used in sidebar, search, etc.) */
export const CATEGORY_ICONS: Record<string, string> = {
  "Grocery & Kiryana": "🛒",
  "Fruits & Vegetables": "🥬",
  "Bakery & Sweets": "🧁",
  "Fast Food & Restaurants": "🍔",
  "Pharmacy & Medical": "💊",
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
  "Grocery & Kiryana": "from-lime-400 to-green-600",
  "Fruits & Vegetables": "from-green-400 to-emerald-600",
  "Bakery & Sweets": "from-amber-300 to-orange-500",
  "Fast Food & Restaurants": "from-orange-400 to-red-500",
  "Pharmacy & Medical": "from-teal-400 to-cyan-600",
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
    /** Device GPS accuracy in meters when source is gps. */
    accuracyMeters?: number | null;
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
  "Peshawar",
  "Quetta",
  "Hyderabad",
  "Bahawalpur",
  "Sargodha",
  "Sukkur",
  "Abbottabad",
  "Mardan",
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
  /** The exact account that placed the order — used to scope notifications and
   *  review prompts to the ordering user, never to the whole device. */
  customerUserId?: string | null;
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
export type PromoAdPlacement = "homepage_top" | "homepage_feed" | "deals_top" | "products_top";

/** Merchant-facing placement choice — "all_pages" creates one request per page. */
export type AdPlacementChoice = PromoAdPlacement | "all_pages";

export const AD_PLACEMENT_OPTIONS: { value: AdPlacementChoice; label: string }[] = [
  { value: "homepage_top", label: "Home page" },
  { value: "deals_top", label: "Deals page" },
  { value: "products_top", label: "Products page" },
  { value: "all_pages", label: "All three pages" },
];

export const AD_PLACEMENT_LABELS: Record<PromoAdPlacement, string> = {
  homepage_top: "Home page",
  homepage_feed: "Home feed",
  deals_top: "Deals page",
  products_top: "Products page",
};

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
  /** Ad pricing plan chosen by the merchant (NULL for platform/house ads). */
  ad_plan_id?: string | null;
  /** Price charged for this placement (recorded at request time). */
  price_paid?: number | null;
  /** When the merchant submitted the paid placement request. */
  paid_at?: string | null;
  created_at: string;
  updated_at?: string;
  /** Populated client-side for merchant/admin management views. */
  shop_name?: string;
}

/** A purchasable sponsored-banner plan shown to merchants and managed by admins. */
export interface AdPlan {
  id: string;
  name: string;
  placement: PromoAdPlacement;
  duration_days: number;
  price: number;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface AdPlanFormData {
  name: string;
  placement: PromoAdPlacement;
  duration_days: string;
  price: string;
  description: string;
  is_active: boolean;
}

/** Customer record for the admin user-moderation tab. */
export interface AdminUserRecord {
  user_id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role: string;
  is_banned: boolean;
  created_at?: string | null;
  orders_count: number;
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