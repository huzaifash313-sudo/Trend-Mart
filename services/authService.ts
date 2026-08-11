"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { getAuthCallbackUrl, getPublicAppUrl } from "@/lib/appUrl";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type AuthRole = "customer" | "merchant";

export interface AuthResult {
  success: boolean;
  user?: User | null;
  error?: string;
  role?: AuthRole | "admin";
}

export interface OtpVerificationResult {
  success: boolean;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/*  Auth Service — Centralized Authentication Logic                           */
/* -------------------------------------------------------------------------- */

const supabase = createClient();

/**
 * Sign in with email and password.
 * On success, queries the user's role and returns the appropriate redirect path.
 * Enforces email verification: returns an error if the user hasn't confirmed their email.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult & { needsVerification?: boolean }> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseError(error.message),
      };
    }

    // Email not confirmed — keep the session so /auth/verify-notice can resend
    // and check status. Middleware still blocks account/dashboard until verified.
    if (data.user && !data.user.email_confirmed_at) {
      return {
        success: false,
        user: data.user,
        error: "Please verify your email before continuing. Check your inbox.",
        needsVerification: true,
      };
    }

    const role = await detectUserRole(data.user);

    return {
      success: true,
      user: data.user,
      role,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred.",
    };
  }
}

/**
 * Sign up with email and password.
 * Pass `role` so the account is created as customer or merchant from day one.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  role: AuthRole = "customer",
): Promise<AuthResult & { needsOtpVerification: boolean }> {
  try {
    const signupRole: AuthRole = role === "merchant" ? "merchant" : "customer";

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        // Always send users to the public app URL (never stale Supabase Site URL / localhost).
        emailRedirectTo: getAuthCallbackUrl(),
        data: {
          role: signupRole,
        },
      },
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseError(error.message),
        needsOtpVerification: false,
      };
    }

    // Persist role into user_roles (trigger also reads metadata; this is a safety net).
    // Only when a session exists — otherwise claim after email OTP verifies.
    if (data.user && data.session) {
      await claimSignupRole(signupRole);
    }

    if (!data.user) {
      return {
        success: false,
        error: "Sign-up failed. Please try again.",
        needsOtpVerification: false,
      };
    }

    // Email confirmation is mandatory. Never treat signup as complete until verified.
    // If Supabase auto-created a session (confirm-email disabled), sign out and force OTP UI.
    if (!data.user.email_confirmed_at) {
      if (data.session) {
        await supabase.auth.signOut();
      }
      return {
        success: true,
        user: data.user,
        role: signupRole,
        needsOtpVerification: true,
      };
    }

    const resolved = await detectUserRole(data.user);
    return {
      success: true,
      user: data.user,
      role: resolved,
      needsOtpVerification: false,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "An unexpected error occurred.",
      needsOtpVerification: false,
    };
  }
}

/**
 * Write the chosen signup role into `user_roles`.
 * Prefer the SECURITY DEFINER RPC when available; fall back to upsert.
 */
export async function claimSignupRole(
  role: AuthRole,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error: rpcError } = await supabase.rpc("set_my_signup_role", {
      desired_role: role,
    });
    if (!rpcError) {
      // Keep auth metadata in sync for client-side role detection fallbacks
      await supabase.auth.updateUser({ data: { role } }).catch(() => undefined);
      return { success: true };
    }
  } catch {
    /* RPC may not exist yet — fall through */
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: "You must be signed in." };

    const { error } = await supabase.from("user_roles").upsert(
      { user_id: user.id, role },
      { onConflict: "user_id" },
    );
    if (error) {
      return { success: false, error: error.message || "Could not update account role." };
    }
    await supabase.auth.updateUser({ data: { role } }).catch(() => undefined);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not update account role.",
    };
  }
}

/**
 * Verify OTP for a user (uses Supabase's `verifyOtp` method).
 *
 * For localhost development, this provides a reliable way to confirm accounts
 * without depending on email redirect URLs which can break with local setups.
 *
 * In production, you can also use this if you've configured Supabase
 * to send a 6-digit code via email.
 */
export async function verifyOtp(
  email: string,
  token: string,
): Promise<OtpVerificationResult> {
  try {
    const normalized = email.trim().toLowerCase();
    const cleaned = token.trim();

    // Supabase templates may send signup or email OTP depending on project settings.
    let result = await supabase.auth.verifyOtp({
      email: normalized,
      token: cleaned,
      type: "signup",
    });

    if (result.error) {
      result = await supabase.auth.verifyOtp({
        email: normalized,
        token: cleaned,
        type: "email",
      });
    }

    if (result.error) {
      return {
        success: false,
        error: mapSupabaseError(result.error.message),
      };
    }

    if (!result.data.session) {
      return {
        success: false,
        error: "Verification succeeded but no session was returned.",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Verification failed.",
    };
  }
}

/**
 * Send a password-reset OTP / recovery email (Supabase recovery flow).
 * Configure the Recovery template in Supabase to use a 6-digit OTP for best UX.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${getPublicAppUrl()}/auth/reset-password` },
    );
    if (error) {
      return { success: false, error: mapSupabaseError(error.message) };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not send reset code.",
    };
  }
}

/** Verify recovery OTP, then caller can set a new password while session is active. */
export async function verifyRecoveryOtp(
  email: string,
  token: string,
): Promise<OtpVerificationResult> {
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: "recovery",
    });
    if (error) {
      return { success: false, error: mapSupabaseError(error.message) };
    }
    if (!data.session) {
      return { success: false, error: "Code accepted but session missing. Try again." };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification failed.",
    };
  }
}

/** Set a new password after a successful recovery OTP / magic-link session. */
export async function updatePasswordAfterRecovery(
  newPassword: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return { success: false, error: mapSupabaseError(error.message) };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not update password.",
    };
  }
}

/**
 * Resend OTP / confirmation email for a sign-up.
 * For localhost: attempts to use `resend` with the signup type.
 *
 * NOTE: Supabase's `resend` typically requires that the email provider
 * is configured. For pure local development with no email setup, you may
 * want to configure Supabase to auto-confirm users.
 */
export async function resendOtp(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.resend({
      email: email.trim().toLowerCase(),
      type: "signup",
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseError(error.message),
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Could not resend code.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Checkout access — email verification only                                 */
/*  Phone is a delivery contact field only (no OTP). Browse as guest;         */
/*  checkout / account actions need a signed-in, email-verified user.         */
/* -------------------------------------------------------------------------- */

/**
 * Normalize a phone number to E.164 (default +92 for Pakistan).
 * Used for display / WhatsApp payloads — not for phone OTP auth.
 */
export function normalizePhoneE164(raw: string, defaultCountryCode = "92"): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const cleaned = "+" + trimmed.slice(1).replace(/\D/g, "");
    return cleaned.length >= 9 ? cleaned : null;
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (!digitsOnly) return null;

  if (digitsOnly.startsWith("0")) {
    return `+${defaultCountryCode}${digitsOnly.slice(1)}`;
  }
  if (digitsOnly.startsWith(defaultCountryCode) && digitsOnly.length > defaultCountryCode.length + 6) {
    return `+${digitsOnly}`;
  }
  if (digitsOnly.length >= 9 && digitsOnly.length <= 11) {
    return `+${defaultCountryCode}${digitsOnly}`;
  }
  return digitsOnly.length >= 8 ? `+${digitsOnly}` : null;
}

/**
 * True when the signed-in user already completed email verification.
 */
export async function isEmailAlreadyVerified(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user?.email_confirmed_at;
  } catch {
    return false;
  }
}

/**
 * Checkout / account actions: must be signed in with a confirmed email.
 */
export async function requireVerifiedEmailSession(): Promise<
  | { ok: true; user: User }
  | { ok: false; reason: "unauthenticated" | "unverified" }
> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, reason: "unauthenticated" };
    if (!user.email_confirmed_at) return { ok: false, reason: "unverified" };
    return { ok: true, user };
  } catch {
    return { ok: false, reason: "unauthenticated" };
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Sign out failed.",
    };
  }
}

/**
 * Get the currently authenticated user (client-side).
 */
export async function getCurrentUser(): Promise<User | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Map a role to its dashboard path.
 * Merchants/admins → store dashboard; customers → account portal.
 */
export function getDashboardPath(role: AuthRole | "admin"): string {
  if (role === "admin") return "/admin/dashboard";
  if (role === "merchant") return "/dashboard";
  return "/account";
}

/**
 * Redirect the user to the appropriate dashboard based on role.
 * Uses window.location for client-side redirect.
 */
export function redirectToDashboard(role: AuthRole | "admin"): void {
  const path = getDashboardPath(role);
  window.location.href = path;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Detect the user's role.
 * Checks the user_roles table first, then metadata, then falls back to shop ownership.
 * DB lookups are time-boxed so a hung PostgREST call never freezes Sign-In /account.
 */
export async function detectUserRole(user: User | null): Promise<AuthRole | "admin"> {
  if (!user) return "customer";

  const withTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

  const ownsShop = async (): Promise<boolean> => {
    try {
      const result = await withTimeout(
        supabase
          .from("shops")
          .select("id")
          .eq("owner_id", user.id)
          .limit(1)
          .maybeSingle()
          .then((r) => r),
        4000,
      );
      const shop = result && "data" in result ? result.data : null;
      return !!shop?.id;
    } catch {
      return false;
    }
  };

  // 1. user_roles table
  try {
    const result = await withTimeout(
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle()
        .then((r) => r),
      4000,
    );
    const roleData = result && "data" in result ? result.data : null;
    if (roleData?.role) {
      const validRoles: string[] = ["customer", "merchant", "admin"];
      if (validRoles.includes(roleData.role)) {
        // Legacy / mismatched rows: shop owner must remain merchant
        if (roleData.role === "customer" && (await ownsShop())) {
          return "merchant";
        }
        return roleData.role as AuthRole | "admin";
      }
    }
  } catch { /* fall through */ }

  // 2. user metadata
  const metadataRole = user.user_metadata?.role as AuthRole | undefined;
  if (metadataRole === "merchant" || metadataRole === "customer") {
    if (metadataRole === "customer" && (await ownsShop())) return "merchant";
    return metadataRole;
  }

  // 3. app_metadata
  const appRole = user.app_metadata?.role as AuthRole | undefined;
  if (appRole === "merchant" || appRole === "customer") {
    if (appRole === "customer" && (await ownsShop())) return "merchant";
    return appRole;
  }

  // 4. Shop ownership (older accounts without user_roles)
  return (await ownsShop()) ? "merchant" : "customer";
}

/**
 * Map raw Supabase error messages to user-friendly messages.
 */
function mapSupabaseError(message: string): string {
  const lowered = message.toLowerCase();

  if (lowered.includes("invalid login credentials") || lowered.includes("invalid email or password")) {
    return "Invalid email or password. Please try again.";
  }
  if (lowered.includes("email not confirmed") || lowered.includes("email not verified")) {
    return "Please verify your email before signing in. Check your inbox.";
  }
  if (lowered.includes("user already registered") || lowered.includes("already registered") || lowered.includes("duplicate")) {
    return "An account with this email already exists. Please sign in instead.";
  }
  if (lowered.includes("password") && (lowered.includes("weak") || lowered.includes("short") || lowered.includes("minimum"))) {
    return "Password is too weak. Use at least 8 characters with a mix of letters and numbers.";
  }
  if (lowered.includes("rate limit") || lowered.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (lowered.includes("token") && lowered.includes("expired")) {
    return "Your verification code has expired. Please request a new one.";
  }
  if (lowered.includes("token") && lowered.includes("invalid")) {
    return "Invalid verification code. Please check and try again.";
  }
  if (lowered.includes("network") || lowered.includes("fetch")) {
    return "Network error. Please check your internet connection.";
  }

  // Return the original message if no match
  return message;
}