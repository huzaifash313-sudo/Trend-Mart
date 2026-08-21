"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Account Scope Guard                                            */
/*                                                                             */
/*  Buyer / merchant data that lives in the browser (cart, local "recent       */
/*  orders" history, anonymous wishlist, browsing history, active shop,        */
/*  behaviour memory) is stored under PER-ACCOUNT namespaced localStorage      */
/*  keys (see `lib/clientScope.ts`). This guard keeps the device's account     */
/*  scope in sync with the live Supabase session:                              */
/*                                                                             */
/*   • guest → signed-in   : the guest bucket (hybrid cart hand-off) is        */
/*     adopted into the new user's own bucket, then synced to the DB.          */
/*   • user → user / sign-out : nothing is wiped — every account's data stays  */
/*     in its own bucket and is restored when that account signs back in.      */
/*                                                                             */
/*  Without per-account namespacing, using two different accounts on the same  */
/*  device would leak one account's cart / orders / wishlist to the next.      */
/* -------------------------------------------------------------------------- */

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getScopeOwner,
  setScopeOwner,
  migrateLegacyLocalData,
  adoptGuestBucket,
} from "@/lib/clientScope";
import {
  refreshCartForScope,
  migrateGuestCartToUserBucket,
} from "@/store/cartStore";
import { migrateGuestFavoritesToUserBucket } from "@/services/wishlistService";

/** Non-account device keys that predate namespacing and must never survive
 *  across accounts (notification bell rows, review dismissals). The current
 *  per-account namespaced versions (…:<uid>) are left untouched. */
function clearLegacySharedKeys(): void {
  if (typeof window === "undefined") return;
  for (const key of ["trendmart_notif_history_v2", "tm_review_dismissed_orders_v1"]) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Guest → signed-in hand-off. Copies every guest-bucket data slice into the
 * user's own bucket so nothing the guest saved disappears, then best-effort
 * syncs the wishlist to the DB. Runs before the scope flips to `userId`.
 */
function adoptGuestData(userId: string): void {
  migrateGuestCartToUserBucket(userId);
  void migrateGuestFavoritesToUserBucket(userId);
  // History / orders / active shop / behaviour memory — same hand-off.
  adoptGuestBucket("trendmart_history", userId);
  adoptGuestBucket("trendmart_orders", userId);
  adoptGuestBucket("trendmart_active_shop", userId);
  adoptGuestBucket("trendmart_recent_views_v1", userId);
  adoptGuestBucket("trendmart_search_history_v1", userId);
  adoptGuestBucket("trendmart_category_affinity_v1", userId);
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

    // Migrate any flat keys left by pre-namespacing builds into the current
    // account's bucket, and clear non-account shared keys that could leak.
    migrateLegacyLocalData();
    clearLegacySharedKeys();

    /**
     * Reconcile the device's stored account identity with the live session.
     * Switches the account scope (which re-points every localStorage key) and
     * preserves each account's data in its own bucket — no wiping, no leaks.
     */
    function reconcile(uid: string | null): void {
      const prevOwner = getScopeOwner();
      if (prevOwner === uid) return;

      // Guest → first signed-in account: adopt the anonymous hand-off data.
      if (!prevOwner && uid) {
        adoptGuestData(uid);
      }

      setScopeOwner(uid);
      refreshCartForScope();
    }

    // `onAuthStateChange` fires an INITIAL_SESSION event immediately, which
    // seeds the current identity for us (no separate getUser() call needed).
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      reconcile(session?.user?.id ?? null);
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return null;
}
