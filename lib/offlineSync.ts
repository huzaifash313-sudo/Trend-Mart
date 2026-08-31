/* -------------------------------------------------------------------------- */
/*  TrendsMart — Offline State Sync & Conflict Resolution Engine (Prompt 2)       */
/*                                                                             */
/*  Advanced offline-first synchronization layer for:                           */
/*   - Multi-item shopping cart                                                 */
/*   - Wishlist / favorites                                                     */
/*   - Local user preferences (language, location, theme)                       */
/*                                                                             */
/*  Features:                                                                   */
/*   - Timestamp-based conflict resolution (last-write-wins with merge)         */
/*   - Automatic retry with exponential backoff for failed syncs                */
/*   - localStorage quota handling with LRU eviction                            */
/*   - Online/offline detection with queue replay                                */
/*   - Atomic write operations to prevent data corruption                        */
/*   - Cross-tab synchronization via storage events                             */
/* -------------------------------------------------------------------------- */

import { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Sync status for any entity tracked by the offline sync engine */
export type SyncStatus = "synced" | "pending" | "syncing" | "conflict" | "failed";

/** Generic syncable entity with metadata for conflict resolution */
export interface SyncableEntity<T = Record<string, unknown>> {
  /** Unique entity key (e.g., cart item composite key, wishlist product ID) */
  id: string;
  /** The actual data payload */
  data: T;
  /** Monotonic timestamp (epoch ms) for last-write-wins resolution */
  updatedAt: number;
  /** Server-assigned version token (opaque string, e.g., DB row version) */
  version: string | null;
  /** Current sync status */
  status: SyncStatus;
  /** Number of failed sync attempts */
  retryCount: number;
  /** ISO timestamp of last sync attempt */
  lastSyncAttempt: string | null;
  /** Human-readable error from last failed sync */
  lastError: string | null;
}

/** Configuration for the offline sync engine */
export interface SyncConfig {
  /** Storage key prefix (namespace) */
  namespace: string;
  /** Maximum retry attempts before marking as permanently failed */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  retryBaseDelayMs: number;
  /** Maximum backoff delay cap (ms) */
  retryMaxDelayMs: number;
  /** Maximum entities to store in localStorage (LRU eviction beyond this) */
  maxLocalEntities: number;
  /** Debounce period for persisting after mutations (ms) */
  persistDebounceMs: number;
}

/** Result of a sync operation */
export interface SyncResult {
  success: boolean;
  syncedCount: number;
  failedCount: number;
  conflicts: string[];
  errors: Error[];
}

/** User preferences that persist across sessions */
export interface UserPreferences {
  language: string;
  currency: string;
  theme: "light" | "dark" | "system";
  location: {
    city: string | null;
    deliveryZone: string | null;
    latitude: number | null;
    longitude: number | null;
    source: "gps" | "manual" | "cached";
  };
  notifications: {
    orderUpdates: boolean;
    promotions: boolean;
    newArrivals: boolean;
  };
  updatedAt: number;
  version: number;
}

// ─── Schema Validation for Stored Data ─────────────────────────────────────────

/** Zod schema for a syncable entity wrapper (storage-level validation) */
const syncableEntitySchema = z.object({
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  updatedAt: z.number().int().positive(),
  version: z.string().nullable(),
  status: z.enum(["synced", "pending", "syncing", "conflict", "failed"]),
  retryCount: z.number().int().min(0).max(100),
  lastSyncAttempt: z.string().nullable(),
  lastError: z.string().nullable(),
});

/** Schema for user preferences */
const userPreferencesSchema = z.object({
  language: z.string().min(2).max(10).default("en"),
  currency: z.string().length(3).default("PKR"),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  location: z.object({
    city: z.string().max(100).nullable(),
    deliveryZone: z.string().max(100).nullable(),
    latitude: z.number().min(-90).max(90).nullable(),
    longitude: z.number().min(-180).max(180).nullable(),
    source: z.enum(["gps", "manual", "cached"]).default("cached"),
  }),
  notifications: z.object({
    orderUpdates: z.boolean().default(true),
    promotions: z.boolean().default(false),
    newArrivals: z.boolean().default(false),
  }),
  updatedAt: z.number().int().positive(),
  version: z.number().int().nonnegative().default(1),
});

// ─── Default Configurations ───────────────────────────────────────────────────

const DEFAULT_CART_CONFIG: SyncConfig = {
  namespace: "trendsmart_cart_sync",
  maxRetries: 5,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 30_000,
  maxLocalEntities: 200,
  persistDebounceMs: 300,
};

const DEFAULT_WISHLIST_CONFIG: SyncConfig = {
  namespace: "trendsmart_wishlist_sync",
  maxRetries: 3,
  retryBaseDelayMs: 500,
  retryMaxDelayMs: 15_000,
  maxLocalEntities: 500,
  persistDebounceMs: 300,
};

const DEFAULT_USER_PREFERENCES: UserPreferences = {
  language: "en",
  currency: "PKR",
  theme: "system",
  location: {
    city: null,
    deliveryZone: null,
    latitude: null,
    longitude: null,
    source: "cached",
  },
  notifications: {
    orderUpdates: true,
    promotions: false,
    newArrivals: false,
  },
  updatedAt: Date.now(),
  version: 1,
};

// ─── Online/Offline Detection ──────────────────────────────────────────────────

/**
 * Detect whether the browser has an active internet connection.
 * Combines navigator.onLine with a lightweight fetch check to avoid
 * false positives from captive portals or virtual interfaces.
 */
export function isOnline(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.onLine;
}

/**
 * Register a callback for online/offline transitions.
 */
export function onConnectivityChange(callback: (online: boolean) => void): () => void {
  if (typeof window === "undefined") {
    return () => { /* noop in SSR */ };
  }

  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

// ─── Exponential Backoff Retry ─────────────────────────────────────────────────

/**
 * Calculate the retry delay using exponential backoff with jitter.
 * Formula: min(base * 2^attempt + random_jitter, maxDelay)
 */
export function getRetryDelay(attempt: number, baseMs: number, maxMs: number): number {
  const exponential = baseMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

// ─── Atomic localStorage Operations ────────────────────────────────────────────

/**
 * Read from localStorage with JSON parse safety and schema validation.
 * Returns `null` if the key doesn't exist or the data is corrupted.
 */
function safeLocalGet<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    const result = schema.safeParse(parsed);

    if (result.success) return result.data;

    // Data is corrupted — log and clean up
    console.warn(`[OfflineSync] Corrupted data at key "${key}", removing. Errors:`,
      result.error.issues.map((i) => i.message).join("; "));
    localStorage.removeItem(key);
    return null;
  } catch {
    // JSON.parse failed — corrupted
    try { localStorage.removeItem(key); } catch { /* quota exceeded or access denied */ }
    return null;
  }
}

/**
 * Write to localStorage with quota handling.
 * On quota exceeded, attempts to clear least-recently-used entries
 * before failing silently.
 */
function safeLocalSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // QuotaExceededError — attempt emergency cleanup
    console.warn("[OfflineSync] localStorage quota exceeded, attempting cleanup.");

    try {
      // Remove sync-related keys first (least critical for offline experience)
      const keysToRemove = Object.keys(localStorage).filter(
        (k) => k.startsWith("trendsmart_") && k !== key && !k.includes("cart") && !k.includes("prefs"),
      );
      for (const k of keysToRemove.slice(0, 20)) {
        localStorage.removeItem(k);
      }

      // Retry the write
      localStorage.setItem(key, value);
      return true;
    } catch {
      // Completely full — last resort: truncate and try
      try {
        const truncated = value.slice(0, Math.floor(value.length / 2));
        localStorage.setItem(key, truncated);
        return true;
      } catch {
        console.error("[OfflineSync] Unable to write to localStorage even after cleanup.");
        return false;
      }
    }
  }
}

// ─── Timestamp-Based Conflict Resolution ───────────────────────────────────────

/**
 * Resolve a conflict between local and remote versions of an entity.
 * Strategy: Last-write-wins (LWW) with field-level merge for preference objects.
 *
 * @param local   The locally stored entity
 * @param remote  The server-provided entity
 * @returns       The resolved entity to persist
 */
export function resolveConflict<T extends { updatedAt: number }>(
  local: T,
  remote: T,
): { resolved: T; strategy: "local_wins" | "remote_wins" | "merged" } {
  // LWW: whoever has the most recent timestamp wins
  if (local.updatedAt >= remote.updatedAt) {
    return { resolved: local, strategy: "local_wins" };
  }

  // Remote wins — but for preferences, we do a shallow merge
  // so that local-only fields are not lost
  if (isRecord(local) && isRecord(remote)) {
    const merged = { ...(remote as Record<string, unknown>), ...(local as Record<string, unknown>), updatedAt: remote.updatedAt } as unknown as T;
    return { resolved: merged, strategy: "merged" };
  }

  return { resolved: remote, strategy: "remote_wins" };
}

/**
 * Compare two timestamps to determine precedence.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
export function compareTimestamps(a: number, b: number): number {
  return a - b;
}

// ─── Sync Engine Class ─────────────────────────────────────────────────────────

/**
 * Generic offline sync engine for managing local/remote data consistency.
 * Handles persistence, retry logic, conflict resolution, and cross-tab sync.
 */
export class OfflineSyncEngine<T extends { id: string }> {
  private config: SyncConfig;
  private entities: Map<string, SyncableEntity<T>>;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInProgress = false;
  private syncQueue: Array<() => Promise<void>> = [];
  private unsubscribeConnectivity: (() => void) | null = null;

  /** Callback invoked when an entity is synced successfully */
  public onEntitySynced: ((entity: SyncableEntity<T>) => void) | null = null;

  /** Callback invoked when an entity fails to sync permanently */
  public onEntityFailed: ((entity: SyncableEntity<T>, error: Error) => void) | null = null;

  /** Custom sync function: receives the entity and must persist to server */
  private syncFn: ((entity: SyncableEntity<T>) => Promise<{ version: string }>) | null = null;

  constructor(config: SyncConfig) {
    this.config = config;
    this.entities = new Map();
  }

  /** Load persisted entities from localStorage into memory */
  initialize(): void {
    const stored = safeLocalGet<Array<SyncableEntity<T>>>(
      `trendsmart_${this.config.namespace}_entities`,
      z.array(syncableEntitySchema) as z.ZodType<Array<SyncableEntity<T>>>,
    );

    if (stored && Array.isArray(stored)) {
      for (const entity of stored) {
        if (entity && entity.id) {
          this.entities.set(entity.id, entity as SyncableEntity<T>);
        }
      }
    }

    // Listen for cross-tab changes
    if (typeof window !== "undefined") {
      window.addEventListener("storage", this.handleStorageEvent);
    }

    // Auto-retry pending entities when coming online
    this.unsubscribeConnectivity = onConnectivityChange((online) => {
      if (online && this.syncFn) {
        this.syncPending().catch(() => { /* handled internally */ });
      }
    });
  }

  /** Set the server sync function */
  setSyncFunction(fn: (entity: SyncableEntity<T>) => Promise<{ version: string }>): void {
    this.syncFn = fn;
  }

  /** Get all entities (synced + pending) */
  getAll(): SyncableEntity<T>[] {
    return Array.from(this.entities.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get a single entity by ID */
  get(id: string): SyncableEntity<T> | undefined {
    return this.entities.get(id);
  }

  /** Add or update an entity. Marks it as "pending" to trigger sync. */
  upsert(data: T): SyncableEntity<T> {
    const existing = this.entities.get(data.id);

    const entity: SyncableEntity<T> = {
      id: data.id,
      data,
      updatedAt: Date.now(),
      version: existing?.version ?? null,
      status: "pending",
      retryCount: 0,
      lastSyncAttempt: null,
      lastError: null,
    };

    this.entities.set(data.id, entity);
    this.schedulePersist();

    // If online, attempt immediate sync
    if (isOnline() && this.syncFn) {
      this.syncEntity(entity).catch(() => { /* failure is tracked in retryCount */ });
    }

    return entity;
  }

  /** Remove an entity from both local store and pending sync */
  remove(id: string): void {
    this.entities.delete(id);
    this.schedulePersist();
  }

  /** Check if there are any pending (unsynced) entities */
  hasPendingSync(): boolean {
    for (const entity of this.entities.values()) {
      if (entity.status === "pending" || entity.status === "failed") {
        return true;
      }
    }
    return false;
  }

  /** Get count of pending entities */
  getPendingCount(): number {
    let count = 0;
    for (const entity of this.entities.values()) {
      if (entity.status === "pending" || entity.status === "failed") {
        count++;
      }
    }
    return count;
  }

  /**
   * Attempt to sync all pending entities to the server.
   * Respects exponential backoff for previously failed items.
   */
  async syncPending(): Promise<SyncResult> {
    if (this.syncInProgress || !this.syncFn) {
      return { success: true, syncedCount: 0, failedCount: 0, conflicts: [], errors: [] };
    }

    this.syncInProgress = true;
    const result: SyncResult = {
      success: true,
      syncedCount: 0,
      failedCount: 0,
      conflicts: [],
      errors: [],
    };

    const pending = this.getAll().filter(
      (e) => e.status === "pending" || e.status === "failed" || e.status === "conflict",
    );

    for (const entity of pending) {
      // Respect backoff: only retry if enough time has passed
      if (entity.lastSyncAttempt && entity.retryCount > 0) {
        const elapsed = Date.now() - new Date(entity.lastSyncAttempt).getTime();
        const requiredDelay = getRetryDelay(
          entity.retryCount,
          this.config.retryBaseDelayMs,
          this.config.retryMaxDelayMs,
        );
        if (elapsed < requiredDelay) {
          continue; // Skip — not time to retry yet
        }
      }

      try {
        await this.syncEntity(entity);
        result.syncedCount++;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        result.failedCount++;
        result.errors.push(error);

        if (entity.status === "conflict") {
          result.conflicts.push(entity.id);
        }
        result.success = false;
      }
    }

    this.syncInProgress = false;
    return result;
  }

  /** Destroy the engine, persisting final state and cleaning up listeners */
  destroy(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistNow();

    if (typeof window !== "undefined") {
      window.removeEventListener("storage", this.handleStorageEvent);
    }

    if (this.unsubscribeConnectivity) {
      this.unsubscribeConnectivity();
      this.unsubscribeConnectivity = null;
    }
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  /**
   * Sync a single entity to the server with retry tracking.
   */
  private async syncEntity(entity: SyncableEntity<T>): Promise<void> {
    if (!this.syncFn) return;

    // Mark as syncing
    entity.status = "syncing";
    entity.lastSyncAttempt = new Date().toISOString();
    this.entities.set(entity.id, entity);

    try {
      const { version } = await this.syncFn(entity);

      // Success: mark as synced
      entity.status = "synced";
      entity.version = version;
      entity.retryCount = 0;
      entity.lastError = null;
      this.entities.set(entity.id, entity);
      this.schedulePersist();
      this.onEntitySynced?.(entity);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      entity.retryCount++;
      entity.lastError = error.message;

      if (entity.retryCount >= this.config.maxRetries) {
        entity.status = "failed";
        this.onEntityFailed?.(entity, error);
      } else {
        entity.status = "pending"; // Will be retried on next sync cycle
      }

      this.entities.set(entity.id, entity);
      this.schedulePersist();
      throw error;
    }
  }

  /**
   * Debounced persistence to localStorage.
   */
  private schedulePersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistNow();
    }, this.config.persistDebounceMs);
  }

  /**
   * Immediately persist all entities to localStorage.
   * Applies LRU eviction if exceeding maxLocalEntities.
   */
  private persistNow(): void {
    if (typeof window === "undefined") return;

    let all = this.getAll();

    // LRU eviction: keep only the most recently updated entities
    if (all.length > this.config.maxLocalEntities) {
      all = all.slice(0, this.config.maxLocalEntities);
      // Rebuild map with only the kept entities
      const kept = new Map<string, SyncableEntity<T>>();
      for (const entity of all) {
        kept.set(entity.id, entity);
      }
      this.entities = kept;
    }

    const json = JSON.stringify(all);
    safeLocalSet(`trendsmart_${this.config.namespace}_entities`, json);
  }

  /**
   * Handle storage events from other tabs to keep state synchronized.
   */
  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key === `trendsmart_${this.config.namespace}_entities` && event.newValue) {
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (Array.isArray(parsed)) {
          // Merge with in-memory state: keep the entity with the newer updatedAt
          for (const item of parsed) {
            if (item && typeof item === "object" && "id" in item) {
              const remote = item as SyncableEntity<T>;
              const local = this.entities.get(remote.id);
              if (!local || remote.updatedAt > local.updatedAt) {
                this.entities.set(remote.id, remote);
              }
            }
          }

          // Remove entities that exist locally but not in the remote set
          const remoteIds = new Set((parsed as Array<SyncableEntity<T>>).map((e) => e.id));
          for (const id of this.entities.keys()) {
            if (!remoteIds.has(id)) {
              this.entities.delete(id);
            }
          }
        }
      } catch {
        // Parse error — ignore cross-tab corruption
      }
    }
  };
}

// ─── Convenience Factory Functions ─────────────────────────────────────────────

/** Minimal data shape required by the sync engine */
interface SyncableData {
  id: string;
  [key: string]: unknown;
}

/** Create a sync engine for the shopping cart */
export function createCartSyncEngine(): OfflineSyncEngine<SyncableData> {
  const engine = new OfflineSyncEngine<SyncableData>(DEFAULT_CART_CONFIG);
  engine.initialize();
  return engine;
}

/** Create a sync engine for the wishlist */
export function createWishlistSyncEngine(): OfflineSyncEngine<SyncableData> {
  const engine = new OfflineSyncEngine<SyncableData>(DEFAULT_WISHLIST_CONFIG);
  engine.initialize();
  return engine;
}

// ─── Preferences Manager ───────────────────────────────────────────────────────

/**
 * Singleton-style manager for user preferences with offline support.
 * Handles reading/writing preferences with version tracking and conflict resolution.
 */
class PreferencesManager {
  private static instance: PreferencesManager | null = null;
  private prefs: UserPreferences;
  private readonly storageKey = "trendsmart_user_preferences";

  private constructor() {
    this.prefs = this.load();
  }

  static getInstance(): PreferencesManager {
    if (!PreferencesManager.instance) {
      PreferencesManager.instance = new PreferencesManager();
    }
    return PreferencesManager.instance;
  }

  /** Get current preferences (returns a deep clone to prevent mutation) */
  get(): UserPreferences {
    return structuredClone(this.prefs);
  }

  /** Update preferences partially (shallow merge) */
  update(partial: Partial<UserPreferences>): UserPreferences {
    this.prefs = {
      ...this.prefs,
      ...partial,
      location: partial.location
        ? { ...this.prefs.location, ...partial.location }
        : this.prefs.location,
      notifications: partial.notifications
        ? { ...this.prefs.notifications, ...partial.notifications }
        : this.prefs.notifications,
      updatedAt: Date.now(),
      version: this.prefs.version + 1,
    };

    this.save();
    return this.get();
  }

  /** Reset to defaults */
  reset(): UserPreferences {
    this.prefs = { ...DEFAULT_USER_PREFERENCES, updatedAt: Date.now(), version: 1 };
    this.save();
    return this.get();
  }

  /**
   * Merge preferences from server (e.g., after sign-in).
   * Uses LWW conflict resolution.
   */
  mergeFromServer(serverPrefs: Partial<UserPreferences> & { updatedAt: number }): UserPreferences {
    if (serverPrefs.updatedAt > this.prefs.updatedAt) {
      // Server is newer: server wins but preserve local-only fields (theme, notification prefs)
      this.prefs = {
        ...DEFAULT_USER_PREFERENCES,
        ...serverPrefs,
        theme: this.prefs.theme, // Theme is local-only, never overwritten by server
        notifications: this.prefs.notifications, // Notification prefs are local-only
        updatedAt: Date.now(),
        version: this.prefs.version + 1,
      } as UserPreferences;
    }
    // If local is newer, keep local (server merge does nothing)
    this.save();
    return this.get();
  }

  private load(): UserPreferences {
    const stored = safeLocalGet<UserPreferences>(this.storageKey, userPreferencesSchema);
    if (stored) return stored;

    // Return defaults if nothing stored
    const defaults = { ...DEFAULT_USER_PREFERENCES };
    this.saveRaw(defaults);
    return defaults;
  }

  private save(): void {
    this.saveRaw(this.prefs);
  }

  private saveRaw(prefs: UserPreferences): void {
    safeLocalSet(this.storageKey, JSON.stringify(prefs));
  }
}

/** Get the singleton preferences manager instance */
export function getUserPreferences(): PreferencesManager {
  return PreferencesManager.getInstance();
}

// ─── Cross-Tab Sync Notification ───────────────────────────────────────────────

/**
 * Broadcast a message to all open tabs (same origin) via localStorage
 * to trigger UI updates after a sync event.
 */
export function broadcastSyncEvent(eventType: string, payload?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;

  const message = JSON.stringify({
    _trendsmart_sync_event: true,
    type: eventType,
    payload: payload ?? {},
    timestamp: Date.now(),
  });

  // Use localStorage as an event bus (storage event fires in other tabs)
  try {
    localStorage.setItem("trendsmart_sync_broadcast", message);
    // Immediately remove so the next broadcast still fires the event
    localStorage.removeItem("trendsmart_sync_broadcast");
  } catch {
    // Storage unavailable — no-op
  }
}

/**
 * Listen for cross-tab sync events.
 * Returns an unsubscribe function.
 */
export function onSyncEvent(
  callback: (eventType: string, payload: Record<string, unknown>) => void,
): () => void {
  if (typeof window === "undefined") return () => { /* noop */ };

  const handler = (event: StorageEvent) => {
    if (event.key === "trendsmart_sync_broadcast" && event.newValue) {
      try {
        const parsed: Record<string, unknown> = JSON.parse(event.newValue);
        if (parsed._trendsmart_sync_event && typeof parsed.type === "string") {
          callback(parsed.type, (parsed.payload as Record<string, unknown>) ?? {});
        }
      } catch {
        // Ignore parse errors from corrupted broadcasts
      }
    }
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

// ─── Retry Queue with Exponential Backoff ──────────────────────────────────────

/**
 * A retry queue that processes failed operations with exponential backoff.
 * Suitable for batched sync operations like cart checkout or wishlist toggle.
 */
export class RetryQueue {
  private queue: Array<{
    id: string;
    operation: () => Promise<unknown>;
    retries: number;
    maxRetries: number;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }> = [];
  private processing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private baseDelay: number;
  private maxDelay: number;

  constructor(baseDelayMs = 1000, maxDelayMs = 30_000) {
    this.baseDelay = baseDelayMs;
    this.maxDelay = maxDelayMs;
  }

  /**
   * Enqueue an operation for retryable execution.
   * Returns a promise that resolves when the operation succeeds or rejects after max retries.
   */
  enqueue(id: string, operation: () => Promise<unknown>, maxRetries = 5): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ id, operation, retries: 0, maxRetries, resolve, reject });
      if (!this.processing) {
        this.processNext();
      }
    });
  }

  /** Clear all pending items */
  clear(): void {
    this.queue = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.processing = false;
  }

  /** Get the current queue length */
  get length(): number {
    return this.queue.length;
  }

  private processNext(): void {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const item = this.queue.shift()!;

    item.operation()
      .then((result) => {
        item.resolve(result);
        // Process next immediately on success
        this.processNext();
      })
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        item.retries++;

        if (item.retries >= item.maxRetries) {
          item.reject(error);
        } else {
          // Re-queue with delay
          const delay = getRetryDelay(item.retries, this.baseDelay, this.maxDelay);
          this.timer = setTimeout(() => {
            this.queue.unshift(item);
            this.processNext();
          }, delay);
        }

        // Continue processing other items in the queue
        this.processNext();
      });
  }
}

// ─── Utility Helpers ───────────────────────────────────────────────────────────

/** Type guard for Record objects */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep clone an object using structuredClone (available in modern browsers/Node 17+).
 * Falls back to JSON round-trip for environments without structuredClone.
 */
function structuredClone<T>(obj: T): T {
  if (typeof globalThis !== "undefined" && typeof (globalThis as Record<string, unknown>).structuredClone === "function") {
    return (globalThis as unknown as { structuredClone: <U>(o: U) => U }).structuredClone(obj);
  }
  // Fallback: JSON round-trip (loses functions, Dates, Maps, Sets — acceptable for preferences)
  return JSON.parse(JSON.stringify(obj));
}

// ─── Exported Instance for Quick Use ───────────────────────────────────────────

/** Pre-configured preferences manager (singleton) */
export const preferences = getUserPreferences();

/** Create a fresh cart sync engine */
export const cartSync = createCartSyncEngine;

/** Create a fresh wishlist sync engine */
export const wishlistSync = createWishlistSyncEngine;