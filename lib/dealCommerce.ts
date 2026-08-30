/* -------------------------------------------------------------------------- */
/*  Deal → commerce helpers. Single source of truth for turning a `ShopDeal`   */
/*  into cart / wishlist / checkout shapes. Every deal surface (DealCard,      */
/*  deals page, home featured strip, store strip) must go through these so     */
/*  the same deal always resolves to the SAME product id — no duplicate cart   */
/*  entries or inconsistent wishlist entries for one deal.                     */
/* -------------------------------------------------------------------------- */

import type { Product, Shop } from "@/types";
import type { ShopDeal } from "@/lib/dealSchedule";
import type { WhatsAppCartItem } from "@/components/WhatsAppCheckoutModal";
import { getDealImages } from "@/lib/productImages";
import { isUuid } from "@/lib/shopSlug";

/**
 * Cart / wishlist identity for a deal: the linked catalog product when one is
 * present, otherwise the deal row id. Keeping cart and wishlist on the same id
 * means "Add" and "Wishlist" from any surface dedupe correctly.
 */
export function dealCommerceId(deal: ShopDeal): string {
  return deal.product_id && isUuid(deal.product_id) ? deal.product_id : deal.id;
}

/** Alias — the id used when toggling the wishlist heart for a deal. */
export function dealWishlistId(deal: ShopDeal): string {
  return dealCommerceId(deal);
}

/** Minimal `Shop` shape needed by `addItem` / `QuickViewModal` / checkout. */
export function dealToShop(
  deal: ShopDeal,
  shopWhatsapp?: string | null,
): Pick<Shop, "id" | "name" | "whatsapp_number"> {
  return {
    id: deal.shop_id,
    name: deal.shop_name || "Store",
    whatsapp_number: shopWhatsapp || deal.shop_whatsapp || "",
  };
}

/** A deal is purchasable only when it carries a finite selling price. */
export function dealHasPrice(deal: ShopDeal): boolean {
  return deal.price != null && Number.isFinite(Number(deal.price));
}

/** Canonical `Product` projection for a deal (cart-first, no variants). */
export function dealToProduct(deal: ShopDeal): Product {
  const cover = getDealImages(deal)[0] ?? deal.image_url ?? null;
  const price = dealHasPrice(deal) ? Number(deal.price) : 0;
  return {
    id: dealCommerceId(deal),
    shop_id: deal.shop_id,
    name: deal.title,
    title: deal.title,
    description: deal.description ?? "",
    price,
    original_price: deal.original_price ?? null,
    compare_at_price: deal.original_price ?? null,
    image_url: cover,
    images: getDealImages(deal),
    is_available: dealHasPrice(deal),
    currency: "PKR",
    created_at: deal.created_at,
  } as Product;
}

/** Checkout line item(s) for the WhatsApp order modal. */
export function dealToCheckoutItems(
  deal: ShopDeal,
  product: Product,
  opts: { quantity?: number; variant?: string; notes?: string } = {},
): WhatsAppCartItem[] {
  const gallery = getDealImages(deal);
  const quantity = Math.max(1, Math.min(99, Math.round(opts.quantity ?? 1)));
  return [
    {
      id: product.id,
      productId: product.id,
      shopId: deal.shop_id,
      name: deal.title,
      price: Number(deal.price) || product.price || 0,
      imageUrl: gallery[0] ?? deal.image_url ?? null,
      quantity,
      variant: opts.variant,
      notes: opts.notes,
      originalPrice: deal.original_price ?? undefined,
      currency: "PKR",
      viewKind: deal.product_id && isUuid(deal.product_id) ? "product" : "deal",
    },
  ];
}
