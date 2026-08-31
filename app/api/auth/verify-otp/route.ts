/* -------------------------------------------------------------------------- */
/*  TrendsMart — Custom signup (step 2): verify the 6-digit code                */
/*  POST /api/auth/verify-otp                                                   */
/*                                                                             */
/*  Checks the submitted code against the stored hash (constant-time, with     */
/*  expiry + attempt limiting). On success, marks the auth user's email as     */
/*  confirmed and provisions their role + profile, then deletes the code.      */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildSafeErrorResponse } from "@/lib/responseSanitizer";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";
import {
  isValidOtpFormat,
  isOtpExpired,
  verifyOtpHash,
  OTP_MAX_ATTEMPTS,
} from "@/lib/otp";

export const runtime = "nodejs";

interface VerifyPayload {
  email: string;
  code: string;
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
  const limited = checkRateLimit(request, { ...RATE_LIMITS.AUTH, name: "auth-verify-otp" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  let body: Partial<VerifyPayload>;
  try {
    body = (await request.json()) as Partial<VerifyPayload>;
  } catch {
    return json(400, buildSafeErrorResponse(400, "Invalid verification payload."));
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();

  if (!email || !isValidOtpFormat(code)) {
    return json(400, { success: false, error: "Enter the 6-digit code from your email." });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    return json(503, { success: false, error: "Verification is temporarily unavailable." });
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const { data, error } = await admin
    .from("email_verification_otps")
    .select("email, user_id, code_hash, expires_at, attempts")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("[auth/verify-otp] lookup failed:", error.message);
    return json(500, { success: false, error: "Could not verify the code. Please try again." });
  }

  const row = data as OtpRow | null;
  if (!row) {
    return json(400, {
      success: false,
      error: "No pending verification found. Please sign up again.",
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
    // Wrong code — burn an attempt.
    await admin
      .from("email_verification_otps")
      .update({ attempts: row.attempts + 1 } as unknown as never)
      .eq("email", email);
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (row.attempts + 1));
    return json(400, {
      success: false,
      error:
        remaining > 0
          ? `That code is incorrect. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "That code is incorrect. Please request a new code.",
    });
  }

  if (!row.user_id) {
    return json(500, { success: false, error: "Account is missing. Please sign up again." });
  }

  // ── Correct code → confirm the email and provision role + profile ──────────
  const confirm = await admin.auth.admin.updateUserById(row.user_id, {
    email_confirm: true,
  });
  if (confirm.error) {
    console.error("[auth/verify-otp] confirm failed:", confirm.error.message);
    return json(500, { success: false, error: "Could not confirm your account. Please try again." });
  }

  const meta = (confirm.data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const role = meta.role === "merchant" ? "merchant" : "customer";
  const fullName = typeof meta.full_name === "string" ? meta.full_name : null;
  const phone = typeof meta.phone === "string" ? meta.phone : null;

  // Best-effort provisioning — never block a confirmed signup on these.
  await admin
    .from("user_roles")
    .upsert({ user_id: row.user_id, role } as unknown as never, { onConflict: "user_id" });
  if (fullName || phone) {
    await admin.from("user_profiles").upsert(
      {
        user_id: row.user_id,
        full_name: fullName,
        phone,
        updated_at: new Date().toISOString(),
      } as unknown as never,
      { onConflict: "user_id" },
    );
  }

  await admin.from("email_verification_otps").delete().eq("email", email);

  return json(200, { success: true, role });
}
