/* -------------------------------------------------------------------------- */
/*  TrendMart — Email OTP server helpers (service-role, server-only)           */
/*                                                                             */
/*  Shared logic for the /api/auth/* routes: finding an auth user by email and */
/*  issuing + emailing a fresh verification code. Never import from client.    */
/* -------------------------------------------------------------------------- */

import type { User } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendEmail, emailShell } from "@/lib/email";
import { generateOtpCode, hashOtp, otpExpiryIso, otpEmailBody } from "@/lib/otp";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

/** HMAC key for hashing codes — the service-role key is server-only + always
 *  present when these routes run (they require the admin client). */
function otpSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
}

/**
 * Find an auth user by email via the admin API. supabase-js has no server-side
 * email filter, so we page `listUsers` (capped) and match locally. Fine for
 * this app's scale; the cap prevents an unbounded scan.
 */
export async function findAuthUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const perPage = 200;
  const maxPages = 25;

  for (let page = 1; page <= maxPages; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return match;
    if (users.length < perPage) break; // reached the last page
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
      error: "Could not start email verification. Please try again.",
    };
  }

  const sent = await sendEmail({
    to: normalized,
    subject: "Your TrendMart verification code",
    html: emailShell("Verify your email", otpEmailBody(code)),
  });

  if (!sent.success) {
    return {
      success: false,
      error:
        sent.error ||
        "We couldn't send the verification email. Please try again shortly.",
    };
  }

  return { success: true };
}
