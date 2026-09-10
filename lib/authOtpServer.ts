/* -------------------------------------------------------------------------- */
/*  TrendsMart — Email OTP server helpers (service-role, server-only)           */
/*                                                                             */
/*  Shared logic for the /api/auth/* routes: finding an auth user by email and */
/*  issuing + emailing a fresh verification code. Never import from client.    */
/* -------------------------------------------------------------------------- */

import { createHmac, timingSafeEqual } from "crypto";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailShell } from "@/lib/email";
import {
  generateOtpCode,
  hashOtp,
  otpExpiryIso,
  otpEmailBody,
  passwordResetOtpEmailBody,
} from "@/lib/otp";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type OtpEmailKind = "signup" | "password_reset";

/** How long a post-OTP password-reset grant stays valid. */
const PASSWORD_RESET_GRANT_TTL_MS = 15 * 60 * 1000;

/**
 * HMAC key for hashing OTP codes.
 * Prefer a dedicated `OTP_HMAC_SECRET` so a service-role leak cannot forge codes.
 * In production the dedicated secret is required (fail closed).
 * Local/dev may fall back to the service-role key.
 */
export function getOtpHmacSecret(): string {
  const dedicated = process.env.OTP_HMAC_SECRET?.trim();
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV === "production") {
    throw new Error("OTP_HMAC_SECRET is required in production.");
  }
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) return serviceRole;
  throw new Error("OTP HMAC secret is not configured (set OTP_HMAC_SECRET).");
}

function otpSecret(): string {
  return getOtpHmacSecret();
}

/**
 * Find an auth user by email. Prefer indexed lookups (OTP row / getUserById)
 * before paging listUsers — keeps sign-in OTP fast as the user base grows.
 */
export async function findAuthUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;

  // 1) Pending OTP row already stores user_id for this email.
  try {
    const { data: otp } = await admin
      .from("email_verification_otps")
      .select("user_id")
      .eq("email", target)
      .maybeSingle();
    const otpUserId = (otp as { user_id?: string | null } | null)?.user_id;
    if (otpUserId) {
      const { data } = await admin.auth.admin.getUserById(otpUserId);
      if (data?.user) return data.user;
    }
  } catch {
    /* continue */
  }

  // 2) Page listUsers as a fallback (capped).
  const perPage = 200;
  const maxPages = 50;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) break;
  }
  return null;
}

/**
 * Generate a fresh code, persist its hash (upsert keyed by email — one pending
 * code per address), and email it via Resend. Returns a graceful result rather
 * than throwing so routes can map it to an HTTP status.
 */
export async function issueAndSendOtp(
  admin: AdminClient,
  email: string,
  userId: string,
  kind: OtpEmailKind = "signup",
): Promise<{ success: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  const code = generateOtpCode();
  const codeHash = hashOtp(code, normalized, otpSecret());

  const row = {
    email: normalized,
    user_id: userId,
    code_hash: codeHash,
    expires_at: otpExpiryIso(),
    attempts: 0,
    last_sent_at: new Date().toISOString(),
  };

  // Untyped Supabase client infers upsert payloads as `never` — cast payload.
  const { error: dbError } = await admin
    .from("email_verification_otps")
    .upsert(row as unknown as never, { onConflict: "email" });

  if (dbError) {
    console.error("[authOtpServer] failed to persist OTP:", dbError.message);
    return {
      success: false,
      error:
        kind === "password_reset"
          ? "Could not start password reset. Please try again."
          : "Could not start email verification. Please try again.",
    };
  }

  const isReset = kind === "password_reset";
  const sent = await sendEmail({
    to: normalized,
    subject: isReset
      ? "Your TrendsMart password reset code"
      : "Your TrendsMart verification code",
    html: emailShell(
      isReset ? "Reset your password" : "Verify your email",
      isReset ? passwordResetOtpEmailBody(code) : otpEmailBody(code),
    ),
  });

  if (!sent.success) {
    return {
      success: false,
      error:
        sent.error ||
        (isReset
          ? "We couldn't send the reset email. Please try again shortly."
          : "We couldn't send the verification email. Please try again shortly."),
    };
  }

  return { success: true };
}

/**
 * Short-lived signed grant after a recovery OTP succeeds — used to set a new
 * password without relying on Supabase magic-link sessions or localhost redirects.
 */
export function createPasswordResetGrant(
  email: string,
  userId: string,
  secret: string = otpSecret(),
): string {
  const exp = Date.now() + PASSWORD_RESET_GRANT_TTL_MS;
  const normalized = email.trim().toLowerCase();
  const payload = `${normalized}:${userId}:${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return Buffer.from(
    JSON.stringify({ e: normalized, u: userId, x: exp, s: sig }),
    "utf8",
  ).toString("base64url");
}

export function verifyPasswordResetGrant(
  token: string,
  secret: string = otpSecret(),
): { email: string; userId: string } | null {
  try {
    const raw = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8"),
    ) as { e?: string; u?: string; x?: number; s?: string };
    if (
      typeof raw.e !== "string" ||
      typeof raw.u !== "string" ||
      typeof raw.x !== "number" ||
      typeof raw.s !== "string"
    ) {
      return null;
    }
    if (Date.now() > raw.x) return null;

    const payload = `${raw.e}:${raw.u}:${raw.x}`;
    const expected = createHmac("sha256", secret).update(payload).digest("base64url");
    const a = Buffer.from(expected);
    const b = Buffer.from(raw.s);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return { email: raw.e, userId: raw.u };
  } catch {
    return null;
  }
}
