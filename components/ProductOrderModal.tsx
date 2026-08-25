"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Product Order Modal                                            */
/*                                                                            */
/*  Direct single-item WhatsApp checkout for a product (no cart step).         */
/*  Mirrors DealCard's "Order" flow: seed the cart silently (so login/verify   */
/*  can resume via CartBar), then open the full checkout modal.                */
/* -------------------------------------------------------------------------- */

import dynamic from "next/dynamic";
import type { Product, Shop } from "@/types";
import type { WhatsAppCartItem } from "@/components/WhatsAppCheckoutModal";

// Lazy-load the heavy checkout form — only needed when a shopper taps "Order".
const WhatsAppCheckoutModal = dynamic(
  () => import("@/components/WhatsAppCheckoutModal"),
  { ssr: false },
);

/** Prepared direct-order intent (from a card or the quick-view detail). */
export interface ProductOrderIntent {
  product: Product;
  variant?: string;
  quantity: number;
  notes?: string;
}

interface ProductOrderModalProps {
  product: Product;
  shop: Shop;
  onClose: () => void;
  onOrderPlaced: () => void;
  variant?: string;
  quantity?: number;
  notes?: string;
}

export default function ProductOrderModal({
  product,
  shop,
  onClose,
  onOrderPlaced,
  variant,
  quantity = 1,
  notes,
}: ProductOrderModalProps) {
  const items: WhatsAppCartItem[] = [
    {
      id: product.id,
      productId: product.id,
      shopId: shop.id,
      name: product.name,
      price: product.price,
      imageUrl: product.image_url ?? null,
      quantity,
      variant,
      notes,
      originalPrice: product.original_price ?? undefined,
      currency: product.currency || "PKR",
      shortCode: product.short_code ?? undefined,
      viewKind: "product",
      priceTiers: product.variants?.length ? null : (product.price_tiers ?? null),
    },
  ];

  return (
    <WhatsAppCheckoutModal
      items={items}
      shop={shop}
      onClose={onClose}
      onOrderPlaced={onOrderPlaced}
    />
  );
}
