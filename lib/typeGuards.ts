/* -------------------------------------------------------------------------- */
/*  TrendsMart — Runtime Type Guards & Schema Validation (Prompt 1)              */
/*                                                                             */
/*  Comprehensive Zod-based type validation for all data models crossing       */
/*  client-server boundaries. Eliminates implicit `any`, enforces strict        */
/*  null-checking, and validates incoming API payloads to prevent runtime       */
/*  crashes, type mismatches, and data corruption.                              */
/* -------------------------------------------------------------------------- */

import { z } from "zod";

// ─── Primitives ────────────────────────────────────────────────────────────────

/** Valid UUID v4 string */
export const uuidSchema = z.string().uuid("Invalid UUID format.");

/** Non-empty trimmed string, XSS-sanitized */
export const safeStringSchema = (min = 1, max = 500) =>
  z
    .string()
    .min(min)
    .max(max)
    .trim()
    .refine((v) => !/<[^>]*>/.test(v), "HTML tags are not allowed.")
    .refine((v) => !/javascript:/i.test(v), "JavaScript protocol not allowed.");

/** Optional safe string (null | undefined → undefined via transform) */
export const optionalSafeStringSchema = (max = 500) =>
  z
    .string()
    .max(max)
    .trim()
    .refine((v) => !/<script/i.test(v), "Script tags not allowed.")
    .nullish()
    .transform((v) => v ?? undefined);

/** Finite non-negative number */
export const positiveNumberSchema = z
  .number()
  .finite()
  .nonnegative("Value must be non-negative.");

/** Boolean */
export const booleanSchema = z.boolean();

/** ISO-8601 datetime string */
export const isoTimestampSchema = z
  .string()
  .datetime({ message: "Invalid ISO timestamp." })
  .nullish();

/** URL (HTTPS preferred) */
export const urlSchema = z
  .string()
  .url("Invalid URL format.")
  .refine(
    (v) => v.startsWith("https://") || v.startsWith("http://"),
    "URL must use HTTP(S) protocol.",
  )
  .nullish();

/** Email address */
export const emailSchema = z.string().email().max(255).trim().toLowerCase();

/** Pakistani WhatsApp-compatible phone number */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?92)?[\s-]?\d{10}$/, "Enter a valid Pakistani phone number.");

// ─── Product Variant Schema ────────────────────────────────────────────────────

export const productVariantSchema = z.object({
  label: safeStringSchema(1, 50),
  price: z.number().finite().nonnegative().optional(),
  original_price: z.number().finite().nonnegative().optional(),
  discount_pct: z.number().finite().nonnegative().max(99).optional(),
  price_adj: z.number().finite().optional().default(0),
  is_available: z.boolean().optional().default(true),
  stock: z.number().int().nonnegative().optional(),
  low_stock_threshold: z.number().int().nonnegative().optional(),
  sku: z.string().max(100).optional(),
});

export type ProductVariantValidated = z.infer<typeof productVariantSchema>;

// ─── Variant Group Schema ──────────────────────────────────────────────────────

export const variantGroupSchema = z.object({
  name: safeStringSchema(1, 50),
  options: z.array(productVariantSchema).min(1).max(50),
});

export type VariantGroupValidated = z.infer<typeof variantGroupSchema>;

// ─── Product Schema (API Boundary) ─────────────────────────────────────────────

export const productSchema = z.object({
  id: uuidSchema,
  shop_id: uuidSchema,
  name: safeStringSchema(1, 200),
  title: z.string().max(300).nullish().transform((v) => v ?? undefined),
  description: z.string().max(2000).default(""),
  price: positiveNumberSchema,
  original_price: positiveNumberSchema.nullish().transform((v) => v ?? undefined),
  compare_at_price: positiveNumberSchema.nullish().transform((v) => v ?? undefined),
  deal_expires_at: z.string().nullish().transform((v) => v ?? undefined),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/).default("PKR"),
  image_url: urlSchema,
  images: z.array(z.string().url()).max(20).nullish().transform((v) => v ?? undefined),
  is_available: booleanSchema,
  stock_status: z.enum(["in_stock", "low_stock", "out_of_stock", "pre_order"]).nullish().transform((v) => v ?? undefined),
  variants: z.array(variantGroupSchema).max(5).nullish().transform((v) => v ?? undefined),
  category_id: uuidSchema.nullish().transform((v) => v ?? undefined),
  sub_category_id: uuidSchema.nullish().transform((v) => v ?? undefined),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
});

export type ProductValidated = z.infer<typeof productSchema>;

/** Runtime check: validate an unknown payload against the Product schema */
export function validateProduct(data: unknown): { success: true; data: ProductValidated } | { success: false; error: string } {
  const result = productSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

// ─── Shop Schema (API Boundary) ────────────────────────────────────────────────

export const shopSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema.nullish().transform((v) => v ?? undefined),
  name: safeStringSchema(2, 100),
  category: z.string().min(1).max(50),
  location: z.string().max(100).nullish().transform((v) => v ?? undefined),
  whatsapp_number: z.string().max(15).nullish().transform((v) => v ?? undefined),
  logo_url: urlSchema,
  banner_url: urlSchema,
  is_live: booleanSchema,
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
  instagram_handle: z.string().max(30).nullish().transform((v) => v ?? undefined),
  facebook_url: z.string().max(200).nullish().transform((v) => v ?? undefined),
  tiktok_handle: z.string().max(30).nullish().transform((v) => v ?? undefined),
  secondary_phone: z.string().max(15).nullish().transform((v) => v ?? undefined),
  business_hours: z.string().max(150).nullish().transform((v) => v ?? undefined),
  operating_status: z.string().max(150).nullish().transform((v) => v ?? undefined),
  accent_color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Invalid hex color.").nullish().transform((v) => v ?? undefined),
  store_bio: z.string().max(500).nullish().transform((v) => v ?? undefined),
  announcement: z.string().max(200).nullish().transform((v) => v ?? undefined),
  announcement_expires_at: z.string().nullish().transform((v) => v ?? undefined),
  service_area: z.string().max(300).nullish().transform((v) => v ?? undefined),
  hourly_rate: positiveNumberSchema.nullish().transform((v) => v ?? undefined),
  call_out_charge: positiveNumberSchema.nullish().transform((v) => v ?? undefined),
  emergency_available: z.boolean().default(false),
  shop_type: z.enum(["retail", "service"]).default("retail"),
});

export type ShopValidated = z.infer<typeof shopSchema>;

export function validateShop(data: unknown): { success: true; data: ShopValidated } | { success: false; error: string } {
  const result = shopSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

// ─── Order Status Lifecycle ────────────────────────────────────────────────────

export const orderStatusSchema = z.enum([
  "Pending",
  "Processing",
  "Dispatched",
  "Delivered",
  "Cancelled",
]);

export type OrderStatusValidated = z.infer<typeof orderStatusSchema>;

// ─── Order Item Schema ─────────────────────────────────────────────────────────

export const orderItemSchema = z.object({
  product_id: uuidSchema.optional(),
  name: safeStringSchema(1, 200),
  price: positiveNumberSchema,
  quantity: z.number().int().min(1).max(999).default(1),
  variant: z.string().max(100).optional(),
});

export type OrderItemValidated = z.infer<typeof orderItemSchema>;

// ─── Order Schema (API Boundary) ───────────────────────────────────────────────

export const orderSchema = z.object({
  id: uuidSchema,
  shop_id: uuidSchema,
  customer_name: safeStringSchema(1, 100),
  customer_phone: phoneSchema,
  items_json: z.array(orderItemSchema).min(1).max(50),
  total_amount: positiveNumberSchema,
  status: orderStatusSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
  tracking_number: z.string().max(100).nullish().transform((v) => v ?? undefined),
});

export type OrderValidated = z.infer<typeof orderSchema>;

export function validateOrder(data: unknown): { success: true; data: OrderValidated } | { success: false; error: string } {
  const result = orderSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

// ─── SubCategory Schema ────────────────────────────────────────────────────────

export const subCategorySchema = z.object({
  id: uuidSchema,
  category: z.string().min(1).max(50),
  name: safeStringSchema(1, 100),
  slug: z.string().min(1).max(100),
  description: z.string().max(500).nullish().transform((v) => v ?? undefined),
  icon: z.string().max(50).nullish().transform((v) => v ?? undefined),
  is_active: booleanSchema,
  sort_order: z.number().int().nonnegative().default(0),
  is_others: booleanSchema.default(false),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
  updated_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
});

export type SubCategoryValidated = z.infer<typeof subCategorySchema>;

// ─── Review Schema ─────────────────────────────────────────────────────────────

export const reviewSchema = z.object({
  id: uuidSchema,
  shop_id: uuidSchema,
  customer_name: safeStringSchema(1, 60),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).default(""),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
});

export type ReviewValidated = z.infer<typeof reviewSchema>;

// ─── User Profile Schema ───────────────────────────────────────────────────────

export const userProfileSchema = z.object({
  id: uuidSchema,
  email: z.string().email().nullish().transform((v) => v ?? undefined),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
  shop_id: uuidSchema.nullish().transform((v) => v ?? undefined),
});

export type UserProfileValidated = z.infer<typeof userProfileSchema>;

// ─── User Location Schema ──────────────────────────────────────────────────────

export const userLocationSchema = z.object({
  coordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
  city: z.string().max(100).nullable(),
  deliveryZone: z.string().max(100).nullable(),
  updatedAt: z.number().int().positive(),
  source: z.enum(["gps", "manual", "cached"]),
});

export type UserLocationValidated = z.infer<typeof userLocationSchema>;

// ─── Inventory Snapshot Schema ─────────────────────────────────────────────────

export const inventorySnapshotSchema = z.object({
  key: z.string().min(1),
  product_id: uuidSchema,
  product_name: safeStringSchema(1, 200),
  variant_label: z.string().max(100),
  variant_group: z.string().max(100),
  stock: z.number().int().nonnegative(),
  low_stock_threshold: z.number().int().nonnegative(),
  is_available: booleanSchema,
  price: positiveNumberSchema,
  price_adj: z.number().finite().optional(),
  shop_id: uuidSchema,
});

export type InventorySnapshotValidated = z.infer<typeof inventorySnapshotSchema>;

// ─── Platform Metrics Schema ───────────────────────────────────────────────────

export const platformMetricsSchema = z.object({
  total_merchants: z.number().int().nonnegative(),
  active_merchants: z.number().int().nonnegative(),
  suspended_merchants: z.number().int().nonnegative(),
  total_orders: z.number().int().nonnegative(),
  total_revenue: positiveNumberSchema,
  orders_today: z.number().int().nonnegative(),
  revenue_today: positiveNumberSchema,
  pending_verifications: z.number().int().nonnegative(),
});

export type PlatformMetricsValidated = z.infer<typeof platformMetricsSchema>;

// ─── Invoice Schema ────────────────────────────────────────────────────────────

export const invoiceLineItemSchema = z.object({
  description: safeStringSchema(1, 500),
  quantity: z.number().int().min(1).max(999999),
  unitPrice: positiveNumberSchema,
  amount: positiveNumberSchema,
  variant: z.string().max(100).optional(),
});

export type InvoiceLineItemValidated = z.infer<typeof invoiceLineItemSchema>;

export const invoiceDataSchema = z.object({
  invoiceNumber: safeStringSchema(1, 50),
  invoiceDate: z.string().datetime(),
  dueDate: z.string().datetime().optional(),
  merchant: z.object({
    name: safeStringSchema(1, 100),
    address: z.string().max(300),
    phone: z.string().max(15),
    email: z.string().email().optional(),
    logo: z.string().url().optional(),
  }),
  customer: z.object({
    name: safeStringSchema(1, 100),
    phone: z.string().max(15),
    email: z.string().email().optional(),
    address: z.string().max(300).optional(),
  }),
  items: z.array(invoiceLineItemSchema).min(1).max(500),
  subtotal: positiveNumberSchema,
  taxRate: positiveNumberSchema,
  taxAmount: positiveNumberSchema,
  discount: z.number().finite().nonnegative(),
  total: positiveNumberSchema,
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  notes: z.string().max(2000).optional(),
  orderStatus: orderStatusSchema,
  trackingNumber: z.string().max(100).optional(),
});

export type InvoiceDataValidated = z.infer<typeof invoiceDataSchema>;

// ─── Analytics Event Schema ────────────────────────────────────────────────────

export const analyticsLogSchema = z.object({
  id: uuidSchema,
  shop_id: uuidSchema,
  event_type: z.enum(["shop_view", "product_click"]),
  product_id: uuidSchema.nullish().transform((v) => v ?? undefined),
  visitor_ip: z.string().max(45).nullish().transform((v) => v ?? undefined),
  user_agent: z.string().max(500).nullish().transform((v) => v ?? undefined),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
});

export type AnalyticsLogValidated = z.infer<typeof analyticsLogSchema>;

// ─── Story Schema ──────────────────────────────────────────────────────────────

export const storySchema = z.object({
  id: uuidSchema,
  shop_id: uuidSchema,
  image_url: urlSchema,
  caption: z.string().max(80).nullish().transform((v) => v ?? undefined),
  expires_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
  created_at: z.string().datetime().nullish().transform((v) => v ?? undefined),
});

export type StoryValidated = z.infer<typeof storySchema>;

// ─── Health Check Schema ───────────────────────────────────────────────────────

export const healthCheckResultSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  checks: z.object({
    supabase_connection: z.object({
      ok: z.boolean(),
      latency_ms: z.number().nonnegative(),
      error: z.string().optional(),
    }),
    tables: z.object({
      shops: z.object({ ok: z.boolean(), row_count: z.number().int().nonnegative(), error: z.string().optional() }),
      products: z.object({ ok: z.boolean(), row_count: z.number().int().nonnegative(), error: z.string().optional() }),
      orders: z.object({ ok: z.boolean(), row_count: z.number().int().nonnegative(), error: z.string().optional() }),
    }),
    env_variables: z.object({
      ok: z.boolean(),
      missing: z.array(z.string()),
      present: z.array(z.string()),
    }),
  }),
  uptime_seconds: z.number().nonnegative().optional(),
});

export type HealthCheckResultValidated = z.infer<typeof healthCheckResultSchema>;

// ─── Notification Schema ───────────────────────────────────────────────────────

export const orderStatusNotificationSchema = z.object({
  orderId: uuidSchema,
  shopId: uuidSchema,
  shopName: safeStringSchema(1, 100),
  previousStatus: orderStatusSchema,
  newStatus: orderStatusSchema,
  customerName: safeStringSchema(1, 100),
  customerPhone: phoneSchema,
  customerUserId: z.string().uuid().nullish(),
  totalAmount: positiveNumberSchema,
  timestamp: z.string().datetime(),
  trackingNumber: z.string().max(100).optional(),
});

export type OrderStatusNotificationValidated = z.infer<typeof orderStatusNotificationSchema>;

// ─── API Response Wrapper ──────────────────────────────────────────────────────

/**
 * Generic API response schema factory.
 * Validates the outer shape { data: T, error: string | null } for any payload.
 */
export function apiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    data: dataSchema.nullable(),
    error: z.string().nullable(),
  });
}

// ─── Cart Item (Client-side storage) ───────────────────────────────────────────

export const cartItemSchema = z.object({
  id: z.string().min(1).max(200),
  productId: z.string().min(1).max(200),
  shopId: z.string().min(1).max(200),
  shopName: safeStringSchema(0, 200),
  shopWhatsapp: z.string().max(50),
  name: safeStringSchema(1, 200),
  price: positiveNumberSchema,
  originalPrice: positiveNumberSchema.nullish().transform((v) => v ?? undefined),
  imageUrl: z.string().max(500).nullish().transform((v) => v ?? undefined),
  quantity: z.number().int().min(1).max(99),
  variant: z.string().max(100).optional(),
  notes: z.string().max(200).optional(),
  currency: z.string().max(10).optional(),
});

export type CartItemValidated = z.infer<typeof cartItemSchema>;

export function validateCartItem(data: unknown): { success: true; data: CartItemValidated } | { success: false; error: string } {
  const result = cartItemSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => i.message).join("; ") };
}

// ─── Bulk Validation Helper ────────────────────────────────────────────────────

/**
 * Validate an array of items against a schema, returning only valid items
 * and a list of errors for invalid ones. Essential for API endpoints
 * that receive batch payloads (e.g., bulk product import, batch cart ops).
 */
export function validateArray<T>(
  schema: z.ZodType<T>,
  data: unknown[],
): { valid: T[]; errors: { index: number; message: string }[] } {
  const valid: T[] = [];
  const errors: { index: number; message: string }[] = [];

  for (let i = 0; i < data.length; i++) {
    const result = schema.safeParse(data[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        index: i,
        message: result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
    }
  }

  return { valid, errors };
}

// ─── Merchant Settings Schema ──────────────────────────────────────────────────

export const merchantSettingsSchema = z.object({
  shop_id: uuidSchema,
  name: safeStringSchema(2, 100),
  category: z.string().min(1).max(50),
  location: z.string().max(100).optional().default(""),
  whatsapp_number: z.string().max(15).optional().default(""),
  logo_url: z.string().max(2048).optional().default(""),
  banner_url: z.string().max(2048).optional().default(""),
  is_live: booleanSchema,
  instagram_handle: z.string().max(30).optional().default(""),
  facebook_url: z.string().max(200).optional().default(""),
  tiktok_handle: z.string().max(30).optional().default(""),
  secondary_phone: z.string().max(15).optional().default(""),
  business_hours: z.string().max(150).optional().default(""),
  operating_status: z.string().max(150).optional().default(""),
  accent_color: z.string().max(7).optional().default(""),
  store_bio: z.string().max(500).optional().default(""),
  announcement: z.string().max(200).optional().default(""),
  announcement_expires_at: z.string().optional().default(""),
  service_area: z.string().max(300).optional().default(""),
  hourly_rate: z.string().optional().default(""),
  call_out_charge: z.string().optional().default(""),
  emergency_available: booleanSchema,
  shop_type: z.string().default("retail"),
});

export type MerchantSettingsValidated = z.infer<typeof merchantSettingsSchema>;

export function validateMerchantSettings(data: unknown): { success: true; data: MerchantSettingsValidated } | { success: false; error: string } {
  const result = merchantSettingsSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}

// ─── Type Guard: Runtime `is` Checks (Non-Zod, Zero-Dependency) ────────────────

/**
 * Check if a value is a non-null object (not array, not null).
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is a valid Product shape (lightweight runtime check).
 */
export function isProduct(value: unknown): value is ProductValidated {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.shop_id === "string" &&
    typeof value.name === "string" &&
    typeof value.price === "number"
  );
}

/**
 * Check if a value is a valid Shop shape.
 */
export function isShop(value: unknown): value is ShopValidated {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.category === "string"
  );
}

/**
 * Check if a value is a valid Order shape.
 */
export function isOrder(value: unknown): value is OrderValidated {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.shop_id === "string" &&
    typeof value.total_amount === "number" &&
    typeof value.status === "string" &&
    Array.isArray(value.items_json)
  );
}

/**
 * Type-safe array filter that also narrows the type.
 * Usage: `const products = items.filter(isNotNullish);`
 */
export function isNotNullish<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Ensure a value is a finite, safe integer.
 */
export function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/**
 * Ensure a value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// ─── Re-export all schemas for external use ────────────────────────────────────

export const schemas = {
  product: productSchema,
  shop: shopSchema,
  order: orderSchema,
  orderItem: orderItemSchema,
  productVariant: productVariantSchema,
  variantGroup: variantGroupSchema,
  subCategory: subCategorySchema,
  review: reviewSchema,
  userProfile: userProfileSchema,
  userLocation: userLocationSchema,
  inventorySnapshot: inventorySnapshotSchema,
  platformMetrics: platformMetricsSchema,
  invoiceData: invoiceDataSchema,
  invoiceLineItem: invoiceLineItemSchema,
  analyticsLog: analyticsLogSchema,
  story: storySchema,
  healthCheck: healthCheckResultSchema,
  orderStatusNotification: orderStatusNotificationSchema,
  cartItem: cartItemSchema,
  merchantSettings: merchantSettingsSchema,
} as const;