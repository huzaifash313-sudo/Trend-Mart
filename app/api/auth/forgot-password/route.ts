/* -------------------------------------------------------------------------- */
/*  TrendsMart — Forgot-password with send caps (anti-enumeration + anti-spam) */
/*  POST /api/auth/forgot-password                                              */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { getPublicAppUrl } from "@/lib/appUrl";
import {
  canSendForgotPassword,
  recordForgotPasswordSend,
  clientIpFromHeaders,
} from "@/lib/loginLockout";
import { verifyTurnstileToken } from "@/lib/turnstile";

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

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { success: false, error: "Password reset is temporarily unavailable." },
      { status: 503 },
    );
  }

  const supabase = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${getPublicAppUrl()}/auth/reset-password`,
  });

  // Always respond with the same message to avoid account enumeration.
  // Still count a send only when the provider accepted the request.
  if (!error) {
    recordForgotPasswordSend(email);
  } else {
    const lowered = error.message.toLowerCase();
    if (lowered.includes("rate limit") || lowered.includes("too many")) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many reset emails. Please wait a bit and try again.",
        },
        { status: 429 },
      );
    }
    // Unknown provider errors: still return generic OK so attackers learn nothing.
  }

  return NextResponse.json({
    success: true,
    message: GENERIC_OK,
    remainingSends: Math.max(0, (cap.remaining ?? 1) - (error ? 0 : 1)),
  });
}
