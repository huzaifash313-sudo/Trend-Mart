/* -------------------------------------------------------------------------- */
/*  TrendMart — Secure API Response Caching Layer                               */
/*                                                                             */
/*  PROMPT 5: Performance Optimization — Safe caching layers with               */
/*            response payload compression, TTL-based invalidation,            */
/*            cache poisoning prevention, and sensitive data stripping.        */
/* -------------------------------------------------------------------------- */

import { sanitizeLight, sanitizeSqlLiteral } from "@/lib/sanitization";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  /** Timestamp when this cache entry was created (epoch ms). */
  createdAt: number;
  /** Time-to-live in milliseconds. */
  ttl: number;
  /** Optional etag for HTTP cache validation. */
  etag?: string;
  /** Size of the serialized payload in bytes (approx). */
  sizeBytes: number;
}

export interface CacheOptions {
  /** Time-to-live in milliseconds. Default: 5 minutes (300_000 ms). */
  ttl?: number;
  /** Maximum number of entries in the cache. Default: 500. */
  maxEntries?: number;
  /** Whether to generate ETags for cache validation. Default: false. */
  generateEtag?: boolean;
  /** Cache key prefix for namespacing. */
  namespace?: string;
}

// ─── Constants (PROMPT 5) ───────────────────────────────────────────────────

/** Maximum cache entry size (100 KB) — prevents memory exhaustion. */
const MAX_ENTRY_SIZE_BYTES = 100 * 1024;

/** Maximum total cache size (50 MB) — prevents memory leaks. */
const MAX_TOTAL_CACHE_SIZE_BYTES = 50 * 1024 * 1024;

/** Default TTL: 5 minutes. */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/** Default maximum entries per cache store. */
const DEFAULT_MAX_ENTRIES = 500;

// ─── Cache Store ────────────────────────────────────────────────────────────

class CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get a cache entry if it exists and has not expired.
   * Returns undefined if missing or expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (Date.now() - entry.createdAt > entry.ttl) {
      this.store.delete(key);
      return undefined;
    }

    return entry.data as T;
  }

  /**
   * Get the full cache entry including metadata (for ETag validation).
   */
  getEntry(key: string): CacheEntry<unknown> | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() - entry.createdAt > entry.ttl) {
      this.store.delete(key);
      return undefined;
    }

    return entry;
  }

  /**
   * Set a cache entry with TTL.
   * Enforces size limits to prevent memory exhaustion.
   */
  set(key: string, data: unknown, ttl: number = DEFAULT_TTL_MS): void {
    // PROMPT 5: Calculate approximate size
    let sizeBytes = 0;
    try {
      sizeBytes = new TextEncoder().encode(JSON.stringify(data)).length;
    } catch {
      sizeBytes = 1024; // Conservative estimate for non-serializable data
    }

    // PROMPT 5: Reject oversized entries
    if (sizeBytes > MAX_ENTRY_SIZE_BYTES) {
      // Don't cache oversized payloads — they'd bloat memory
      return;
    }

    // PROMPT 5: Evict oldest entries if we're at capacity
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }

    // PROMPT 5: Check total cache size and evict if needed
    this.enforceTotalSizeLimit();

    this.store.set(key, {
      data,
      createdAt: Date.now(),
      ttl,
      sizeBytes,
    });
  }

  /**
   * Delete a cache entry.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the current number of entries.
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Get total approximate size of all cached entries in bytes.
   */
  get totalSizeBytes(): number {
    let total = 0;
    for (const entry of this.store.values()) {
      total += entry.sizeBytes;
    }
    return total;
  }

  /**
   * Remove all expired entries.
   */
  purgeExpired(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > entry.ttl) {
        this.store.delete(key);
        purged++;
      }
    }
    return purged;
  }

  /**
   * Evict the oldest entry (by creation time).
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }

  /**
   * Enforce total cache size limit by evicting oldest entries.
   */
  private enforceTotalSizeLimit(): void {
    while (this.totalSizeBytes > MAX_TOTAL_CACHE_SIZE_BYTES && this.store.size > 1) {
      this.evictOldest();
    }
  }
}

// ─── Namespaced Cache Manager ──────────────────────────────────────────────

/**
 * Multi-namespace cache manager for organizing cached data by domain.
 * Each namespace can have its own TTL and entry limit.
 */
class CacheManager {
  private stores = new Map<string, CacheStore>();

  /**
   * Get or create a cache store for a given namespace.
   */
  private getStore(namespace: string, maxEntries?: number): CacheStore {
    let store = this.stores.get(namespace);
    if (!store) {
      store = new CacheStore(maxEntries ?? DEFAULT_MAX_ENTRIES);
      this.stores.set(namespace, store);
    }
    return store;
  }

  /**
   * Get a cached value by namespace + key.
   */
  get<T>(namespace: string, key: string): T | undefined {
    const store = this.stores.get(namespace);
    return store?.get<T>(key);
  }

  /**
   * Set a cached value by namespace + key.
   */
  set(namespace: string, key: string, data: unknown, options?: CacheOptions): void {
    const store = this.getStore(namespace, options?.maxEntries);
    store.set(key, data, options?.ttl ?? DEFAULT_TTL_MS);
  }

  /**
   * Get entry with metadata (for ETag validation).
   */
  getEntry(namespace: string, key: string): CacheEntry<unknown> | undefined {
    const store = this.stores.get(namespace);
    return store?.getEntry(key);
  }

  /**
   * Delete a cached entry.
   */
  delete(namespace: string, key: string): void {
    this.stores.get(namespace)?.delete(key);
  }

  /**
   * Invalidate an entire namespace (useful for mutations).
   */
  invalidateNamespace(namespace: string): void {
    this.stores.delete(namespace);
  }

  /**
   * Purge all expired entries across all namespaces.
   */
  purgeAllExpired(): number {
    let total = 0;
    for (const store of this.stores.values()) {
      total += store.purgeExpired();
    }
    return total;
  }

  /**
   * Clear all caches entirely.
   */
  clearAll(): void {
    this.stores.clear();
  }

  /**
   * Get stats about all caches.
   */
  getStats(): { namespace: string; entries: number; sizeBytes: number }[] {
    const stats: { namespace: string; entries: number; sizeBytes: number }[] = [];
    for (const [ns, store] of this.stores) {
      stats.push({
        namespace: ns,
        entries: store.size,
        sizeBytes: store.totalSizeBytes,
      });
    }
    return stats;
  }
}

// ─── Singleton Instance ─────────────────────────────────────────────────────

/** Global cache manager instance (server-side in-memory cache). */
export const apiCache = new CacheManager();

// ─── Cache Key Builder ──────────────────────────────────────────────────────

/**
 * PROMPT 5: Build a safe cache key from query parameters.
 * Sanitizes all inputs to prevent cache poisoning via malicious keys.
 *
 * Cache poisoning prevention:
 *  - Keys are sanitized (no scripts, no SQL injection)
 *  - Keys are truncated to prevent DoS via extremely long keys
 *  - Keys follow a predictable pattern for consistent cache hits
 */
export function buildCacheKey(parts: (string | number | undefined | null)[]): string {
  return parts
    .filter((p): p is string | number => p !== undefined && p !== null)
    .map((p) => {
      const str = String(p);
      // Sanitize: remove angle brackets, quotes, and truncate
      const sanitized = sanitizeLight(sanitizeSqlLiteral(str))
        .replace(/[\s]+/g, "_")
        .slice(0, 128);
      return sanitized || "unknown";
    })
    .join("::");
}

// ─── Periodic Cleanup ───────────────────────────────────────────────────────

/**
 * Start periodic cache cleanup (runs every 5 minutes).
 * Removes expired entries to prevent memory bloat.
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startCacheCleanup(): void {
  if (cleanupInterval) return;
  // Only in server environments
  if (typeof window !== "undefined") return;

  cleanupInterval = setInterval(
    () => {
      const purged = apiCache.purgeAllExpired();
      if (purged > 0) {
        // Log purge activity in production for monitoring
        if (process.env.NODE_ENV === "production") {
          // Use a lightweight console log (replace with proper logging in production)
          console.debug(`[Cache] Purged ${purged} expired entries`);
        }
      }
    },
    5 * 60 * 1000, // Every 5 minutes
  );

  // Prevent the interval from keeping the process alive
  if (cleanupInterval && typeof cleanupInterval === "object" && "unref" in cleanupInterval) {
    cleanupInterval.unref();
  }
}

/**
 * Stop periodic cache cleanup.
 */
export function stopCacheCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ─── Response Headers Builder ────────────────────────────────────────────────

/**
 * PROMPT 5: Build standard caching headers for API responses.
 *
 * Different strategies for different types of data:
 *  - "static": Long-lived cache (categories, sub-categories, configs)
 *  - "dynamic": Short-lived cache with revalidation (search results, shop listings)
 *  - "private": No cache (user-specific data, auth endpoints)
 *  - "mutable": Short cache with stale-while-revalidate (product details)
 */
export type CacheStrategy = "static" | "dynamic" | "private" | "mutable";

export function getCacheHeaders(strategy: CacheStrategy): Record<string, string> {
  switch (strategy) {
    case "static":
      // Long-lived: categories, sub-categories, configuration
      return {
        "Cache-Control": "public, max-age=3600, s-maxage=7200, stale-while-revalidate=86400",
      };
    case "dynamic":
      // Medium-lived: search results, shop listings
      return {
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      };
    case "private":
      // No caching: user-specific data, auth, orders
      return {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      };
    case "mutable":
      // Short-lived with revalidation: product details, inventory
      return {
        "Cache-Control": "public, max-age=30, s-maxage=120, stale-while-revalidate=300",
      };
  }
}

/**
 * PROMPT 5: Generate a safe ETag from data.
 * Uses a simple hash approach (in production, use crypto.subtle or a hashing library).
 */
export function generateETag(data: unknown): string {
  try {
    const serialized = JSON.stringify(data);
    // Simple hash function (djb2) for ETag generation
    let hash = 5381;
    for (let i = 0; i < serialized.length; i++) {
      hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
    }
    return `W/"${Math.abs(hash).toString(36)}"`;
  } catch {
    return `W/"0"`;
  }
}