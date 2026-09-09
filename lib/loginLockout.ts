/* -------------------------------------------------------------------------- */
/*  TrendsMart — Progressive login lockout (Redis-backed + memory fallback)    */
/*                                                                             */
/*  Protects password grant attempts against brute-force / credential stuffing */
/*  on our auth API surface.                                                   */
/*                                                                             */
/*  Policy:                                                                    */
/*   - Failures 1–4: allow retry immediately                                   */
/*   - Failure 5+: lock for (failures − 4) minutes (5→1m, 6→2m, …)             */
/*   - Failure ≥10: force password-reset path (block password sign-in)         */
/*   - Force-reset auto-expires after 24h so a lost mailbox isn't forever      */
/*   - Per-IP spray cap (independent of email)                                 */
/*   - Forgot-password: max 2 successful sends per email / 30 minutes          */
/*                                                                             */
/*  Storage: Upstash Redis REST when configured (survives cold starts /        */
/*  multi-instance). Falls back to in-process Maps for local/dev.              */
/* -------------------------------------------------------------------------- */

import {
  createUpstashRestStore,
  type RedisLikeStore,
} from "@/lib/rateLimiterRedis";

export const LOGIN_LOCKOUT = {
  /** Wrong attempts allowed before the first cooldown starts. */
  FREE_ATTEMPTS: 5,
  /** Extra lock duration added per failure after the free window. */
  LOCK_STEP_MS: 60_000,
  /** Cap a single progressive lock so wait times stay human. */
  MAX_LOCK_MS: 15 * 60_000,
  /** After this many failures, require forgot-password. */
  FORCE_RESET_AFTER: 10,
  /** How long force-reset stays active without a successful reset/login. */
  FORCE_RESET_TTL_MS: 24 * 60 * 60_000,
  /** How long failure counters are remembered. */
  FAILURE_WINDOW_MS: 60 * 60_000,
  /** IP spray: max failed password attempts from one IP per window. */
  IP_MAX_FAILURES: 30,
  IP_WINDOW_MS: 60 * 60_000,
  /** Forgot-password successful sends per email. */
  FORGOT_MAX_SENDS: 2,
  FORGOT_WINDOW_MS: 30 * 60_000,
} as const;

export interface LockoutSnapshot {
  allowed: boolean;
  failures: number;
  retryAfterSec: number;
  lockedUntil: number | null;
  forceReset: boolean;
  message?: string;
}

interface EmailLockState {
  failures: number;
  lockedUntil: number;
  forceReset: boolean;
  forceResetUntil: number;
  updatedAt: number;
}

interface CounterState {
  count: number;
  resetAt: number;
}

const emailLocks = new Map<string, EmailLockState>();
const ipFailures = new Map<string, CounterState>();
const forgotSends = new Map<string, CounterState>();

let redisStore: RedisLikeStore | null | undefined;

function getStore(): RedisLikeStore | null {
  if (redisStore !== undefined) return redisStore;
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (url && token) {
    try {
      redisStore = createUpstashRestStore(url, token);
      return redisStore;
    } catch {
      redisStore = null;
      return null;
    }
  }
  redisStore = null;
  return null;
}

function now(): number {
  return Date.now();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().slice(0, 254);
}

function sanitizeIp(ip: string): string {
  return ip.replace(/[^0-9a-fA-F.:]/g, "").slice(0, 45) || "unknown";
}

function lockDurationMs(failures: number): number {
  if (failures < LOGIN_LOCKOUT.FREE_ATTEMPTS) return 0;
  const steps = failures - (LOGIN_LOCKOUT.FREE_ATTEMPTS - 1);
  return Math.min(steps * LOGIN_LOCKOUT.LOCK_STEP_MS, LOGIN_LOCKOUT.MAX_LOCK_MS);
}

function pruneMaps(ts: number): void {
  for (const [key, state] of emailLocks) {
    const stale =
      ts - state.updatedAt > LOGIN_LOCKOUT.FAILURE_WINDOW_MS &&
      ts > state.lockedUntil &&
      (!state.forceReset || ts > state.forceResetUntil);
    if (stale) emailLocks.delete(key);
  }
  for (const [key, state] of ipFailures) {
    if (ts > state.resetAt) ipFailures.delete(key);
  }
  for (const [key, state] of forgotSends) {
    if (ts > state.resetAt) forgotSends.delete(key);
  }
}

function emailRedisKey(email: string): string {
  return `loginlock:email:${normalizeEmail(email)}`;
}

function ipRedisKey(ip: string): string {
  return `loginlock:ip:${sanitizeIp(ip)}`;
}

function forgotRedisKey(email: string): string {
  return `loginlock:forgot:${normalizeEmail(email)}`;
}

async function readJson<T>(key: string): Promise<T | null> {
  const store = getStore();
  if (!store) return null;
  try {
    const raw = await store.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  const store = getStore();
  if (!store) return;
  try {
    await store.set(key, JSON.stringify(value), { ex: Math.max(60, ttlSec) });
  } catch {
    /* fall through to memory */
  }
}

async function deleteKey(key: string): Promise<void> {
  const store = getStore();
  if (!store) return;
  try {
    await store.del(key);
  } catch {
    /* ignore */
  }
}

function getEmailStateMemory(email: string): EmailLockState {
  const key = normalizeEmail(email);
  const existing = emailLocks.get(key);
  if (existing) {
    const ts = now();
    if (existing.forceReset && ts > existing.forceResetUntil) {
      existing.forceReset = false;
      existing.forceResetUntil = 0;
      existing.failures = 0;
      existing.lockedUntil = 0;
    }
    if (
      !existing.forceReset &&
      ts - existing.updatedAt > LOGIN_LOCKOUT.FAILURE_WINDOW_MS &&
      ts > existing.lockedUntil
    ) {
      existing.failures = 0;
      existing.lockedUntil = 0;
    }
    return existing;
  }
  const fresh: EmailLockState = {
    failures: 0,
    lockedUntil: 0,
    forceReset: false,
    forceResetUntil: 0,
    updatedAt: now(),
  };
  emailLocks.set(key, fresh);
  return fresh;
}

async function loadEmailState(email: string): Promise<EmailLockState> {
  const remote = await readJson<EmailLockState>(emailRedisKey(email));
  if (remote && typeof remote.failures === "number") {
    emailLocks.set(normalizeEmail(email), remote);
    return getEmailStateMemory(email);
  }
  return getEmailStateMemory(email);
}

async function persistEmailState(email: string, state: EmailLockState): Promise<void> {
  emailLocks.set(normalizeEmail(email), state);
  const ttlSec = Math.ceil(
    Math.max(
      LOGIN_LOCKOUT.FAILURE_WINDOW_MS,
      state.forceReset ? LOGIN_LOCKOUT.FORCE_RESET_TTL_MS : 0,
      Math.max(0, state.lockedUntil - now()),
    ) / 1000,
  );
  await writeJson(emailRedisKey(email), state, ttlSec + 60);
}

function snapshotFromState(state: EmailLockState, ipBlocked = false): LockoutSnapshot {
  const ts = now();
  if (ipBlocked) {
    return {
      allowed: false,
      failures: state.failures,
      retryAfterSec: 60,
      lockedUntil: ts + 60_000,
      forceReset: false,
      message: "Too many sign-in attempts from this network. Please wait a minute and try again.",
    };
  }

  if (state.forceReset && ts <= state.forceResetUntil) {
    return {
      allowed: false,
      failures: state.failures,
      retryAfterSec: Math.max(1, Math.ceil((state.forceResetUntil - ts) / 1000)),
      lockedUntil: state.forceResetUntil,
      forceReset: true,
      message:
        "This account is temporarily locked after too many failed attempts. Reset your password with email verification to continue.",
    };
  }

  if (state.lockedUntil > ts) {
    const retryAfterSec = Math.max(1, Math.ceil((state.lockedUntil - ts) / 1000));
    return {
      allowed: false,
      failures: state.failures,
      retryAfterSec,
      lockedUntil: state.lockedUntil,
      forceReset: false,
      message: `Too many incorrect passwords. Try again in ${formatWait(retryAfterSec)}.`,
    };
  }

  return {
    allowed: true,
    failures: state.failures,
    retryAfterSec: 0,
    lockedUntil: null,
    forceReset: false,
  };
}

function formatWait(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m}m ${s}s`;
}

async function isIpOverLimit(ip: string): Promise<boolean> {
  const remote = await readJson<CounterState>(ipRedisKey(ip));
  const ts = now();
  if (remote && ts <= remote.resetAt) {
    return remote.count >= LOGIN_LOCKOUT.IP_MAX_FAILURES;
  }
  const key = sanitizeIp(ip);
  const entry = ipFailures.get(key);
  if (!entry || ts > entry.resetAt) return false;
  return entry.count >= LOGIN_LOCKOUT.IP_MAX_FAILURES;
}

async function bumpIpFailure(ip: string): Promise<void> {
  const key = sanitizeIp(ip);
  const ts = now();
  const remote = await readJson<CounterState>(ipRedisKey(ip));
  let next: CounterState;
  if (!remote || ts > remote.resetAt) {
    next = { count: 1, resetAt: ts + LOGIN_LOCKOUT.IP_WINDOW_MS };
  } else {
    next = { count: remote.count + 1, resetAt: remote.resetAt };
  }
  ipFailures.set(key, next);
  await writeJson(
    ipRedisKey(ip),
    next,
    Math.ceil((next.resetAt - ts) / 1000) + 30,
  );
}

/**
 * Read current lockout status without mutating counters.
 * Prefer `getLoginLockoutAsync` in API routes (Redis-aware).
 */
export function getLoginLockout(email: string, ip: string): LockoutSnapshot {
  pruneMaps(now());
  const state = getEmailStateMemory(email);
  const key = sanitizeIp(ip);
  const entry = ipFailures.get(key);
  const ipBlocked =
    !!entry && now() <= entry.resetAt && entry.count >= LOGIN_LOCKOUT.IP_MAX_FAILURES;
  return snapshotFromState(state, ipBlocked);
}

export async function getLoginLockoutAsync(
  email: string,
  ip: string,
): Promise<LockoutSnapshot> {
  pruneMaps(now());
  const state = await loadEmailState(email);
  return snapshotFromState(state, await isIpOverLimit(ip));
}

/**
 * Record a failed password attempt. Returns the updated lockout snapshot.
 * Prefer `recordLoginFailureAsync` in API routes.
 */
export function recordLoginFailure(email: string, ip: string): LockoutSnapshot {
  pruneMaps(now());
  const key = sanitizeIp(ip);
  const ts = now();
  const entry = ipFailures.get(key);
  if (!entry || ts > entry.resetAt) {
    ipFailures.set(key, { count: 1, resetAt: ts + LOGIN_LOCKOUT.IP_WINDOW_MS });
  } else {
    entry.count += 1;
  }

  const state = getEmailStateMemory(email);
  state.failures += 1;
  state.updatedAt = ts;
  state.lockedUntil = ts + lockDurationMs(state.failures);

  if (state.failures >= LOGIN_LOCKOUT.FORCE_RESET_AFTER) {
    state.forceReset = true;
    state.forceResetUntil = ts + LOGIN_LOCKOUT.FORCE_RESET_TTL_MS;
  }

  const ipBlocked =
    (ipFailures.get(key)?.count ?? 0) >= LOGIN_LOCKOUT.IP_MAX_FAILURES;
  return snapshotFromState(state, ipBlocked);
}

export async function recordLoginFailureAsync(
  email: string,
  ip: string,
): Promise<LockoutSnapshot> {
  pruneMaps(now());
  await bumpIpFailure(ip);

  const state = await loadEmailState(email);
  const ts = now();
  state.failures += 1;
  state.updatedAt = ts;
  state.lockedUntil = ts + lockDurationMs(state.failures);

  if (state.failures >= LOGIN_LOCKOUT.FORCE_RESET_AFTER) {
    state.forceReset = true;
    state.forceResetUntil = ts + LOGIN_LOCKOUT.FORCE_RESET_TTL_MS;
  }

  await persistEmailState(email, state);
  return snapshotFromState(state, await isIpOverLimit(ip));
}

/**
 * Clear lockout after a successful password sign-in (or completed reset + login).
 */
export function clearLoginLockout(email: string): void {
  emailLocks.delete(normalizeEmail(email));
  void deleteKey(emailRedisKey(email));
}

export async function clearLoginLockoutAsync(email: string): Promise<void> {
  emailLocks.delete(normalizeEmail(email));
  await deleteKey(emailRedisKey(email));
}

/**
 * Whether another forgot-password email may be sent for this address.
 */
export function canSendForgotPassword(email: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  message?: string;
} {
  pruneMaps(now());
  const key = `email:${normalizeEmail(email)}`;
  const ts = now();
  const entry = forgotSends.get(key);

  if (!entry || ts > entry.resetAt) {
    return { allowed: true, remaining: LOGIN_LOCKOUT.FORGOT_MAX_SENDS, retryAfterSec: 0 };
  }

  const remaining = Math.max(0, LOGIN_LOCKOUT.FORGOT_MAX_SENDS - entry.count);
  if (remaining <= 0) {
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - ts) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec,
      message: `Reset code already sent. You can request another in ${formatWait(retryAfterSec)} (max ${LOGIN_LOCKOUT.FORGOT_MAX_SENDS} per half hour).`,
    };
  }

  return { allowed: true, remaining, retryAfterSec: 0 };
}

export async function canSendForgotPasswordAsync(email: string): Promise<{
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  message?: string;
}> {
  const remote = await readJson<CounterState>(forgotRedisKey(email));
  const ts = now();
  if (remote && ts <= remote.resetAt) {
    forgotSends.set(`email:${normalizeEmail(email)}`, remote);
  }
  return canSendForgotPassword(email);
}

/**
 * Count a successful forgot-password send (call only after provider accepts).
 */
export function recordForgotPasswordSend(email: string): void {
  const key = `email:${normalizeEmail(email)}`;
  const ts = now();
  const entry = forgotSends.get(key);
  if (!entry || ts > entry.resetAt) {
    forgotSends.set(key, {
      count: 1,
      resetAt: ts + LOGIN_LOCKOUT.FORGOT_WINDOW_MS,
    });
  } else {
    entry.count += 1;
  }
  const next = forgotSends.get(key)!;
  void writeJson(
    forgotRedisKey(email),
    next,
    Math.ceil((next.resetAt - ts) / 1000) + 30,
  );
}

export async function recordForgotPasswordSendAsync(email: string): Promise<void> {
  recordForgotPasswordSend(email);
}

/** Extract client IP for lockout keys (proxy-aware). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  return sanitizeIp(forwarded || realIp || "unknown");
}
