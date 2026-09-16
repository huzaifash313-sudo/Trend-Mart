/* -------------------------------------------------------------------------- */
/*  POS staff auth — PIN hashing + signed shift sessions                       */
/*                                                                              */
/*  SERVER ONLY. Never import this from a client component: it reads secrets    */
/*  and a leaked signing key would let anyone mint a staff session.             */
/*                                                                              */
/*  Uses Node's built-in crypto (scrypt + HMAC-SHA256) so no new dependency is  */
/*  pulled in for something this security-sensitive.                            */
/* -------------------------------------------------------------------------- */

import crypto from "node:crypto";

/** scrypt output length in bytes. */
const KEY_LEN = 32;
const SALT_LEN = 16;
/** One retail shift — a cashier shouldn't have to re-enter their PIN mid-shift. */
export const STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const STAFF_COOKIE = "tm_pos_staff";

export type StaffRole = "cashier" | "manager";

export interface StaffSession {
  staffId: string;
  shopId: string;
  role: StaffRole;
  name: string;
  /** Epoch ms when this session stops being accepted. */
  exp: number;
}

/**
 * HMAC key for session tokens. A dedicated secret is preferred; we fall back to
 * the service-role key so the feature works without new env setup. Both are
 * server-only values — if neither exists we throw rather than silently signing
 * with a guessable key.
 */
function sessionSecret(): string {
  const secret =
    process.env.POS_STAFF_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!secret) {
    throw new Error(
      "POS staff sessions need POS_STAFF_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) to be set.",
    );
  }
  return secret;
}

/* ── PIN hashing ──────────────────────────────────────────────────────────── */

/** Digits only, 4–8 long. Rejects the obvious "0000" style PIN outright. */
export function isValidPinFormat(pin: string): boolean {
  if (!/^\d{4,8}$/.test(pin)) return false;
  // All-same-digit PINs (0000, 1111…) are trivially guessable.
  if (/^(\d)\1+$/.test(pin)) return false;
  return true;
}

/** Hash a PIN as `scrypt$<saltHex>$<hashHex>`. */
export function hashPin(pin: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = crypto.scryptSync(pin, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Constant-time PIN check. Returns false (never throws) on malformed stored
 * values so a corrupt row can't crash the login route.
 */
export function verifyPin(pin: string, stored: string): boolean {
  try {
    const [scheme, saltHex, hashHex] = (stored || "").split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (expected.length !== KEY_LEN) return false;
    const derived = crypto.scryptSync(pin, salt, KEY_LEN);
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/* ── Shift session tokens ─────────────────────────────────────────────────── */

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payload: string): string {
  return b64url(
    crypto.createHmac("sha256", sessionSecret()).update(payload).digest(),
  );
}

/** Mint a `<payload>.<signature>` token for the current shift. */
export function signStaffSession(
  session: Omit<StaffSession, "exp"> & { exp?: number },
): string {
  const body: StaffSession = {
    ...session,
    exp: session.exp ?? Date.now() + STAFF_SESSION_TTL_MS,
  };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify signature + expiry. Returns null for anything untrusted — a tampered
 * payload, a bad signature, or an expired shift.
 */
export function verifyStaffSession(token: string | undefined | null): StaffSession | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on mismatched lengths.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(fromB64url(payload).toString("utf8")) as StaffSession;
    if (!parsed?.staffId || !parsed?.shopId) return null;
    if (parsed.role !== "cashier" && parsed.role !== "manager") return null;
    if (typeof parsed.exp !== "number" || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}
