/* -------------------------------------------------------------------------- */
/*  TrendsMart — Email OTP core (server-only, pure + Node crypto)               */
/*                                                                             */
/*  Generates and verifies the custom 6-digit email verification codes that    */
/*  replace Supabase's default magic-link confirmation email. Codes are never  */
/*  stored in plaintext — only an HMAC-SHA256 hash (keyed by a server secret   */
/*  and bound to the lowercased email) is persisted, and comparison is         */
/*  constant-time. Keep this file server-only (it is imported exclusively by   */
/*  the /api/auth/* routes).                                                    */
/* -------------------------------------------------------------------------- */

import { createHmac, randomInt, timingSafeEqual } from "crypto";

/** Number of digits in the verification code. */
export const OTP_LENGTH = 6;
/** How long a freshly issued code stays valid. */
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Wrong-code attempts allowed before the code is locked. */
export const OTP_MAX_ATTEMPTS = 5;
/** Minimum gap between "resend code" requests for one email. */
export const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds

/**
 * Generate a cryptographically-random zero-padded 6-digit code.
 * Uses `crypto.randomInt` (rejection sampling) rather than `Math.random`.
 */
export function generateOtpCode(): string {
  const max = 10 ** OTP_LENGTH; // 1_000_000 → codes 000000..999999
  return String(randomInt(0, max)).padStart(OTP_LENGTH, "0");
}

/** True when a string is exactly `OTP_LENGTH` ASCII digits. */
export function isValidOtpFormat(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/**
 * HMAC-SHA256 hash of a code, bound to the (normalised) email and keyed by a
 * server-side secret, returned as lowercase hex. The email binding means a
 * code issued for one address can never validate against another.
 */
export function hashOtp(code: string, email: string, secret: string): string {
  const normalizedEmail = email.trim().toLowerCase();
  return createHmac("sha256", secret || "trendsmart-otp-fallback-secret")
    .update(`${normalizedEmail}:${code}`)
    .digest("hex");
}

/**
 * Constant-time comparison of two hex-encoded hashes. Returns false (never
 * throws) when lengths differ or either input is malformed.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verify a submitted code against a stored hash for a given email.
 * Combines format validation, email-bound hashing, and constant-time compare.
 */
export function verifyOtpHash(
  submittedCode: string,
  email: string,
  storedHash: string,
  secret: string,
): boolean {
  if (!isValidOtpFormat(submittedCode)) return false;
  const candidate = hashOtp(submittedCode, email, secret);
  return timingSafeEqualHex(candidate, storedHash);
}

/** ISO timestamp `OTP_TTL_MS` in the future — the new code's expiry. */
export function otpExpiryIso(now: number = Date.now()): string {
  return new Date(now + OTP_TTL_MS).toISOString();
}

/** True when `expiresAtIso` is in the past (code no longer usable). */
export function isOtpExpired(expiresAtIso: string, now: number = Date.now()): boolean {
  const expiry = new Date(expiresAtIso).getTime();
  if (Number.isNaN(expiry)) return true;
  return now >= expiry;
}

/**
 * Milliseconds the caller must still wait before another resend is allowed
 * (0 when a resend is permitted now).
 */
export function resendCooldownRemainingMs(
  lastSentAtIso: string,
  now: number = Date.now(),
): number {
  const last = new Date(lastSentAtIso).getTime();
  if (Number.isNaN(last)) return 0;
  const elapsed = now - last;
  return elapsed >= OTP_RESEND_COOLDOWN_MS ? 0 : OTP_RESEND_COOLDOWN_MS - elapsed;
}

/** Branded email body (inner HTML) for a verification code. */
export function otpEmailBody(code: string): string {
  const spaced = code.split("").join("&nbsp;&nbsp;");
  return `
    <p>Welcome to TrendsMart! Use the verification code below to finish creating your account:</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="display:inline-block;padding:16px 28px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;font-size:30px;font-weight:700;letter-spacing:6px;color:#047857;font-family:'Courier New',monospace;">
        ${spaced}
      </span>
    </div>
    <p style="color:#71717a;font-size:13px;">This code expires in 10 minutes. If you didn't request it, you can safely ignore this email — no account will be created.</p>
  `;
}
