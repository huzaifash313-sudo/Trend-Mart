/* -------------------------------------------------------------------------- */
/*  TrendMart — Comprehensive Input Validation & Sanitization Suite (Zod)      */
/*                                                                             */
/*  Covers every user-facing input across the platform:                        */
/*   - Shop creation & editing (including social links, business hours)       */
/*   - Product creation & variant management                                   */
/*   - Checkout / order placement                                              */
/*   - Coupon creation & validation                                            */
/*   - Review submission                                                       */
/*   - Customer inquiry                                                        */
/*   - Image upload (file type & size)                                         */
/*                                                                             */
/*  Every schema includes server-compatible refinements and sanitization.      */
/* -------------------------------------------------------------------------- */

import { z } from "zod";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Pakistani phone number: +92XXXXXXXXXX (10 digits after country code). */
const whatsappRegex = /^(\+?92)?[\s-]?\d{10}$/;

/** Instagram handle: @username or username (max 30 chars, alphanumeric + _ .). */
const instagramRegex = /^@?[a-zA-Z0-9._]{1,30}$/;

/** Facebook URL: matches facebook.com or fb.com URLs. */
const facebookUrlRegex = /^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/.+/i;

/** Hex color code: #RGB or #RRGGBB. */
const hexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Generic URL pattern (for banner/logo URLs). */
const urlRegex = /^https?:\/\/.+/i;

/** Max length for free-text fields to prevent abuse. */
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_BIO_LENGTH = 500;
const MAX_ANNOUNCEMENT_LENGTH = 200;
const MAX_COMMENT_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ADDRESS_LENGTH = 300;

// ─── Shop Form Schema ────────────────────────────────────────────────────────

export const shopFormSchema = z.object({
  name: z
    .string()
    .min(2, "Shop name must be at least 2 characters.")
    .max(100, "Shop name must be under 100 characters.")
    .trim()
    // Prevent HTML/script injection
    .refine((val) => !/<[^>]*>/.test(val), "Shop name cannot contain HTML tags.")
    .refine(
      (val) => !/(<script|javascript:|on\w+\s*=)/i.test(val),
      "Shop name contains invalid characters.",
    ),

  category: z
    .string()
    .min(1, "Please select a category.")
    .max(50, "Category name is too long.")
    .trim(),

  location: z
    .string()
    .max(100, "Location must be under 100 characters.")
    .trim()
    .refine(
      (val) => !/<[^>]*>/.test(val),
      "Location cannot contain HTML tags.",
    )
    .optional()
    .or(z.literal("")),

  whatsapp_number: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || whatsappRegex.test(val.replace(/\s|-/g, "")),
      "Enter a valid Pakistani WhatsApp number (e.g. 923001234567).",
    )
    .optional()
    .or(z.literal("")),

  secondary_phone: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || whatsappRegex.test(val.replace(/\s|-/g, "")),
      "Enter a valid phone number.",
    )
    .optional()
    .or(z.literal("")),

  logo_url: z
    .string()
    .refine(
      (val) => val === "" || urlRegex.test(val),
      "Logo URL must be a valid HTTP(S) URL.",
    )
    .optional()
    .or(z.literal("")),

  banner_url: z
    .string()
    .refine(
      (val) => val === "" || urlRegex.test(val),
      "Banner URL must be a valid HTTP(S) URL.",
    )
    .optional()
    .or(z.literal("")),

  is_live: z.boolean(),

  instagram_handle: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || instagramRegex.test(val),
      "Enter a valid Instagram handle (e.g. @yourstore).",
    )
    .optional()
    .or(z.literal("")),

  facebook_url: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || facebookUrlRegex.test(val),
      "Enter a valid Facebook page URL.",
    )
    .optional()
    .or(z.literal("")),

  business_hours: z
    .string()
    .max(150, "Business hours text is too long.")
    .trim()
    .refine(
      (val) => !/<[^>]*>/.test(val),
      "Business hours cannot contain HTML.",
    )
    .optional()
    .or(z.literal("")),

  operating_status: z
    .string()
    .max(150, "Operating status text is too long.")
    .trim()
    .refine(
      (val) => !/<[^>]*>/.test(val),
      "Status cannot contain HTML.",
    )
    .optional()
    .or(z.literal("")),

  accent_color: z
    .string()
    .trim()
    .refine(
      (val) => val === "" || hexColorRegex.test(val),
      "Accent color must be a valid hex code (e.g. #10b981).",
    )
    .optional()
    .or(z.literal("")),

  store_bio: z
    .string()
    .max(MAX_BIO_LENGTH, `Store bio must be under ${MAX_BIO_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Bio cannot contain scripts.",
    )
    .optional()
    .or(z.literal("")),

  announcement: z
    .string()
    .max(MAX_ANNOUNCEMENT_LENGTH, `Announcement must be under ${MAX_ANNOUNCEMENT_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Announcement cannot contain scripts.",
    )
    .optional()
    .or(z.literal("")),
});

export type ShopFormValues = z.infer<typeof shopFormSchema>;

// ─── Product Form Schema ─────────────────────────────────────────────────────

export const productFormSchema = z.object({
  name: z
    .string()
    .min(1, "Product name is required.")
    .max(200, "Product name must be under 200 characters.")
    .trim()
    .refine((val) => !/<[^>]*>/.test(val), "Product name cannot contain HTML tags."),

  description: z
    .string()
    .max(MAX_DESCRIPTION_LENGTH, `Description must be under ${MAX_DESCRIPTION_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Description cannot contain scripts.",
    )
    .optional()
    .or(z.literal("")),

  price: z
    .number({ error: "Price must be a number." })
    .min(0, "Price cannot be negative.")
    .max(99_999_999, "Price cannot exceed Rs. 99,999,999.")
    .refine((val) => Number.isFinite(val), "Price must be a valid number."),

  currency: z
    .string()
    .length(3, "Currency must be a 3-letter code (e.g. PKR).")
    .regex(/^[A-Z]{3}$/, "Currency must be uppercase letters.")
    .optional()
    .default("PKR"),

  image_url: z
    .string()
    .refine(
      (val) => val === "" || urlRegex.test(val),
      "Image URL must be a valid HTTP(S) URL.",
    )
    .optional()
    .or(z.literal("")),

  is_available: z.boolean(),

  /** Optional variant groups. Each variant has a name and options with price adjustments. */
  variants: z
    .array(
      z.object({
        name: z
          .string()
          .min(1, "Variant name is required.")
          .max(50, "Variant name is too long.")
          .trim(),
        options: z
          .array(
            z.object({
              label: z
                .string()
                .min(1, "Option label is required.")
                .max(50, "Option label is too long.")
                .trim(),
              price_adj: z
                .number()
                .min(-999999, "Price adjustment too low.")
                .max(999999, "Price adjustment too high.")
                .optional()
                .default(0),
              is_available: z.boolean().optional().default(true),
            }),
          )
          .min(1, "At least one option is required per variant.")
          .max(50, "Maximum 50 options per variant."),
      }),
    )
    .max(5, "Maximum 5 variant groups per product.")
    .optional()
    .default([]),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

// ─── Auth / Sign-In Schema ───────────────────────────────────────────────────

export const signInSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required.")
    .email("Please enter a valid email address.")
    .max(255, "Email is too long.")
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters.")
    .max(128, "Password must be under 128 characters."),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

// ─── Auth / Sign-Up Schema ───────────────────────────────────────────────────

export const signUpSchema = z
  .object({
    full_name: z
      .string()
      .min(2, "Full name is required (at least 2 characters).")
      .max(100, "Name is too long.")
      .trim()
      .refine((val) => !/<[^>]*>/.test(val), "Name cannot contain HTML tags."),
    phone: z
      .string()
      .min(1, "Phone number is required.")
      .trim()
      .refine(
        (val) => {
          const digits = val.replace(/\D/g, "");
          // Accept 03XXXXXXXXX (11) or 923XXXXXXXXX (12) shapes
          return (
            /^03\d{9}$/.test(digits) ||
            /^92\d{10}$/.test(digits) ||
            (digits.length === 10 && digits.startsWith("3"))
          );
        },
        "Enter a valid Pakistani mobile (e.g. 0300-1234567).",
      ),
    email: z
      .string()
      .min(1, "Email is required.")
      .email("Please enter a valid email address.")
      .max(255, "Email is too long.")
      .trim()
      .toLowerCase(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .max(128, "Password must be under 128 characters.")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter.")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    confirmPassword: z.string(),
    /** Account type chosen at signup — customer portal vs merchant store. */
    role: z.enum(["customer", "merchant"], {
      message: "Choose Customer or Merchant.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignUpFormValues = z.infer<typeof signUpSchema>;

// ─── Checkout / Order Schema ─────────────────────────────────────────────────

export const orderFormSchema = z.object({
  shop_id: z.string().uuid("Invalid shop ID."),
  customer_name: z
    .string()
    .min(1, "Your name is required.")
    .max(100, "Name is too long.")
    .trim()
    .refine((val) => !/<[^>]*>/.test(val), "Name cannot contain HTML tags."),
  customer_phone: z
    .string()
    .min(1, "Phone number is required.")
    .max(15, "Phone number is too long.")
    .trim()
    .refine(
      (val) => whatsappRegex.test(val.replace(/\s|-/g, "")),
      "Enter a valid phone number (e.g. 923001234567).",
    ),
  customer_address: z
    .string()
    .max(MAX_ADDRESS_LENGTH, `Address must be under ${MAX_ADDRESS_LENGTH} characters.`)
    .trim()
    .refine((val) => !/<script/i.test(val), "Address contains invalid characters.")
    .optional()
    .or(z.literal("")),
  items: z
    .array(
      z.object({
        product_id: z.string().uuid("Invalid product ID."),
        name: z.string().min(1, "Item name is required.").max(200).trim(),
        price: z.number().min(0, "Item price cannot be negative."),
        quantity: z
          .number()
          .int("Quantity must be a whole number.")
          .min(1, "Minimum quantity is 1.")
          .max(999, "Maximum quantity is 999.")
          .default(1),
        variant: z.string().max(100).optional(),
      }),
    )
    .min(1, "At least one item is required.")
    .max(50, "Maximum 50 items per order."),
  total_amount: z
    .number()
    .min(0, "Total cannot be negative.")
    .max(99_999_999, "Total exceeds maximum order value."),
});

export type OrderFormValues = z.infer<typeof orderFormSchema>;

// ─── Coupon / Promo Code Schema ──────────────────────────────────────────────

export const couponFormSchema = z
  .object({
    shop_id: z.string().uuid("Invalid shop ID."),
    code: z
      .string()
      .min(3, "Coupon code must be at least 3 characters.")
      .max(20, "Coupon code must be under 20 characters.")
      .trim()
      .toUpperCase()
      .regex(
        /^[A-Z0-9_-]+$/,
        "Coupon code can only contain letters, numbers, hyphens, and underscores.",
      ),
    discount_percent: z
      .number()
      .min(0.01, "Discount must be at least 0.01%.")
      .max(100, "Discount cannot exceed 100%.")
      .nullable()
      .optional(),
    discount_amount: z
      .number()
      .min(1, "Discount must be at least Rs. 1.")
      .max(999999, "Discount amount too high.")
      .nullable()
      .optional(),
    expiry_date: z
      .string()
      .refine(
        (val) => {
          if (!val) return true;
          const d = new Date(val);
          return !isNaN(d.getTime()) && d > new Date();
        },
        "Expiry date must be in the future.",
      )
      .optional()
      .or(z.literal("")),
    is_active: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // Exactly one of percent or amount must be provided
      const hasPercent =
        data.discount_percent !== null && data.discount_percent !== undefined;
      const hasAmount =
        data.discount_amount !== null && data.discount_amount !== undefined;
      return (hasPercent && !hasAmount) || (!hasPercent && hasAmount);
    },
    {
      message: "Provide either a percentage OR a fixed amount discount, not both.",
    },
  );

export type CouponFormValues = z.infer<typeof couponFormSchema>;

// ─── Review Submission Schema ────────────────────────────────────────────────

export const reviewFormSchema = z.object({
  shop_id: z.string().uuid("Invalid shop ID."),
  customer_name: z
    .string()
    .min(1, "Your name is required.")
    .max(60, "Name is too long.")
    .trim()
    .refine((val) => !/<[^>]*>/.test(val), "Name cannot contain HTML tags."),
  rating: z
    .number()
    .int("Rating must be a whole number.")
    .min(1, "Please select a rating.")
    .max(5, "Rating must be between 1 and 5."),
  comment: z
    .string()
    .max(MAX_COMMENT_LENGTH, `Comment must be under ${MAX_COMMENT_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Comment contains invalid characters.",
    )
    .optional()
    .or(z.literal("")),
});

export type ReviewFormValues = z.infer<typeof reviewFormSchema>;

// ─── Customer Inquiry Schema ─────────────────────────────────────────────────

export const inquiryFormSchema = z.object({
  shop_id: z.string().uuid("Invalid shop ID."),
  product_id: z.string().uuid("Invalid product ID.").nullable().optional(),
  customer_name: z
    .string()
    .min(1, "Your name is required.")
    .max(100, "Name is too long.")
    .trim()
    .refine((val) => !/<[^>]*>/.test(val), "Name cannot contain HTML tags."),
  customer_phone: z
    .string()
    .min(1, "Phone number is required.")
    .max(15, "Phone number is too long.")
    .trim()
    .refine(
      (val) => whatsappRegex.test(val.replace(/\s|-/g, "")),
      "Enter a valid phone number (e.g. 923001234567).",
    ),
  message: z
    .string()
    .min(1, "Please enter a message.")
    .max(MAX_MESSAGE_LENGTH, `Message must be under ${MAX_MESSAGE_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Message contains invalid characters.",
    ),
});

export type InquiryFormValues = z.infer<typeof inquiryFormSchema>;

// ─── Story Form Schema ───────────────────────────────────────────────────────

export const storyFormSchema = z.object({
  image_url: z
    .string()
    .min(1, "Story image URL is required.")
    .refine((val) => urlRegex.test(val), "Invalid image URL."),
  caption: z
    .string()
    .max(80, "Caption must be under 80 characters.")
    .trim()
    .refine(
      (val) => !/<[^>]*>/.test(val),
      "Caption cannot contain HTML tags.",
    )
    .optional()
    .or(z.literal("")),
});

export type StoryFormValues = z.infer<typeof storyFormSchema>;

// ─── Search Schema ───────────────────────────────────────────────────────────

export const searchFormSchema = z.object({
  query: z
    .string()
    .max(200, "Search query is too long.")
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Invalid search query.",
    )
    .optional()
    .or(z.literal("")),
  category: z.string().max(50).optional(),
  sort: z.enum(["default", "price_low", "price_high", "newest"]).optional().default("default"),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
});

export type SearchFormValues = z.infer<typeof searchFormSchema>;

// ─── Contact Modal Form Schema ───────────────────────────────────────────────

export const contactFormSchema = z.object({
  shop_id: z.string().uuid("Invalid shop ID."),
  name: z
    .string()
    .min(1, "Your name is required.")
    .max(100, "Name is too long.")
    .trim()
    .refine((val) => !/<[^>]*>/.test(val), "Name cannot contain HTML tags."),
  message: z
    .string()
    .min(1, "Please enter a message.")
    .max(MAX_MESSAGE_LENGTH, `Message must be under ${MAX_MESSAGE_LENGTH} characters.`)
    .trim()
    .refine(
      (val) => !/<script/i.test(val),
      "Message contains invalid characters.",
    ),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

// ─── Wishlist Item Schema ────────────────────────────────────────────────────

export const wishlistItemSchema = z.object({
  product_id: z.string().uuid("Invalid product ID."),
  shop_id: z.string().uuid("Invalid shop ID."),
});

export type WishlistItemValues = z.infer<typeof wishlistItemSchema>;

// ─── Image Upload Validation (Complements storageService) ─────────────────═══

/** Max file size in bytes (2 MB). */
export const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

/** Max file size in bytes for banners (5 MB). */
export const MAX_BANNER_SIZE = 5 * 1024 * 1024;

/** Allowed MIME types. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Allowed MIME types for banners (larger, more formats). */
export const ALLOWED_BANNER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
] as const;

// Runtime validation for file uploads
export function validateImageFile(
  file: File,
  options?: { isBanner?: boolean },
): { valid: boolean; error?: string } {
  const maxSize = options?.isBanner ? MAX_BANNER_SIZE : MAX_IMAGE_SIZE;
  const allowedTypes = options?.isBanner
    ? (ALLOWED_BANNER_TYPES as readonly string[])
    : (ALLOWED_IMAGE_TYPES as readonly string[]);

  if (!file || file.size === 0) {
    return { valid: false, error: "The selected file is empty." };
  }
  if (file.size > maxSize) {
    const limitMB = Math.round(maxSize / (1024 * 1024));
    const sizeMB = Math.round((file.size / (1024 * 1024)) * 10) / 10;
    return {
      valid: false,
      error: `File size (${sizeMB} MB) exceeds the ${limitMB} MB limit.`,
    };
  }
  if (!allowedTypes.includes(file.type)) {
    const formats = allowedTypes.map((t) => t.replace("image/", "").toUpperCase()).join(", ");
    return {
      valid: false,
      error: `Unsupported format. Allowed: ${formats}.`,
    };
  }
  return { valid: true };
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Parse form values against a Zod schema and return structured errors.
 *
 * @returns `null` if valid, or a flat record of field → message errors.
 */
export function validateForm<T extends z.ZodTypeAny>(
  schema: T,
  values: unknown,
): Record<string, string> | null {
  const result = schema.safeParse(values);
  if (result.success) return null;

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "root";
    // Only keep the first error per field
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/**
 * Sanitize a string by removing potentially dangerous HTML/script content.
 * Returns the cleaned string safe for rendering.
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/on\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/on\w+\s*=\s*'[^']*'/gi, "")
    .trim();
}

/**
 * Sanitize a URL to ensure it's valid http/https.
 * Returns empty string for invalid URLs.
 */
export function sanitizeUrl(url: string): string {
  if (!url) return "";
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Not a valid URL
  }
  return "";
}

/**
 * Validate and sanitize a coupon code for display.
 * Strips non-alphanumeric chars except hyphens and underscores.
 */
export function sanitizeCouponCode(code: string): string {
  return code.replace(/[^A-Z0-9_-]/gi, "").toUpperCase().slice(0, 20);
}