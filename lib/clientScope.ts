/* -------------------------------------------------------------------------- */
/*  TrendMart — Client Identity Scope (per-account local data isolation)        */
/*                                                                             */
/*  Buyer / merchant data that lives in the browser (cart, wishlist, browsing   */
/*  history, local order history, active shop, behaviour memory) must NEVER     */
/*  leak between two different accounts on the same device. This module tracks  */
/*  which account currently owns the device and namespaces every localStorage   */
/*  key with a stable suffix (`u_<userid>` for signed-in users, `guest`         */
/*  otherwise) so each account keeps its own private record.                    */
/* -------------------------------------------------------------------------- */

/** Key that remembers the last account that owned this device's local data. */
const SCOPE_OWNER_KEY = "trendmart_scope_owner_v1";

/** Base keys that were historically stored flat (device-wide) and are now
 *  namespaced per account. Kept in one place so migration + clearing share it. */
const SCOPED_BASE_KEYS = [
  "trendmart_cart",
  "trendmart_favorites",
  "trendmart_favorites_count",
  "trendmart_wishlist_seen_at",
  "trendmart_history",
  "trendmart_orders",
  "trendmart_active_shop",
  "trendmart_recent_views_v1",
  "trendmart_search_history_v1",
  "trendmart_category_affinity_v1",
] as const;

/** Non-UUID ids are tolerated (e.g. tests); anything unsafe is stripped. */
function normalizeOwner(owner: string | null): string | null {
  if (!owner) return null;
  const clean = owner.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  return clean.length > 0 ? clean : null;
}

let cachedOwner: string | null | undefined;

function readStoredOwner(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SCOPE_OWNER_KEY);
    return raw ? normalizeOwner(raw) : null;
  } catch {
    return null;
  }
}

/** Current account that owns the device's local data (null = guest). */
export function getScopeOwner(): string | null {
  if (cachedOwner === undefined) cachedOwner = readStoredOwner();
  return cachedOwner;
}

/** Update the owning account. Dispatches a `trendmart:scope-change` event so
 *  subscribers (e.g. the cart store) can rehydrate from the new account's key. */
export function setScopeOwner(owner: string | null): void {
  const normalized = normalizeOwner(owner);
  cachedOwner = normalized;
  if (typeof window !== "undefined") {
    try {
      if (normalized) localStorage.setItem(SCOPE_OWNER_KEY, normalized);
      else localStorage.removeItem(SCOPE_OWNER_KEY);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent("trendmart:scope-change", { detail: { owner: normalized } }),
      );
    } catch {
      /* ignore */
    }
  }
}

/** Stable per-account suffix used to namespace local keys. */
export function scopeSuffix(): string {
  const owner = getScopeOwner();
  return owner ? `u_${owner}` : "guest";
}

/** Namespace a base localStorage key for the current account scope. */
export function scopedKey(base: string): string {
  return `${base}:${scopeSuffix()}`;
}

/** Namespace a base key for an explicit suffix (used during migrations). */
export function scopedKeyFor(base: string, suffix: string): string {
  return `${base}:${suffix}`;
}

/**
 * One-time migration: older builds stored buyer data under flat device-wide
 * keys. Move that data into the current account's namespaced key so nothing is
 * lost — then drop the legacy key so it can never leak to another account.
 * Idempotent: after the first successful run the flat keys no longer exist.
 */
export function migrateLegacyLocalData(): void {
  if (typeof window === "undefined") return;
  const suffix = scopeSuffix();
  for (const base of SCOPED_BASE_KEYS) {
    try {
      const raw = localStorage.getItem(base);
      if (raw === null) continue;
      const target = scopedKeyFor(base, suffix);
      if (localStorage.getItem(target) === null) {
        localStorage.setItem(target, raw);
      }
      localStorage.removeItem(base);
    } catch {
      /* ignore */
    }
  }
}

/** Remove every piece of data stored for the CURRENT account scope only. */
export function clearCurrentScopeData(): void {
  if (typeof window === "undefined") return;
  const suffix = scopeSuffix();
  for (const base of SCOPED_BASE_KEYS) {
    try {
      localStorage.removeItem(scopedKeyFor(base, suffix));
    } catch {
      /* ignore */
    }
  }
}

/** Copy a guest-bucket key into a signed-in user's bucket (hybrid hand-off).
 *  Only fills an empty user bucket so a user's own record always wins, then
 *  clears the guest bucket. Returns true when anything was moved. */
export function adoptGuestBucket(base: string, userId: string): boolean {
  if (typeof window === "undefined") return false;
  const guestKey = scopedKeyFor(base, "guest");
  const userKey = scopedKeyFor(base, `u_${userId}`);
  try {
    const raw = localStorage.getItem(guestKey);
    if (raw === null) return false;
    if (localStorage.getItem(userKey) === null) {
      localStorage.setItem(userKey, raw);
    }
    localStorage.removeItem(guestKey);
    return true;
  } catch {
    return false;
  }
}

// Run the flat-key migration as early as possible (before any store/service
// re-reads its keys) so existing users keep their data in the right bucket.
if (typeof window !== "undefined") {
  migrateLegacyLocalData();
}
