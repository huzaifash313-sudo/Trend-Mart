/* -------------------------------------------------------------------------- */
/*  TrendsMart — Forgot-password via branded Resend OTP (no Supabase links)    */
/*  POST /api/auth/forgot-password                                              */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import {
  canSendForgotPassword,
  recordForgotPasswordSend,
  clientIpFromHeaders,
} from "@/lib/loginLockout";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserByEmail, issueAndSendOtp } from "@/lib/authOtpServer";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generic success copy — never reveal whether the email exists. */
const GENERIC_OK =
  "If an account exists for that email, a reset code has been sent. Check your inbox.";

interface ForgotPayload {
  email?: string;
  captchaToken?: string;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, {
    ...RATE_LIMITS.AUTH,
    name: "auth-forgot-password",
  });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: ForgotPayload;
  try {
    body = (await request.json()) as ForgotPayload;
  } catch {
    return NextResponse.json(buildSafeErrorResponse(400, "Invalid request."), { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { success: false, error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const captcha = await verifyTurnstileToken(
    body.captchaToken,
    clientIpFromHeaders(request.headers),
  );
  if (!captcha.ok) {
    return NextResponse.json(
      { success: false, error: captcha.error ?? "Security check failed." },
      { status: 403 },
    );
  }

  const cap = canSendForgotPassword(email);
  if (!cap.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: cap.message ?? "Too many reset emails. Please try again later.",
        retryAfterSec: cap.retryAfterSec,
      },
      { status: 429 },
    );
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return NextResponse.json(
      { success: false, error: "Password reset is temporarily unavailable." },
      { status: 503 },
    );
  }

  // Anti-enumeration: always return GENERIC_OK unless send caps / captcha fail.
  // Only email a code when the account actually exists.
  let sent = false;
  try {
    const user = await findAuthUserByEmail(admin, email);
    if (user?.id) {
      const result = await issueAndSendOtp(admin, email, user.id, "password_reset");
      if (result.success) {
        sent = true;
        recordForgotPasswordSend(email);
      } else if (result.error?.toLowerCase().includes("couldn't send")) {
        // Resend misconfigured — surface a clear ops error (not "account missing").
        return NextResponse.json(
          {
            success: false,
            error:
              "We couldn't send the reset email right now. Please try again shortly.",
          },
          { status: 503 },
        );
      }
    }
  } catch (err) {
    console.error(
      "[auth/forgot-password] unexpected:",
      err instanceof Error ? err.message : err,
    );
  }

  return NextResponse.json({
    success: true,
    message: GENERIC_OK,
    remainingSends: Math.max(0, (cap.remaining ?? 1) - (sent ? 1 : 0)),
  });
}
