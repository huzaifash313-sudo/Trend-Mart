"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import ShopReviewsModal from "@/components/ShopReviewsModal";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Shop Reviews Modal Provider                                    */
/*  Global host so any component (shop cards, shop header, product pages…)      */
/*  can open the reviews popup with a single call.                             */
/* -------------------------------------------------------------------------- */

export interface ShopReviewsTarget {
  id: string;
  name: string;
  ownerId?: string | null;
}

interface ShopReviewsContextValue {
  openShopReviews: (shop: ShopReviewsTarget) => void;
}

const ShopReviewsContext = createContext<ShopReviewsContextValue | null>(null);

export function useShopReviews(): ShopReviewsContextValue {
  const ctx = useContext(ShopReviewsContext);
  if (!ctx) {
    throw new Error("useShopReviews must be used within ShopReviewsProvider");
  }
  return ctx;
}

export function ShopReviewsProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ShopReviewsTarget | null>(null);

  const openShopReviews = useCallback((shop: ShopReviewsTarget) => {
    setTarget({
      id: shop.id,
      name: shop.name,
      ownerId: shop.ownerId ?? null,
    });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  return (
    <ShopReviewsContext.Provider value={{ openShopReviews }}>
      {children}
      {target ? (
        <ShopReviewsModal
          shop={{ id: target.id, name: target.name, ownerId: target.ownerId }}
          onClose={close}
        />
      ) : null}
    </ShopReviewsContext.Provider>
  );
}
