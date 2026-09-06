/* -------------------------------------------------------------------------- */
/*  TrendsMart — Custom signup (step 1): create unconfirmed user + email code   */
/*  POST /api/auth/signup                                                       */
/*                                                                             */
/*  Replaces Supabase's default magic-link confirmation email. We create the   */
/*  auth user as UNCONFIRMED via the admin API (which sends NO email), then     */
/*  email a custom branded 6-digit code via Resend. The account is not usable   */
/*  until the code is verified at /api/auth/verify-otp.                         */
/*                                                                             */
/*  OTP pre-check: codes are emailed ONLY for brand-new emails. If the email    */
/*  already has an account (confirmed or an unverified leftover), signup never   */
/*  sends an OTP — it returns a 409 directing the user to log in instead.       */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserByEmail, issueAndSendOtp } from "@/lib/authOtpServer";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { clientIpFromHeaders } from "@/lib/loginLockout";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupPayload {
  email: string;
  password: string;
  role?: string;
  fullName?: string;
  phone?: string;
  captchaToken?: string;
}

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.AUTH, name: "auth-signup" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: Partial<SignupPayload>;
  try {
    body = (await request.json()) as Partial<SignupPayload>;
  } catch {
    return json(400, buildSafeErrorResponse(400, "Invalid signup payload."));
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "merchant" ? "merchant" : "customer";
  const fullName = (body.fullName ?? "").trim().slice(0, 120);
  const phone = (body.phone ?? "").trim().slice(0, 30);

  const captcha = await verifyTurnstileToken(
    body.captchaToken,
    clientIpFromHeaders(request.headers),
  );
  if (!captcha.ok) {
    return json(403, { success: false, error: captcha.error ?? "Security check failed." });
  }

  if (!EMAIL_PATTERN.test(email)) {
    return json(400, { success: false, error: "Please enter a valid email address." });
  }
  if (password.length < 8) {
    return json(400, { success: false, error: "Password must be at least 8 characters." });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    // Service role not configured — the custom flow cannot run.
    return json(503, {
      success: false,
      error: "Sign-up is temporarily unavailable. Please try again later.",
    });
  }

  const userMetadata = {
    role,
    full_name: fullName || undefined,
    phone: phone || undefined,
    phone_otp_enabled: false,
  };

  let userId: string | null = null;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: userMetadata,
  });

  if (created.error) {
    const msg = (created.error.message || "").toLowerCase();
    const alreadyExists =
      msg.includes("already") || msg.includes("registered") || msg.includes("exists");

    if (!alreadyExists) {
      console.error("[auth/signup] createUser failed:", created.error.message);
      return json(500, { success: false, error: "Could not create your account. Please try again." });
    }

    // Email already has an account → never email a signup OTP to it. A confirmed
    // account should log in. An unconfirmed account (a leftover signup) is not
    // re-verified from here either: we refresh its password/metadata so the user
    // can sign in with the credentials they just typed, and the sign-in flow is
    // what emails the verification code (codes only go to existing accounts).
    const existing = await findAuthUserByEmail(admin, email);
    if (!existing) {
      return json(409, {
        success: false,
        error: "This email is already registered. Please log in instead.",
      });
    }
    if (existing.email_confirmed_at) {
      return json(409, {
        success: false,
        error: "This email is already registered and verified. Please log in.",
      });
    }

    const refreshed = await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: userMetadata,
    });
    if (refreshed.error) {
      console.error("[auth/signup] updateUserById failed:", refreshed.error.message);
      return json(500, { success: false, error: "Could not start sign-up. Please try again." });
    }
    return json(409, {
      success: false,
      error:
        "An account with this email already exists but isn't verified yet. Please log in — we'll email a fresh verification code there.",
    });
  } else {
    userId = created.data.user?.id ?? null;
  }

  if (!userId) {
    return json(500, { success: false, error: "Could not create your account. Please try again." });
  }

  const issued = await issueAndSendOtp(admin, email, userId);
  if (!issued.success) {
    return json(502, { success: false, error: issued.error });
  }

  return json(200, { success: true, needsOtpVerification: true, role });
}
