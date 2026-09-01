/* -------------------------------------------------------------------------- */
/*  TrendsMart — Progressive login lockout + forgot-password send caps         */
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
/* -------------------------------------------------------------------------- */

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

function getEmailState(email: string): EmailLockState {
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

function isIpOverLimit(ip: string): boolean {
  const key = sanitizeIp(ip);
  const ts = now();
  const entry = ipFailures.get(key);
  if (!entry || ts > entry.resetAt) return false;
  return entry.count >= LOGIN_LOCKOUT.IP_MAX_FAILURES;
}

function bumpIpFailure(ip: string): void {
  const key = sanitizeIp(ip);
  const ts = now();
  const entry = ipFailures.get(key);
  if (!entry || ts > entry.resetAt) {
    ipFailures.set(key, {
      count: 1,
      resetAt: ts + LOGIN_LOCKOUT.IP_WINDOW_MS,
    });
    return;
  }
  entry.count += 1;
}

/**
 * Read current lockout status without mutating counters.
 */
export function getLoginLockout(email: string, ip: string): LockoutSnapshot {
  pruneMaps(now());
  const state = getEmailState(email);
  return snapshotFromState(state, isIpOverLimit(ip));
}

/**
 * Record a failed password attempt. Returns the updated lockout snapshot.
 */
export function recordLoginFailure(email: string, ip: string): LockoutSnapshot {
  pruneMaps(now());
  bumpIpFailure(ip);

  const state = getEmailState(email);
  const ts = now();
  state.failures += 1;
  state.updatedAt = ts;
  state.lockedUntil = ts + lockDurationMs(state.failures);

  if (state.failures >= LOGIN_LOCKOUT.FORCE_RESET_AFTER) {
    state.forceReset = true;
    state.forceResetUntil = ts + LOGIN_LOCKOUT.FORCE_RESET_TTL_MS;
  }

  return snapshotFromState(state, isIpOverLimit(ip));
}

/**
 * Clear lockout after a successful password sign-in (or completed reset + login).
 */
export function clearLoginLockout(email: string): void {
  emailLocks.delete(normalizeEmail(email));
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
    return;
  }
  entry.count += 1;
}

/** Extract client IP for lockout keys (proxy-aware). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  return sanitizeIp(forwarded || realIp || "unknown");
}
