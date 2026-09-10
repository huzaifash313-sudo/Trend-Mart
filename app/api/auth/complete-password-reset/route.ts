/* -------------------------------------------------------------------------- */
/*  TrendsMart — Set new password after recovery OTP grant                      */
/*  POST /api/auth/complete-password-reset                                      */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimitAsync, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import {
  getOtpHmacSecret,
  verifyPasswordResetGrant,
} from "@/lib/authOtpServer";
import { clearLoginLockoutAsync } from "@/lib/loginLockout";

export const runtime = "nodejs";

const MIN_PASSWORD_LENGTH = 8;

interface ResetPayload {
  email?: string;
  resetToken?: string;
  password?: string;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimitAsync(request, {
    ...RATE_LIMITS.AUTH,
    name: "auth-complete-password-reset",
  });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: ResetPayload;
  try {
    body = (await request.json()) as ResetPayload;
  } catch {
    return json(400, buildSafeErrorResponse(400, "Invalid request."));
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const resetToken = (body.resetToken ?? "").trim();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !resetToken) {
    return json(400, {
      success: false,
      error: "Reset session expired. Please verify your OTP again.",
    });
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return json(400, {
      success: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  let secret: string;
  try {
    secret = getOtpHmacSecret();
  } catch {
    return json(503, { success: false, error: "Password reset is temporarily unavailable." });
  }

  const grant = verifyPasswordResetGrant(resetToken, secret);
  if (!grant || grant.email !== email) {
    return json(400, {
      success: false,
      error: "Reset session expired or invalid. Please request a new code.",
    });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return json(503, { success: false, error: "Password reset is temporarily unavailable." });
  }

  const { error } = await admin.auth.admin.updateUserById(grant.userId, {
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("[auth/complete-password-reset] update failed:", error.message);
    const lowered = error.message.toLowerCase();
    if (lowered.includes("weak") || lowered.includes("password")) {
      return json(400, {
        success: false,
        error: "That password is too weak. Please choose a stronger one.",
      });
    }
    return json(500, {
      success: false,
      error: "Could not update password. Please try again.",
    });
  }

  await clearLoginLockoutAsync(email).catch(() => undefined);

  return json(200, { success: true });
}
