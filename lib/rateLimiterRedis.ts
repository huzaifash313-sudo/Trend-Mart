/* -------------------------------------------------------------------------- */
/*  TrendMart — Distributed Rate-Limiting Adapter (Redis / High-Performance)    */
/*  PROMPT 2: Robust, distributed rate-limiting and request-throttling          */
/*           middleware using Redis or high-performance memory stores           */
/*           at the Next.js API gateway level.                                  */
/* -------------------------------------------------------------------------- */

import {
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimitEntry,
  getRateLimitConfig,
  deriveRateLimitKey,
  buildRateLimitHeaders,
  buildRateLimitResponse,
} from "./rateLimiter";
import type { NextRequest } from "next/server";

// ─── Redis-Compatible Store Interface ────────────────────────────────────────

export interface RedisLikeStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ex?: number }): Promise<"OK" | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  del(key: string): Promise<number>;
  eval?(script: string, keys: string[], args: string[]): Promise<unknown>;
}

// ─── Distributed Rate Limiter ────────────────────────────────────────────────

export class DistributedRateLimiter {
  private store: RedisLikeStore | null;
  private fallbackStore: Map<string, RateLimitEntry>;

  constructor(store?: RedisLikeStore) {
    this.store = store ?? null;
    this.fallbackStore = new Map();
  }

  async checkRateLimit(
    request: NextRequest,
    config?: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const pathname = request.nextUrl.pathname;
    const resolvedConfig = config ?? getRateLimitConfig(pathname);
    const key = deriveRateLimitKey(request);
    const redisKey = `ratelimit:${key}:${pathname}`;

    if (this.store) {
      try {
        return await this.redisSlidingWindowCheck(redisKey, resolvedConfig);
      } catch {
        console.warn("[TrendMart] Redis rate limiter failed, using in-memory fallback.");
      }
    }

    return this.inMemoryCheck(redisKey, resolvedConfig);
  }

  private async redisSlidingWindowCheck(
    key: string,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = config.windowMs;
    const maxRequests = config.maxRequests;
    const windowStart = now - windowMs;

    if (this.store!.eval) {
      return this.redisAtomicCheck(key, maxRequests, windowMs, now, windowStart);
    }

    return this.redisNonAtomicCheck(key, maxRequests, windowMs, now);
  }

  private async redisAtomicCheck(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
    windowStart: number,
  ): Promise<RateLimitResult> {
    const luaScript = `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local windowStart = tonumber(ARGV[2])
      local maxRequests = tonumber(ARGV[3])
      local windowMs = tonumber(ARGV[4])

      redis.call("ZREMRANGEBYSCORE", key, 0, windowStart)
      local count = redis.call("ZCARD", key)

      if count < maxRequests then
        redis.call("ZADD", key, now, now .. "-" .. count)
        redis.call("EXPIRE", key, math.ceil(windowMs / 1000) + 1)
        return {1, maxRequests - count - 1, math.ceil((now + windowMs) / 1000)}
      else
        local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
        local resetAt = oldest[2] and tonumber(oldest[2]) + windowMs or now + windowMs
        return {0, 0, math.ceil(resetAt / 1000)}
      end
    `;

    const result = (await this.store!.eval!(luaScript, [key], [
      String(now),
      String(windowStart),
      String(maxRequests),
      String(windowMs),
    ])) as number[];

    const [allowed, remaining, resetAt] = result;

    if (allowed === 1) {
      return {
        allowed: true,
        remaining: Math.max(0, remaining),
        resetAt,
        limit: maxRequests,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      limit: maxRequests,
      message: `Rate limit exceeded. Please try again later.`,
    };
  }

  private async redisNonAtomicCheck(
    key: string,
    maxRequests: number,
    windowMs: number,
    now: number,
  ): Promise<RateLimitResult> {
    const countStr = await this.store!.get(key);
    const current = countStr ? parseInt(countStr, 10) : 0;

    if (current < maxRequests) {
      const ttlSeconds = Math.ceil(windowMs / 1000);
      if (current === 0) {
        await this.store!.set(key, "1", { ex: ttlSeconds });
      } else {
        await this.store!.incr(key);
      }
      return {
        allowed: true,
        remaining: maxRequests - current - 1,
        resetAt: Math.ceil((now + windowMs) / 1000),
        limit: maxRequests,
      };
    }

    const retryAfter = 60;
    return {
      allowed: false,
      remaining: 0,
      resetAt: Math.ceil((now + retryAfter * 1000) / 1000),
      limit: maxRequests,
      message: `Rate limit exceeded. Please wait ${retryAfter} second(s).`,
    };
  }

  private inMemoryCheck(key: string, config: RateLimitConfig): RateLimitResult {
    const now = Date.now();
    const { maxRequests, windowMs } = config;

    this.cleanupFallbackStore(now);

    const existing = this.fallbackStore.get(key);

    if (!existing || now > existing.resetAt) {
      const entry: RateLimitEntry = {
        count: 1,
        resetAt: now + windowMs,
        tokens: maxRequests - 1,
        lastRefill: now,
      };
      this.fallbackStore.set(key, entry);
      return {
        allowed: true,
        remaining: maxRequests - 1,
        resetAt: Math.ceil((now + windowMs) / 1000),
        limit: maxRequests,
      };
    }

    const elapsed = now - existing.lastRefill;
    const refillRate = maxRequests / windowMs;
    const tokensToAdd = elapsed * refillRate;
    existing.tokens = Math.min(maxRequests, existing.tokens + tokensToAdd);
    existing.lastRefill = now;

    if (existing.tokens >= 1) {
      existing.tokens -= 1;
      existing.count += 1;
      return {
        allowed: true,
        remaining: Math.floor(existing.tokens),
        resetAt: Math.ceil(existing.resetAt / 1000),
        limit: maxRequests,
      };
    }

    existing.count += 1;
    return {
      allowed: false,
      remaining: 0,
      resetAt: Math.ceil(existing.resetAt / 1000),
      limit: maxRequests,
      message: "Rate limit exceeded. Please try again later.",
    };
  }

  private lastFallbackCleanup = 0;

  private cleanupFallbackStore(now: number): void {
    if (now - this.lastFallbackCleanup < 60_000) return;
    this.lastFallbackCleanup = now;

    const maxAge = 600_000;
    for (const [key, entry] of this.fallbackStore) {
      if (now > entry.resetAt + maxAge) {
        this.fallbackStore.delete(key);
      }
    }
  }

  async reset(): Promise<void> {
    this.fallbackStore.clear();
  }

  getStats(): { redisAvailable: boolean; fallbackSize: number } {
    return {
      redisAvailable: this.store !== null,
      fallbackSize: this.fallbackStore.size,
    };
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let distributedLimiterInstance: DistributedRateLimiter | null = null;

export function getDistributedRateLimiter(): DistributedRateLimiter {
  if (!distributedLimiterInstance) {
    distributedLimiterInstance = new DistributedRateLimiter();
  }
  return distributedLimiterInstance;
}

export function configureDistributedRateLimiter(store: RedisLikeStore): void {
  distributedLimiterInstance = new DistributedRateLimiter(store);
}

// ─── Upstash Redis Adapter (Production) ──────────────────────────────────────

export function createUpstashAdapter(upstashClient: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<"OK" | null>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  del: (key: string) => Promise<number>;
  eval?: (script: string, keys: string[], args: string[]) => Promise<unknown>;
}): RedisLikeStore {
  return {
    get: (key) => upstashClient.get(key),
    set: (key, value, opts) => upstashClient.set(key, value, opts),
    incr: (key) => upstashClient.incr(key),
    expire: (key, seconds) => upstashClient.expire(key, seconds),
    del: (key) => upstashClient.del(key),
    eval: upstashClient.eval?.bind(upstashClient),
  };
}

/**
 * Dependency-free Upstash Redis REST adapter.
 *
 * Uses the Upstash REST API directly (Bearer-token auth) so the distributed
 * rate limiter can engage WITHOUT adding the `@upstash/redis` package. The
 * non-atomic INC+EXPIRE path is slightly racy under extreme concurrency but
 * is a massive upgrade over the per-isolate in-memory fallback (which resets
 * on every Vercel cold start). Atomic Lua EVAL remains available when the SDK
 * is used instead via `createUpstashAdapter`.
 */
export function createUpstashRestStore(
  restUrl: string,
  restToken: string,
): RedisLikeStore {
  const base = restUrl.replace(/\/+$/, "");
  const call = async (path: string): Promise<unknown> => {
    const res = await fetch(`${base}${path}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${restToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Upstash REST ${res.status}`);
    }
    const data: unknown = await res.json().catch(() => null);
    if (Array.isArray(data)) return data[1];
    if (data && typeof data === "object" && "result" in data) {
      return (data as { result: unknown }).result;
    }
    return data;
  };

  return {
    async get(key) {
      const value = await call(`/get/${encodeURIComponent(key)}`);
      return value == null ? null : String(value);
    },
    async set(key, value, opts) {
      const ttl = opts?.ex ? `/ex/${opts.ex}` : "";
      const result = await call(
        `/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}${ttl}`,
      );
      return result === "OK" ? "OK" : null;
    },
    async incr(key) {
      const result = await call(`/incr/${encodeURIComponent(key)}`);
      return typeof result === "number" ? result : Number(result) || 0;
    },
    async expire(key, seconds) {
      const result = await call(
        `/expire/${encodeURIComponent(key)}/${Math.max(1, Math.round(seconds))}`,
      );
      return typeof result === "number" ? result : Number(result) || 0;
    },
    async del(key) {
      const result = await call(`/del/${encodeURIComponent(key)}`);
      return typeof result === "number" ? result : Number(result) || 0;
    },
  };
}

/**
 * Bootstraps the distributed limiter from env vars when present (safe no-op
 * otherwise). Call once during app/middleware startup.
 */
export function bootstrapDistributedRateLimiter(): void {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  try {
    configureDistributedRateLimiter(createUpstashRestStore(url, token));
    console.info(
      "[TrendMart] Distributed rate limiter engaged (Upstash REST).",
    );
  } catch (err) {
    console.warn(
      "[TrendMart] Failed to initialise distributed rate limiter — using in-memory fallback.",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ─── API Route Wrapper ───────────────────────────────────────────────────────

export function withDistributedRateLimit(
  handler: (request: NextRequest, ...args: unknown[]) => Promise<Response>,
  config?: RateLimitConfig,
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<Response> => {
    const limiter = getDistributedRateLimiter();
    const result = await limiter.checkRateLimit(request, config);

    if (!result.allowed) {
      const { status, body, headers } = buildRateLimitResponse(result);
      return new Response(JSON.stringify(body), { status, headers });
    }

    const response = await handler(request, ...args);

    const rateLimitHeaders = buildRateLimitHeaders(result);
    const newHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(rateLimitHeaders)) {
      newHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  };
}