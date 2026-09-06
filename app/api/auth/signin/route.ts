/* -------------------------------------------------------------------------- */
/*  TrendsMart — Server sign-in with progressive brute-force lockout            */
/*  POST /api/auth/signin                                                       */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Session, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import {
  getLoginLockout,
  recordLoginFailure,
  clearLoginLockout,
  clientIpFromHeaders,
} from "@/lib/loginLockout";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { findAuthUserByEmail, issueAndSendOtp } from "@/lib/authOtpServer";
import { resendCooldownRemainingMs } from "@/lib/otp";

export const runtime = "nodejs";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignInPayload {
  email?: string;
  password?: string;
  captchaToken?: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required configuration (${key}).`);
  }
  return value;
}

function resolveRole(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): "customer" | "merchant" | "admin" {
  const appRole = user.app_metadata?.role;
  if (appRole === "admin" || appRole === "merchant" || appRole === "customer") {
    return appRole;
  }
  const metaRole = user.user_metadata?.role;
  if (metaRole === "merchant") return "merchant";
  return "customer";
}

function isEmailNotConfirmedError(message: string | undefined): boolean {
  const lowered = (message ?? "").toLowerCase();
  return lowered.includes("email not confirmed") || lowered.includes("email not verified");
}

function mapAuthError(message: string): string {
  const lowered = message.toLowerCase();
  if (
    lowered.includes("invalid login credentials") ||
    lowered.includes("invalid email or password")
  ) {
    return "Invalid email or password. Please try again.";
  }
  if (isEmailNotConfirmedError(message)) {
    return "Please verify your email before signing in. Check your inbox.";
  }
  if (lowered.includes("rate limit") || lowered.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Sign in failed. Please try again.";
}

function buildSignInSuccessResponse(
  data: { user: User; session: Session },
  pendingCookies: {
    name: string;
    value: string;
    options?: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2];
  }[],
) {
  const role = resolveRole(data.user);
  const needsVerification = !data.user.email_confirmed_at;

  const response = NextResponse.json({
    success: true,
    needsVerification,
    role: needsVerification ? undefined : role,
    user: {
      id: data.user.id,
      email: data.user.email,
      email_confirmed_at: data.user.email_confirmed_at,
      app_metadata: data.user.app_metadata,
      user_metadata: data.user.user_metadata,
    },
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    },
  });

  for (const { name, value, options } of pendingCookies) {
    response.cookies.set(name, value, options);
  }

  return response;
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.AUTH, name: "auth-signin" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: SignInPayload;
  try {
    body = (await request.json()) as SignInPayload;
  } catch {
    return NextResponse.json(buildSafeErrorResponse(400, "Invalid sign-in payload."), {
      status: 400,
    });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const ip = clientIpFromHeaders(request.headers);

  if (!EMAIL_PATTERN.test(email) || password.length < 1) {
    return NextResponse.json(
      { success: false, error: "Please enter a valid email and password." },
      { status: 400 },
    );
  }

  const captcha = await verifyTurnstileToken(body.captchaToken, ip);
  if (!captcha.ok) {
    return NextResponse.json(
      { success: false, error: captcha.error ?? "Security check failed." },
      { status: 403 },
    );
  }

  const lock = getLoginLockout(email, ip);
  if (!lock.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: lock.message ?? "Too many attempts. Please try again later.",
        lockout: {
          retryAfterSec: lock.retryAfterSec,
          lockedUntil: lock.lockedUntil,
          failures: lock.failures,
          forceReset: lock.forceReset,
        },
      },
      { status: lock.forceReset ? 403 : 429 },
    );
  }

  const cookieStore = await cookies();
  const pendingCookies: {
    name: string;
    value: string;
    options?: Parameters<typeof cookieStore.set>[2];
  }[] = [];

  let supabase;
  try {
    supabase = createServerClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              cookieStore.set(name, value, options);
            } catch {
              /* ignore read-only cookie contexts */
            }
            pendingCookies.push({ name, value, options });
          });
        },
      },
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Sign-in is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user || !data.session) {
    // Unverified accounts: route to the in-app OTP flow instead of a dead-end error.
    if (isEmailNotConfirmedError(error?.message)) {
      const admin = getSupabaseAdminClient();
      if (admin) {
        const existing = await Promise.race([
          findAuthUserByEmail(admin, email),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_500)),
        ]);
        if (existing?.email_confirmed_at) {
          // OTP already confirmed the email — re-assert and retry once (handles stale auth state).
          await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
          const retry = await supabase.auth.signInWithPassword({ email, password });
          if (!retry.error && retry.data.user && retry.data.session) {
            clearLoginLockout(email);
            return buildSignInSuccessResponse(
              { user: retry.data.user, session: retry.data.session },
              pendingCookies,
            );
          }
        }

        // Unconfirmed account with the correct password — email a fresh code so
        // the in-app verify modal always has a real code behind it. Codes are
        // only sent once the account is confirmed to exist (never for unknown
        // emails), and the per-email resend cooldown is respected.
        if (existing && !existing.email_confirmed_at) {
          const { data: pending } = await admin
            .from("email_verification_otps")
            .select("last_sent_at")
            .eq("email", email)
            .maybeSingle();
          const lastSent = (pending as { last_sent_at?: string } | null)?.last_sent_at ?? "";
          if (resendCooldownRemainingMs(lastSent) <= 0) {
            await issueAndSendOtp(admin, email, existing.id);
          }
        }
      }

      return NextResponse.json(
        {
          success: false,
          needsVerification: true,
          error: "Please verify your email before signing in. Check your inbox.",
        },
        { status: 403 },
      );
    }

    const nextLock = recordLoginFailure(email, ip);
    return NextResponse.json(
      {
        success: false,
        error: nextLock.forceReset
          ? nextLock.message
          : mapAuthError(error?.message ?? "Invalid email or password."),
        lockout: {
          retryAfterSec: nextLock.retryAfterSec,
          lockedUntil: nextLock.lockedUntil,
          failures: nextLock.failures,
          forceReset: nextLock.forceReset,
        },
      },
      { status: nextLock.forceReset ? 403 : 401 },
    );
  }

  clearLoginLockout(email);

  return buildSignInSuccessResponse(
    { user: data.user, session: data.session },
    pendingCookies,
  );
}
