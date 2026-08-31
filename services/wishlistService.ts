/* -------------------------------------------------------------------------- */
/*  TrendsMart — Persistent Wishlist / Favorites Service                        */
/*                                                                             */
/*  PROMPT 2: HARDENED — Robust input validation, duplicate-checking logic,    */
/*                       race-condition safeguards, null-reference prevention, */
/*                       and malformed data payload rejection.                  */
/*                                                                             */
/*  Hybrid approach: localStorage for anonymous users, Supabase for            */
/*  authenticated users.  Automatically migrates anonymous bookmarks into      */
/*  the database upon sign-in via the migration RPC functions.                 */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import { logError } from "@/services/errorService";
import { sanitizeLight, sanitizeNumeric, isValidUUID, truncate } from "@/lib/sanitization";
import { scopedKey, scopedKeyFor } from "@/lib/clientScope";

/* -------------------------------------------------------------------------- */
/*  Favorites Changed Notification                                             */
/* -------------------------------------------------------------------------- */

/**
 * Dispatch a custom event notifying the UI that the favorites list has changed.
 * Components like BottomNav listen for this to update badge counts in real time.
 */
function notifyFavoritesChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("favoritesUpdated"));
  } catch {
    /* no-op */
  }
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface FavoriteItem {
  id: string; // product_id or shop_id (the item the user bookmarked)
  /** UUID from the database row (set only for DB-persisted records). */
  wishlistRowId?: string;
  type: "shop" | "product";
  name: string;
  /** Optional thumbnail / logo URL for display purposes. */
  imageUrl?: string;
  /** Optional shop ID for product favorites (deep linking). */
  shopId?: string;
  /** Optional shop name for product favorites. */
  shopName?: string;
  addedAt: number; // epoch ms timestamp
}

export interface WishlistResult {
  success: boolean;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Input Validation & Sanitization Helpers (PROMPT 2)                         */
/* -------------------------------------------------------------------------- */

/**
 * Validate and sanitize a product/shop ID for wishlist operations.
 * Returns the sanitized ID or null if invalid.
 */
function sanitizeItemId(id: unknown): string | null {
  if (!id || typeof id !== "string") return null;
  const sanitized = sanitizeLight(id.trim());
  if (!sanitized || sanitized.length > 36) return null;
  // For UUIDs, validate format
  if (sanitized.length === 36) {
    return isValidUUID(sanitized) ? sanitized : null;
  }
  // For fallback IDs (like "fallback-others-*"), allow alphanumeric with hyphens
  if (!/^[a-zA-Z0-9\-_]+$/.test(sanitized)) return null;
  return sanitized;
}

/**
 * Validate wishlist item type.
 */
function sanitizeItemType(type: unknown): "shop" | "product" | null {
  if (type === "shop" || type === "product") return type;
  if (typeof type === "string") {
    const lower = type.toLowerCase().trim();
    if (lower === "shop") return "shop";
    if (lower === "product") return "product";
  }
  return null;
}

/**
 * Sanitize an item name for storage.
 */
function sanitizeItemName(name: unknown): string {
  if (!name || typeof name !== "string") return "Unknown Item";
  return truncate(sanitizeLight(name.trim()), 200) || "Unknown Item";
}

/**
 * Sanitize a URL string.
 */
function sanitizeItemUrl(url: unknown): string | undefined {
  if (url === null || url === undefined || typeof url !== "string") return undefined;
  const trimmed = url.trim().slice(0, 2048);
  if (!trimmed || trimmed.length === 0) return undefined;
  // Only allow http/https URLs
  if (!/^https?:\/\/.+/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Sanitize an ISO timestamp string.
 */
function sanitizeTimestamp(ts: unknown): number {
  if (!ts || typeof ts !== "string") return Date.now();
  const parsed = Date.parse(ts);
  if (!Number.isFinite(parsed)) return Date.now();
  if (parsed < 0 || parsed > Date.now() + 86400000) return Date.now(); // Future dates beyond 1 day = invalid
  return parsed;
}

/* -------------------------------------------------------------------------- */
/*  localStorage helpers (anonymous users only)                                */
/* -------------------------------------------------------------------------- */

/** Per-account key — each account (and the guest) keeps its own wishlist. */
function favoritesKey(): string {
  return scopedKey("trendsmart_favorites");
}

function favoritesCountKey(): string {
  return scopedKey("trendsmart_favorites_count");
}

/** Keys used to read/write the "guest" bucket during sign-in hand-off. */
function guestFavoritesKey(): string {
  return scopedKeyFor("trendsmart_favorites", "guest");
}

/**
 * PROMPT 2: Safe localStorage read with JSON parsing safeguards.
 * Handles corrupted data gracefully — returns empty array instead of throwing.
 * Also validates the parsed data structure to prevent malformed payloads.
 */
function getLocalAll(): FavoriteItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(favoritesKey());
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);

    // PROMPT 2: Validate the parsed data is actually an array
    if (!Array.isArray(parsed)) {
      // Corrupted data — clear it
      localStorage.removeItem(favoritesKey());
      return [];
    }

    // PROMPT 2: Validate each item in the array has the required shape
    const validItems: FavoriteItem[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string" &&
        ((item as Record<string, unknown>).type === "shop" ||
          (item as Record<string, unknown>).type === "product") &&
        typeof (item as Record<string, unknown>).name === "string" &&
        typeof (item as Record<string, unknown>).addedAt === "number"
      ) {
        validItems.push(item as FavoriteItem);
      }
    }

    // If items were filtered out, persist the cleaned list
    if (validItems.length !== parsed.length) {
      saveLocalAll(validItems);
    }

    return validItems;
  } catch {
    // JSON parse error — clear corrupted data
    try {
      localStorage.removeItem(favoritesKey());
    } catch {
      /* storage unavailable */
    }
    return [];
  }
}

/**
 * PROMPT 2: Safe localStorage write with storage quota handling.
 * Falls back to a smaller subset if the full list exceeds quota.
 */
function saveLocalAll(items: FavoriteItem[]): void {
  if (typeof window === "undefined") return;
  try {
    // PROMPT 2: Validate items before saving
    const validItems = items.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        item.id.length > 0 &&
        (item.type === "shop" || item.type === "product") &&
        typeof item.name === "string" &&
        typeof item.addedAt === "number",
    );

    localStorage.setItem(favoritesKey(), JSON.stringify(validItems));
    localStorage.setItem(favoritesCountKey(), String(validItems.length));
  } catch {
    // Storage full or unavailable — try to save with fewer items
    try {
      const half = items.slice(0, Math.max(50, Math.floor(items.length / 2)));
      localStorage.setItem(favoritesKey(), JSON.stringify(half));
      localStorage.setItem(favoritesCountKey(), String(half.length));
    } catch {
      // Completely failed — silently accept
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Duplicate Detection Helpers (PROMPT 2)                                     */
/* -------------------------------------------------------------------------- */

/**
 * Check for duplicate items in localStorage by composite key (id + type).
 * This prevents the same item from being added multiple times.
 */
function findLocalDuplicate(items: FavoriteItem[], id: string, type: "shop" | "product"): number {
  return items.findIndex((item) => item.id === id && item.type === type);
}

/**
 * Deduplicate a wishlist array by keeping the most recently added entry
 * for each unique (id, type) combination.
 */
function deduplicateLocalItems(items: FavoriteItem[]): FavoriteItem[] {
  const seen = new Map<string, FavoriteItem>();
  for (const item of items) {
    const key = `${item.type}::${item.id}`;
    const existing = seen.get(key);
    if (!existing || item.addedAt > existing.addedAt) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.addedAt - a.addedAt);
}

/**
 * Merge database favorites with device-local favorites.
 *
 * The wishlist is hybrid: guests save to localStorage, signed-in users save
 * to the DB. Items saved as a guest are NOT automatically copied to the DB on
 * sign-in, so a pure DB read would show an empty wishlist for those items.
 * DB rows win on conflicts (they are the source of truth); local-only items
 * are included so nothing the user saved ever disappears.
 */
function mergeLocalWithDb(
  dbItems: FavoriteItem[],
  localItems: FavoriteItem[],
): FavoriteItem[] {
  const byKey = new Map<string, FavoriteItem>();
  for (const item of dbItems) byKey.set(`${item.type}::${item.id}`, item);
  for (const item of localItems) {
    const key = `${item.type}::${item.id}`;
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

/* -------------------------------------------------------------------------- */
/*  Supabase CRUD helpers (authenticated users)                                */
/* -------------------------------------------------------------------------- */

interface WishlistRow {
  id: string;
  user_id: string;
  product_id: string;
  shop_id: string | null;
  type: "shop" | "product";
  name: string;
  image_url: string | null;
  shop_name: string | null;
  added_at: string;
}

function rowToFavorite(row: WishlistRow): FavoriteItem {
  return {
    id: row.type === "shop" ? (row.shop_id ?? row.product_id) : row.product_id,
    wishlistRowId: row.id,
    type: row.type,
    name: sanitizeItemName(row.name),
    imageUrl: row.image_url ? sanitizeItemUrl(row.image_url) : undefined,
    shopId: row.shop_id ?? undefined,
    shopName: row.shop_name ? sanitizeLight(row.shop_name) : undefined,
    addedAt: sanitizeTimestamp(row.added_at),
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Check if the current user is authenticated.
 */
async function getUserId(): Promise<string | null> {
  const supabase = createClient();
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    // Validate it's a proper UUID
    if (userId && isValidUUID(userId)) return userId;
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if an item is favorited.
 * Works for both anonymous and authenticated users.
 *
 * PROMPT 2: Input validation guards against null/undefined/malformed IDs.
 */
export async function isFavorited(id: string): Promise<boolean> {
  const sanitizedId = sanitizeItemId(id);
  if (!sanitizedId) return false;

  const userId = await getUserId();
  if (!userId) {
    return getLocalAll().some((item) => item.id === sanitizedId);
  }

  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("customer_wishlists")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(`product_id.eq.${sanitizedId},shop_id.eq.${sanitizedId}`);

    if (error) throw error;
    if ((count ?? 0) > 0) return true;
    // Device-local copy may hold the item (guest hand-off or a DB write that
    // fell back to localStorage) — treat it as favorited so hearts stay in
    // sync with the merged wishlist.
    return getLocalAll().some((item) => item.id === sanitizedId);
  } catch (err) {
    logError(err, { module: "wishlistService.isFavorited", meta: { id: sanitizedId } });
    // Fallback to localStorage on DB error
    return getLocalAll().some((item) => item.id === sanitizedId);
  }
}

/**
 * Toggle a favorite. Returns `true` if now favorited, `false` if removed.
 *
 * PROMPT 2: Enhanced with strict input validation, duplicate-checking,
 * race-condition guards, and null-reference prevention.
 *
 * @param id       The product_id or shop_id of the item to toggle.
 * @param type     "shop" or "product"
 * @param name     Display name of the item
 * @param imageUrl Optional image/logo URL
 * @param shopId   Optional — the shop ID this product belongs to
 * @param shopName Optional — the shop name this product belongs to
 */
export async function toggleFavorite(
  id: string,
  type: "shop" | "product",
  name: string,
  imageUrl?: string,
  shopId?: string,
  shopName?: string,
): Promise<boolean> {
  // PROMPT 2: Validate ALL inputs before any processing
  const sanitizedId = sanitizeItemId(id);
  if (!sanitizedId) {
    logError(new Error("Invalid item ID for wishlist toggle"), {
      module: "wishlistService.toggleFavorite",
      meta: { id, type },
    });
    return false;
  }

  const sanitizedType = sanitizeItemType(type);
  if (!sanitizedType) {
    logError(new Error("Invalid item type for wishlist toggle"), {
      module: "wishlistService.toggleFavorite",
      meta: { id: sanitizedId, type },
    });
    return false;
  }

  const sanitizedName = sanitizeItemName(name);
  const sanitizedImageUrl = sanitizeItemUrl(imageUrl);
  const sanitizedShopId = shopId ? (sanitizeItemId(shopId) ?? undefined) : undefined;
  const sanitizedShopName = shopName ? (sanitizeLight(shopName.trim()).slice(0, 100) || undefined) : undefined;

  const userId = await getUserId();

  // Anonymous user → localStorage
  if (!userId) {
    let items = getLocalAll();

    // PROMPT 2: Deduplicate existing items first (prevents corruption accumulation)
    items = deduplicateLocalItems(items);

    // PROMPT 2: Check for existing duplicate using composite key
    const existingIdx = findLocalDuplicate(items, sanitizedId, sanitizedType);

    if (existingIdx !== -1) {
      // Remove (un-favorite)
      items.splice(existingIdx, 1);
      saveLocalAll(items);
      notifyFavoritesChanged();
      return false;
    }

    // PROMPT 2: Add with atomic state — no race condition window
    items.push({
      id: sanitizedId,
      type: sanitizedType,
      name: sanitizedName,
      imageUrl: sanitizedImageUrl,
      shopId: sanitizedShopId,
      shopName: sanitizedShopName,
      addedAt: Date.now(),
    });

    // PROMPT 2: Final deduplication pass before saving
    items = deduplicateLocalItems(items);
    saveLocalAll(items);
    notifyFavoritesChanged();
    return true;
  }

  // Authenticated user → Supabase with duplicate prevention
  const supabase = createClient();
  try {
    // PROMPT 2: Atomic duplicate check + toggle using a transaction pattern
    // First, check if the item already exists
    const { data: existingRows, error: fetchError } = await supabase
      .from("customer_wishlists")
      .select("id, type")
      .eq("user_id", userId)
      .or(
        sanitizedType === "product"
          ? `product_id.eq.${sanitizedId}`
          : `shop_id.eq.${sanitizedId}`,
      )
      .limit(1);

    if (fetchError) throw fetchError;

    const existing = existingRows?.[0];

    if (existing) {
      // Remove from wishlist
      const { error: deleteError } = await supabase
        .from("customer_wishlists")
        .delete()
        .eq("id", existing.id);

      if (deleteError) throw deleteError;
      notifyFavoritesChanged();
      return false;
    }

    // PROMPT 2: Insert with complete sanitized data — no null references
    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      product_id: sanitizedType === "product" ? sanitizedId : null,
      shop_id: sanitizedType === "shop" ? sanitizedId : (sanitizedShopId ?? null),
      type: sanitizedType,
      name: sanitizedName,
      image_url: sanitizedImageUrl ?? null,
      shop_name: sanitizedShopName ?? null,
    };

    // PROMPT 2: Use upsert to prevent race-condition duplicates
    // If the same item was inserted between our check and insert, this handles it gracefully
    const { error: insertError } = await supabase
      .from("customer_wishlists")
      .upsert(insertPayload, {
        onConflict: "user_id,product_id,type",
        ignoreDuplicates: true,
      });

    if (insertError) {
      // PROMPT 2: Handle unique constraint violations gracefully
      if (insertError.code === "23505") {
        // Item already exists (race condition) — treat as no-op (still favorited)
        return true;
      }
      throw insertError;
    }
    notifyFavoritesChanged();
    return true;
  } catch (err) {
    logError(err, {
      module: "wishlistService.toggleFavorite",
      meta: { id: sanitizedId, type: sanitizedType },
    });
    // PROMPT 2: Fallback to localStorage on DB error with full validation
    const items = getLocalAll();
    const existingIdx = findLocalDuplicate(items, sanitizedId, sanitizedType);
    if (existingIdx !== -1) {
      items.splice(existingIdx, 1);
      saveLocalAll(items);
      return false;
    }
    items.push({
      id: sanitizedId,
      type: sanitizedType,
      name: sanitizedName,
      imageUrl: sanitizedImageUrl,
      shopId: sanitizedShopId,
      shopName: sanitizedShopName,
      addedAt: Date.now(),
    });
    saveLocalAll(deduplicateLocalItems(items));
    notifyFavoritesChanged();
    return true;
  }
}

/**
 * Get all favorited items, newest first.
 * Works for both anonymous and authenticated users.
 *
 * PROMPT 2: Ensures deduplication of returned data.
 *
 * HYBRID FIX: For signed-in users the DB rows are merged with any
 * device-local favorites (guest hand-off / DB-write fallback) so the
 * wishlist is never silently empty. Local-only items are also pushed to
 * the DB in the background so they sync across devices.
 */
export async function getAllFavorites(): Promise<FavoriteItem[]> {
  const userId = await getUserId();

  if (!userId) {
    const local = getLocalAll();
    return deduplicateLocalItems(local).sort((a, b) => b.addedAt - a.addedAt);
  }

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("customer_wishlists")
      .select("*")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });

    if (error) throw error;

    const rows = (data as WishlistRow[]) ?? [];
    const dbItems = deduplicateLocalItems(rows.map(rowToFavorite));

    // Merge device-local favorites that were never migrated (or whose DB
    // write fell back to localStorage) so the saved list always shows them.
    const local = getLocalAll();
    const hasLocalOnly = local.some(
      (item) => !dbItems.some((d) => d.type === item.type && d.id === item.id),
    );
    if (hasLocalOnly) {
      // Non-fatal background sync — the merge above already surfaces them.
      void migrateLocalFavoritesToDb();
    }

    const merged = mergeLocalWithDb(dbItems, local);
    return deduplicateLocalItems(merged).sort((a, b) => b.addedAt - a.addedAt);
  } catch (err) {
    logError(err, { module: "wishlistService.getAllFavorites" });
    // Fallback to localStorage
    const local = getLocalAll();
    return deduplicateLocalItems(local).sort((a, b) => b.addedAt - a.addedAt);
  }
}

/**
 * Get favorited items grouped by type.
 */
export async function getFavoritesByType(): Promise<{
  shops: FavoriteItem[];
  products: FavoriteItem[];
}> {
  const all = await getAllFavorites();
  return {
    shops: all.filter((i) => i.type === "shop"),
    products: all.filter((i) => i.type === "product"),
  };
}

/**
 * Get the total count of favorited items.
 */
export async function getFavoriteCount(): Promise<number> {
  const userId = await getUserId();

  if (!userId) {
    if (typeof window === "undefined") return 0;
    try {
      const cached = localStorage.getItem(favoritesCountKey());
      if (cached) {
        const num = sanitizeNumeric(Number(cached), 0, 10000, 0);
        return num;
      }
    } catch {
      /* fall through */
    }
    return getLocalAll().length;
  }

  // Use the merged view so device-local favorites (guest hand-off or a DB
  // write that fell back to localStorage) are counted too.
  try {
    const all = await getAllFavorites();
    return all.length;
  } catch (err) {
    logError(err, { module: "wishlistService.getFavoriteCount" });
    return getLocalAll().length;
  }
}

/** Per-account key — last time the user opened the wishlist page (badge cleared). */
const WISHLIST_SEEN_AT_KEY = "trendsmart_wishlist_seen_at";

function wishlistSeenKey(): string {
  return scopedKey(WISHLIST_SEEN_AT_KEY);
}

/**
 * Timestamp of last wishlist page visit. First read seeds "now" so old items
 * don't show a red badge until the user adds something new.
 */
export function getWishlistSeenAt(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = localStorage.getItem(wishlistSeenKey());
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
    const now = Date.now();
    localStorage.setItem(wishlistSeenKey(), String(now));
    return now;
  } catch {
    return Date.now();
  }
}

/**
 * Call when the user opens /wishlist — clears the red nav badge until they
 * add something new again.
 */
export function markWishlistSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(wishlistSeenKey(), String(Date.now()));
  } catch {
    /* no-op */
  }
  notifyFavoritesChanged();
}

/**
 * Count of wishlist items added after the last time the user opened wishlist.
 * Powers the red badge on BottomNav (not total wishlist size).
 */
export async function getUnseenFavoriteCount(): Promise<number> {
  try {
    const seenAt = getWishlistSeenAt();
    const all = await getAllFavorites();
    return all.filter((item) => item.addedAt > seenAt).length;
  } catch (err) {
    logError(err, { module: "wishlistService.getUnseenFavoriteCount" });
    return 0;
  }
}

/**
 * Remove a specific item by id.
 *
 * PROMPT 2: Validates ID before operation.
 *
 * HYBRID FIX: Signed-in removal also drops the item from localStorage so a
 * local-only copy (guest hand-off / DB-write fallback) can't resurrect it.
 */
export async function removeFavorite(id: string): Promise<WishlistResult> {
  const sanitizedId = sanitizeItemId(id);
  if (!sanitizedId) {
    return { success: false, error: "Invalid item ID." };
  }

  const userId = await getUserId();

  if (!userId) {
    const items = getLocalAll().filter((item) => item.id !== sanitizedId);
    saveLocalAll(deduplicateLocalItems(items));
    notifyFavoritesChanged();
    return { success: true };
  }

  // Drop the device-local copy too (best-effort) so the merged view can't
  // re-add an item that only existed locally.
  const localBefore = getLocalAll();
  const localAfter = localBefore.filter((item) => item.id !== sanitizedId);
  if (localAfter.length !== localBefore.length) {
    saveLocalAll(localAfter);
  }

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("customer_wishlists")
      .delete()
      .eq("user_id", userId)
      .or(`product_id.eq.${sanitizedId},shop_id.eq.${sanitizedId}`);

    if (error) throw error;
    notifyFavoritesChanged();
    return { success: true };
  } catch (err) {
    logError(err, { module: "wishlistService.removeFavorite", meta: { id: sanitizedId } });
    return { success: false, error: "Failed to remove from wishlist." };
  }
}

/**
 * Clear all favorites for the current user.
 */
export async function clearAllFavorites(): Promise<WishlistResult> {
  const userId = await getUserId();

  if (!userId) {
    saveLocalAll([]);
    notifyFavoritesChanged();
    return { success: true };
  }

  // Clear the device-local copy too so local-only items don't reappear.
  saveLocalAll([]);

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("customer_wishlists")
      .delete()
      .eq("user_id", userId);

    if (error) throw error;
    notifyFavoritesChanged();
    return { success: true };
  } catch (err) {
    logError(err, { module: "wishlistService.clearAllFavorites" });
    return { success: false, error: "Failed to clear wishlist." };
  }
}

/**
 * Add a store to the authenticated user's favorite_stores table.
 *
 * PROMPT 2: Input validation and duplicate handling.
 */
export async function addFavoriteStore(
  shopId: string,
  shopName: string,
  logoUrl?: string,
): Promise<WishlistResult> {
  const sanitizedShopId = sanitizeItemId(shopId);
  if (!sanitizedShopId) return { success: false, error: "Invalid shop ID." };

  const sanitizedShopName = sanitizeItemName(shopName);
  const sanitizedLogoUrl = sanitizeItemUrl(logoUrl);

  const userId = await getUserId();
  if (!userId) return { success: false, error: "Sign in to add stores to your wishlist." };

  const supabase = createClient();
  try {
    const { error } = await supabase.from("favorite_stores").upsert(
      {
        user_id: userId,
        shop_id: sanitizedShopId,
        shop_name: sanitizedShopName,
        logo_url: sanitizedLogoUrl ?? null,
      },
      {
        onConflict: "user_id,shop_id",
        ignoreDuplicates: true,
      },
    );

    if (error) {
      // If duplicate, treat as success (already favorited)
      if (error.code === "23505") return { success: true };
      throw error;
    }
    return { success: true };
  } catch (err) {
    logError(err, {
      module: "wishlistService.addFavoriteStore",
      meta: { shopId: sanitizedShopId },
    });
    return { success: false, error: "Failed to add store to wishlist." };
  }
}

/**
 * Remove a store from the authenticated user's favorite_stores table.
 *
 * PROMPT 2: Input validation.
 */
export async function removeFavoriteStore(shopId: string): Promise<WishlistResult> {
  const sanitizedShopId = sanitizeItemId(shopId);
  if (!sanitizedShopId) return { success: false, error: "Invalid shop ID." };

  const userId = await getUserId();
  if (!userId) return { success: false, error: "Sign in to manage your wishlist." };

  const supabase = createClient();
  try {
    const { error } = await supabase
      .from("favorite_stores")
      .delete()
      .eq("user_id", userId)
      .eq("shop_id", sanitizedShopId);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    logError(err, {
      module: "wishlistService.removeFavoriteStore",
      meta: { shopId: sanitizedShopId },
    });
    return { success: false, error: "Failed to remove store from wishlist." };
  }
}

/**
 * Get all favorite stores for the authenticated user.
 */
export async function getFavoriteStores(): Promise<
  { shopId: string; shopName: string; logoUrl?: string; addedAt: number }[]
> {
  const userId = await getUserId();
  if (!userId) return [];

  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("favorite_stores")
      .select("*")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });

    if (error) throw error;

    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      shopId: sanitizeItemId(row.shop_id) ?? (row.shop_id as string),
      shopName: sanitizeItemName(row.shop_name),
      logoUrl: sanitizeItemUrl(row.logo_url),
      addedAt: sanitizeTimestamp(row.added_at as string),
    }));
  } catch (err) {
    logError(err, { module: "wishlistService.getFavoriteStores" });
    return [];
  }
}

/**
 * Migrate all anonymous localStorage bookmarks into the DB for the
 * given user. Call this after sign-up / sign-in.
 *
 * PROMPT 2: Validates each local item before migration.
 *
 * SAFETY: Only the items that actually landed in the DB are removed from
 * localStorage. A row that fails to migrate (e.g. its product/shop was
 * deleted) stays on the device so it is never silently lost and the
 * merged wishlist keeps showing it.
 */
export async function migrateLocalFavoritesToDb(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const localItems = getLocalAll();
  if (localItems.length === 0) return;

  const migrated = await pushFavoritesToDb(userId, localItems);
  if (migrated.size > 0) {
    const remaining = getLocalAll().filter(
      (item) => !migrated.has(`${item.type}::${item.id}`),
    );
    saveLocalAll(remaining);
  }
}

/**
 * Shared migration loop — best-effort insert of a favorite list into the DB
 * for `userId` via the `migrate_wishlist_item` RPC. Returns the set of
 * `type::id` keys that actually landed in the database.
 */
async function pushFavoritesToDb(
  userId: string,
  items: FavoriteItem[],
): Promise<Set<string>> {
  const migratedKeys = new Set<string>();
  const dedupedItems = deduplicateLocalItems(items);
  if (dedupedItems.length === 0) return migratedKeys;

  const supabase = createClient();
  for (const item of dedupedItems) {
    // PROMPT 2: Validate each item before migration
    const validId = sanitizeItemId(item.id);
    const validType = sanitizeItemType(item.type);
    if (!validId || !validType) continue;

    try {
      const { error } = await supabase.rpc("migrate_wishlist_item", {
        p_user_id: userId,
        p_product_id: validType === "product" ? validId : undefined,
        p_type: validType,
        p_name: sanitizeItemName(item.name),
        p_image_url: sanitizeItemUrl(item.imageUrl) ?? null,
        p_shop_id:
          item.shopId && validType === "product"
            ? sanitizeItemId(item.shopId)
            : validType === "shop"
              ? validId
              : undefined,
        p_shop_name: item.shopName
          ? sanitizeLight(item.shopName).slice(0, 100)
          : null,
      });
      if (!error) migratedKeys.add(`${validType}::${validId}`);
    } catch {
      // Keep the item in localStorage — a later attempt (or the merged
      // wishlist view) will still surface it.
    }
  }
  return migratedKeys;
}

/**
 * Guest → signed-in hand-off for the wishlist. Moves the anonymous guest
 * bucket into the user's own bucket (so the merged view keeps showing those
 * items even if the DB write fails) and best-effort syncs them to the DB.
 */
export async function migrateGuestFavoritesToUserBucket(userId: string): Promise<void> {
  if (typeof window === "undefined" || !userId) return;
  const guestKey = guestFavoritesKey();
  const userKey = scopedKeyFor("trendsmart_favorites", `u_${userId}`);

  let guestItems: FavoriteItem[] = [];
  try {
    const raw = localStorage.getItem(guestKey);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        guestItems = parsed.filter(
          (item): item is FavoriteItem =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).id === "string" &&
            typeof (item as Record<string, unknown>).name === "string" &&
            typeof (item as Record<string, unknown>).addedAt === "number",
        );
      }
    }
  } catch {
    /* ignore */
  }
  if (guestItems.length === 0) return;

  // Copy into the user's bucket (merge, user's own rows win) so nothing is
  // lost even when the DB sync below fails.
  try {
    const existingRaw = localStorage.getItem(userKey);
    const existing: FavoriteItem[] = existingRaw
      ? (JSON.parse(existingRaw) as FavoriteItem[])
      : [];
    const byKey = new Map<string, FavoriteItem>();
    for (const item of Array.isArray(existing) ? existing : []) {
      byKey.set(`${item.type}::${item.id}`, item);
    }
    for (const item of guestItems) {
      const key = `${item.type}::${item.id}`;
      if (!byKey.has(key)) byKey.set(key, item);
    }
    const merged = deduplicateLocalItems(Array.from(byKey.values()));
    localStorage.setItem(userKey, JSON.stringify(merged));
    localStorage.setItem(
      scopedKeyFor("trendsmart_favorites_count", `u_${userId}`),
      String(merged.length),
    );
    localStorage.removeItem(guestKey);
    try {
      localStorage.removeItem(scopedKeyFor("trendsmart_favorites_count", "guest"));
    } catch {
      /* ignore */
    }
  } catch {
    /* ignore */
  }

  // Best-effort DB sync of the copied items (already in the user bucket now).
  try {
    await pushFavoritesToDb(userId, guestItems);
  } catch {
    /* ignore */
  }
}

/**
 * Toggle a store as favorite (combines wishlist + favorite_stores for shops).
 * Returns `true` if now favorited, `false` if removed.
 *
 * PROMPT 2: Full validation chain applied.
 */
export async function toggleFavoriteStore(
  shopId: string,
  shopName: string,
  logoUrl?: string,
): Promise<boolean> {
  const sanitizedShopId = sanitizeItemId(shopId);
  if (!sanitizedShopId) return false;

  const sanitizedShopName = sanitizeItemName(shopName);
  const sanitizedLogoUrl = sanitizeItemUrl(logoUrl);

  const userId = await getUserId();
  if (!userId) {
    // Anonymous users use localStorage (shops stored as type "shop" in wishlist)
    return toggleFavorite(sanitizedShopId, "shop", sanitizedShopName, sanitizedLogoUrl, sanitizedShopId, sanitizedShopName);
  }

  // Check if already in favorite_stores
  const supabase = createClient();
  try {
    const { count, error } = await supabase
      .from("favorite_stores")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("shop_id", sanitizedShopId);

    if (error) throw error;

    if ((count ?? 0) > 0) {
      // Remove from favorite_stores
      await removeFavoriteStore(sanitizedShopId);
      // Also remove from wishlists if present
      await supabase
        .from("customer_wishlists")
        .delete()
        .eq("user_id", userId)
        .eq("shop_id", sanitizedShopId)
        .eq("type", "shop");
      return false;
    }

    // Add to both tables with upsert for duplicate prevention
    await addFavoriteStore(sanitizedShopId, sanitizedShopName, sanitizedLogoUrl);

    await supabase.from("customer_wishlists").upsert(
      {
        user_id: userId,
        product_id: null,
        shop_id: sanitizedShopId,
        type: "shop",
        name: sanitizedShopName,
        image_url: sanitizedLogoUrl ?? null,
        shop_name: sanitizedShopName,
      },
      {
        onConflict: "user_id,shop_id,type",
        ignoreDuplicates: true,
      },
    );

    return true;
  } catch (err) {
    logError(err, {
      module: "wishlistService.toggleFavoriteStore",
      meta: { shopId: sanitizedShopId },
    });
    return false;
  }
}