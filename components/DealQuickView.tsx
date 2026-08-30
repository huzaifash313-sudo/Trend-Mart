"use client";

import { useEffect, useState, useCallback } from "react";
import QuickViewModal from "@/components/QuickViewModal";
import WhatsAppCheckoutModal, {
  type WhatsAppCartItem,
} from "@/components/WhatsAppCheckoutModal";
import { toggleFavorite, isFavorited } from "@/services/wishlistService";
import { fetchShopById } from "@/services/shopService";
import { useCart } from "@/context/CartContext";
import { useToast } from "@/components/Toast";
import { trackProductView } from "@/lib/behavior";
import {
  dealToProduct,
  dealToShop,
  dealWishlistId,
  dealHasPrice,
  dealToCheckoutItems,
} from "@/lib/dealCommerce";
import { isDealOrderableToday, formatDealWhenTag } from "@/lib/dealSchedule";
import type { ShopDeal } from "@/lib/dealSchedule";
import type { Shop } from "@/types";

/**
 * Full-featured quick view for a deal. Wraps `QuickViewModal` (which already
 * gives "Add to Cart") and adds the two missing pieces so a deal is actionable
 * from EVERY surface: wishlist toggle + direct WhatsApp order. Used by the
 * deals page and the home / store featured strips.
 */
export default function DealQuickView({
  deal,
  onClose,
}: {
  deal: ShopDeal;
  onClose: () => void;
}) {
  const product = dealToProduct(deal);
  const shop = dealToShop(deal);
  const { addItem } = useCart();
  const { addToast } = useToast();

  const wishlistId = dealWishlistId(deal);

  const [favorited, setFavorited] = useState(false);
  const [checkoutShop, setCheckoutShop] = useState<Shop | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const [orderIntent, setOrderIntent] = useState<{
    quantity: number;
    variant?: string;
    notes?: string;
  }>({ quantity: 1 });

  // Sync the heart with persisted favorites (not just after a click).
  useEffect(() => {
    let cancelled = false;
    isFavorited(wishlistId)
      .then((f) => {
        if (!cancelled) setFavorited(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [wishlistId]);

  const handleWishlist = useCallback(async () => {
    const nowFav = await toggleFavorite(
      wishlistId,
      "product",
      deal.title,
      product.image_url ?? undefined,
      deal.shop_id,
      deal.shop_name ?? undefined,
    );
    setFavorited(nowFav);
    addToast(nowFav ? "Saved to wishlist" : "Removed from wishlist", "success");
    window.dispatchEvent(new Event("favoritesUpdated"));
  }, [wishlistId, deal.title, deal.shop_id, deal.shop_name, product.image_url, addToast]);

  const handleOrder = useCallback(
    async (order: { quantity: number; variant?: string; notes?: string }) => {
      if (!isDealOrderableToday(deal)) {
        addToast(`Order opens on ${formatDealWhenTag(deal)}. Cart & wishlist still work.`, "info");
        return;
      }
      if (!dealHasPrice(deal)) {
        addToast("This deal needs a price — open the store or ask the merchant.", "info");
        return;
      }
      if (!shop.whatsapp_number) {
        addToast("Store WhatsApp missing — open the store to contact them.", "info");
        return;
      }
      if (orderBusy) return;
      setOrderBusy(true);
      setOrderIntent(order);

      // Seed cart so login/verify can resume checkout via CartBar.
      addItem(product, shop, order.quantity, order.variant, order.notes);
      trackProductView({
        id: product.id,
        name: deal.title,
        price: Number(deal.price) || 0,
        imageUrl: product.image_url,
        shopId: deal.shop_id,
        shopName: deal.shop_name,
        category: null,
      });

      const fallback: Shop = {
        id: deal.shop_id,
        name: deal.shop_name || "Store",
        whatsapp_number: shop.whatsapp_number,
        location: "",
      } as Shop;
      setCheckoutShop(fallback);

      try {
        const res = await fetchShopById(deal.shop_id);
        if (res.success && res.data.shop) {
          setCheckoutShop({
            ...res.data.shop,
            whatsapp_number: res.data.shop.whatsapp_number || shop.whatsapp_number,
            name: res.data.shop.name || deal.shop_name || "Store",
          });
        }
      } catch {
        /* keep fallback */
      } finally {
        setOrderBusy(false);
      }
    },
    [deal, shop, product, addItem, addToast, orderBusy],
  );

  const checkoutItems: WhatsAppCartItem[] = dealToCheckoutItems(deal, product, orderIntent);

  return (
    <>
      <QuickViewModal
        product={product}
        shop={shop}
        onClose={onClose}
        isWishlisted={favorited}
        onWishlistToggle={handleWishlist}
        onOrder={handleOrder}
      />
      {checkoutShop ? (
        <WhatsAppCheckoutModal
          items={checkoutItems}
          shop={checkoutShop}
          onClose={() => setCheckoutShop(null)}
          onOrderPlaced={() => setCheckoutShop(null)}
        />
      ) : null}
    </>
  );
}
