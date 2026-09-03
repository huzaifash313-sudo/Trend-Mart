"use client";

import dynamic from "next/dynamic";
import type { Product, Shop } from "@/types";
import type { WhatsAppCartItem } from "@/components/WhatsAppCheckoutModal";
import type { CartItem } from "@/store/cartStore";

const WhatsAppCheckoutModal = dynamic(
  () => import("@/components/WhatsAppCheckoutModal"),
  { ssr: false },
);

export interface ProductOrderIntent {
  product: Product;
  variant?: string;
  quantity: number;
  notes?: string;
}

interface ProductOrderModalProps {
  shop: Shop;
  onClose: () => void;
  onOrderPlaced: () => void;
  /** Preferred: checkout every mixed flavour already in the cart. */
  cartLines?: CartItem[];
  product?: Product;
  variant?: string;
  quantity?: number;
  notes?: string;
}

function cartLineToWhatsApp(line: CartItem): WhatsAppCartItem {
  return {
    id: line.id,
    productId: line.productId,
    shopId: line.shopId,
    name: line.name,
    price: line.basePrice ?? line.price,
    basePrice: line.basePrice ?? line.price,
    imageUrl: line.imageUrl ?? null,
    quantity: line.quantity,
    variant: line.variant,
    notes: line.notes,
    originalPrice: line.originalPrice ?? undefined,
    currency: line.currency || "PKR",
    shortCode: line.shortCode ?? undefined,
    viewKind: "product",
    priceTiers: line.priceTiers ?? null,
  };
}

export default function ProductOrderModal({
  shop,
  onClose,
  onOrderPlaced,
  cartLines,
  product,
  variant,
  quantity = 1,
  notes,
}: ProductOrderModalProps) {
  const items: WhatsAppCartItem[] =
    cartLines && cartLines.length > 0
      ? cartLines.map(cartLineToWhatsApp)
      : product
        ? [
            {
              id: `${product.id}${variant ? `-${variant}` : ""}`,
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
              priceTiers: product.price_tiers ?? null,
            },
          ]
        : [];

  if (items.length === 0) return null;

  return (
    <WhatsAppCheckoutModal
      items={items}
      shop={shop}
      onClose={onClose}
      onOrderPlaced={onOrderPlaced}
    />
  );
}
