/* -------------------------------------------------------------------------- */
/*  TrendsMart — Verify password-reset OTP → short-lived reset grant           */
/*  POST /api/auth/verify-recovery-otp                                          */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimitAsync, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import {
  isValidOtpFormat,
  isOtpExpired,
  verifyOtpHash,
  OTP_MAX_ATTEMPTS,
} from "@/lib/otp";
import {
  getOtpHmacSecret,
  createPasswordResetGrant,
} from "@/lib/authOtpServer";

export const runtime = "nodejs";

interface VerifyPayload {
  email?: string;
  code?: string;
}

interface OtpRow {
  email: string;
  user_id: string | null;
  code_hash: string;
  expires_at: string;
  attempts: number;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimitAsync(request, {
    ...RATE_LIMITS.AUTH,
    name: "auth-verify-recovery-otp",
  });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: VerifyPayload;
  try {
    body = (await request.json()) as VerifyPayload;
  } catch {
    return json(400, buildSafeErrorResponse(400, "Invalid request."));
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();

  if (!email || !isValidOtpFormat(code)) {
    return json(400, { success: false, error: "Enter the 6-digit code from your email." });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return json(503, { success: false, error: "Password reset is temporarily unavailable." });
  }

  let secret: string;
  try {
    secret = getOtpHmacSecret();
  } catch {
    return json(503, { success: false, error: "Password reset is temporarily unavailable." });
  }

  const { data, error } = await admin
    .from("email_verification_otps")
    .select("email, user_id, code_hash, expires_at, attempts")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[auth/verify-recovery-otp] lookup failed:", error.message);
    return json(500, { success: false, error: "Could not verify the code. Please try again." });
  }

  const row = data as OtpRow | null;
  if (!row) {
    return json(400, {
      success: false,
      error: "No pending reset code found. Please request a new one.",
    });
  }

  if (isOtpExpired(row.expires_at)) {
    await admin.from("email_verification_otps").delete().eq("email", email);
    return json(400, {
      success: false,
      error: "Your code has expired. Please request a new one.",
    });
  }

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return json(429, {
      success: false,
      error: "Too many incorrect attempts. Please request a new code.",
    });
  }

  if (!verifyOtpHash(code, email, row.code_hash, secret)) {
    const { data: bumped } = await admin
      .from("email_verification_otps")
      .update({ attempts: row.attempts + 1 } as unknown as never)
      .eq("email", email)
      .eq("attempts", row.attempts)
      .lt("attempts", OTP_MAX_ATTEMPTS)
      .select("attempts")
      .maybeSingle();
    const nextAttempts =
      (bumped as { attempts?: number } | null)?.attempts ?? row.attempts + 1;
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts);
    return json(400, {
      success: false,
      error:
        remaining > 0
          ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "That code is incorrect. Please request a new code.",
    });
  }

  if (!row.user_id) {
    return json(500, {
      success: false,
      error: "Account is missing. Please request a new reset code.",
    });
  }

  // Consume the OTP so it cannot be reused, then issue a short-lived grant.
  await admin.from("email_verification_otps").delete().eq("email", email);

  const resetToken = createPasswordResetGrant(email, row.user_id, secret);

  return json(200, { success: true, resetToken });
}
