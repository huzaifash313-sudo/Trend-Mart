"use client";

import type { ReactNode } from "react";

/* -------------------------------------------------------------------------- */
/*  CartContext — thin compatibility layer over the Zustand cart store.        */
/*                                                                             */
/*  Cart state now lives in `store/cartStore` (persisted, selective           */
/*  subscriptions). This file keeps the same import surface so existing        */
/*  call sites (`useCart`, `CartItem`, default `CartProvider`) work unchanged. */
/* -------------------------------------------------------------------------- */

export { useCart, useCartStore } from "@/store/cartStore";
export type { CartItem } from "@/store/cartStore";

export function CartProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default CartProvider;
