"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Account Scope Guard                                            */
/*                                                                             */
/*  Buyer data that lives in the browser (cart, local "recent orders"          */
/*  history, and the anonymous wishlist) is stored under fixed localStorage    */
/*  keys that are NOT namespaced per account. Without this guard, using two    */
/*  different accounts on the same device would leak one account's cart /      */
/*  order history / wishlist to the next account, because sign-out only        */
/*  clears the Supabase session — never the device-local buyer data.           */
/*                                                                             */
/*  This component watches the auth state and wipes device-local buyer data    */
/*  whenever the signed-in identity changes to a DIFFERENT established         */
/*  account, or when the user signs out. A guest (no previous account)         */
/*  logging in is intentionally NOT wiped, so the guest → checkout cart        */
/*  hand-off (the hybrid cart) keeps working.                                  */
/* -------------------------------------------------------------------------- */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCartStore } from "@/store/cartStore";
import { clearOrderHistory } from "@/services/orderHistoryService";
import { migrateLocalFavoritesToDb } from "@/services/wishlistService";

/** Tracks which account the device-local buyer data currently belongs to. */
const ACTIVE_UID_KEY = "trendmart_active_uid";

/**
 * Remove every piece of buyer data that is persisted on the device under a
 * fixed (non-per-user) key. Each removal is isolated so a single failure
 * (e.g. storage disabled) never prevents the others from running.
 */
function clearBuyerDeviceData(): void {
  // Cart — clear the in-memory Zustand store too so the UI updates instantly
  // (clearCart also removes the `trendmart_cart` persisted key).
  try {
    useCartStore.getState().clearCart();
  } catch {
    /* ignore */
  }

  // Local "recent orders" history (+ the legacy key it migrates from).
  try {
    clearOrderHistory();
    if (typeof window !== "undefined") {
      localStorage.removeItem("trendmart_order_history");
    }
  } catch {
    /* ignore */
  }

  // Anonymous wishlist / favourites (device-local for guests).
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("trendmart_favorites");
      localStorage.removeItem("trendmart_favorites_count");
      localStorage.removeItem("trendmart_wishlist_seen_at");
    }
  } catch {
    /* ignore */
  }

  // Merchant's "currently active shop" — belongs to one merchant account and
  // must never follow the device into a different merchant account.
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("trendmart_active_shop");
    }
  } catch {
    /* ignore */
  }

  // Legacy shared caches that predate per-account namespacing. If these old
  // device-wide keys survive, the next account on this phone could briefly see
  // the previous account's notification bell rows or review dismissals.
  // Per-account namespaced keys (trendmart_notif_history_v2:<uid>,
  // tm_review_dismissed_orders_v1:<uid>) are deliberately left untouched.
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem("trendmart_notif_history_v2");
      localStorage.removeItem("tm_review_dismissed_orders_v1");
    }
  } catch {
    /* ignore */
  }
}

export default function AccountScopeGuard() {
  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      // Supabase not configured (e.g. missing env in local dev) — nothing to guard.
      return;
    }

    /**
     * Reconcile the device's stored account identity with the live session.
     * Wipes buyer data only when moving AWAY from an established account
     * (account switch or sign-out), never on a guest's first sign-in.
     */
    function reconcile(uid: string | null): void {
      let prev: string | null = null;
      try {
        prev = localStorage.getItem(ACTIVE_UID_KEY);
      } catch {
        prev = null;
      }

      // Same identity (or guest → guest): nothing to do.
      if (prev === uid) return;

      // A previously signed-in account is being replaced (switch) or left
      // (sign-out) → the device-local buyer data belonged to `prev`, wipe it.
      if (prev) {
        clearBuyerDeviceData();
      }

      try {
        if (uid) localStorage.setItem(ACTIVE_UID_KEY, uid);
        else localStorage.removeItem(ACTIVE_UID_KEY);
      } catch {
        /* ignore */
      }
    }

    // `onAuthStateChange` fires an INITIAL_SESSION event immediately, which
    // seeds the current identity for us (no separate getUser() call needed).
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      reconcile(session?.user?.id ?? null);

      // Guest → signed-in hand-off: copy the device-local wishlist into the
      // DB so items saved while browsing as a guest survive on this and any
      // other device. Non-fatal — the merged wishlist view already surfaces
      // them even if this sync fails.
      if (event === "SIGNED_IN" && session?.user?.id) {
        void migrateLocalFavoritesToDb();
      }
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
