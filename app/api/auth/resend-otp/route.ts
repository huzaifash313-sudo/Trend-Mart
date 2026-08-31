/* -------------------------------------------------------------------------- */
/*  TrendsMart — Custom signup: resend the 6-digit code                         */
/*  POST /api/auth/resend-otp                                                   */
/*                                                                             */
/*  Re-issues a verification code (with a per-email cooldown) for an account    */
/*  that still needs to confirm its email. Works both right after signup and   */
/*  from the "verify your email" notice screen.                                 */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserByEmail, issueAndSendOtp } from "@/lib/authOtpServer";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { resendCooldownRemainingMs } from "@/lib/otp";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResendPayload {
  email: string;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.AUTH, name: "auth-resend-otp" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: Partial<ResendPayload>;
  try {
    body = (await request.json()) as Partial<ResendPayload>;
  } catch {
    return json(400, buildSafeErrorResponse(400, "Invalid resend payload."));
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return json(400, { success: false, error: "Please enter a valid email address." });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return json(503, { success: false, error: "Verification is temporarily unavailable." });
  }

  // Enforce the resend cooldown against the existing pending row (if any).
  const { data: existingRow } = await admin
    .from("email_verification_otps")
    .select("user_id, last_sent_at")
    .eq("email", email)
    .maybeSingle();

  const pending = existingRow as { user_id: string | null; last_sent_at: string } | null;
  if (pending?.last_sent_at) {
    const waitMs = resendCooldownRemainingMs(pending.last_sent_at);
    if (waitMs > 0) {
      return json(429, {
        success: false,
        error: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
      });
    }
  }

  // Resolve the user (from the pending row, else look them up).
  let userId = pending?.user_id ?? null;
  if (!userId) {
    const user = await findAuthUserByEmail(admin, email);
    if (!user) {
      return json(400, {
        success: false,
        error: "No account found for this email. Please sign up first.",
      });
    }
    if (user.email_confirmed_at) {
      return json(400, {
        success: false,
        error: "This email is already verified. Please log in.",
      });
    }
    userId = user.id;
  }

  const issued = await issueAndSendOtp(admin, email, userId);
  if (!issued.success) {
    return json(502, { success: false, error: issued.error });
  }

  return json(200, { success: true });
}
