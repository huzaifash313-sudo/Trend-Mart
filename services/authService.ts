"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

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

    // Check if email is confirmed
    if (data.user && !data.user.email_confirmed_at) {
      // User exists but hasn't verified email — sign them out immediately
      // and redirect to the verify-notice page
      await supabase.auth.signOut();
      return {
        success: false,
        user: data.user,
        error: "Please verify your email before signing in. Check your inbox.",
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
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1");

    const signupRole: AuthRole = role === "merchant" ? "merchant" : "customer";

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: isLocalhost
          ? undefined
          : `${window.location.origin}/auth/callback`,
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
    if (data.user) {
      await claimSignupRole(signupRole);
    }

    if (data.user && data.session) {
      const resolved = await detectUserRole(data.user);
      return {
        success: true,
        user: data.user,
        role: resolved,
        needsOtpVerification: false,
      };
    }

    if (data.user) {
      return {
        success: true,
        user: data.user,
        role: signupRole,
        needsOtpVerification: !!data.user.identities?.length && !data.session,
      };
    }

    return {
      success: false,
      error: "Sign-up failed. Please try again.",
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
export async function claimSignupRole(role: AuthRole): Promise<void> {
  try {
    const { error: rpcError } = await supabase.rpc("set_my_signup_role", {
      desired_role: role,
    });
    if (!rpcError) return;
  } catch {
    /* RPC may not exist yet — fall through */
  }

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_roles").upsert(
      { user_id: user.id, role },
      { onConflict: "user_id" },
    );
  } catch {
    /* non-fatal — detectUserRole still has metadata fallback */
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
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token,
      type: "signup", // or "email" depending on how the OTP was sent
    });

    if (error) {
      return {
        success: false,
        error: mapSupabaseError(error.message),
      };
    }

    if (!data.session) {
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
/*  Checkout Phone Verification — Mandatory OTP at Order Placement            */
/*                                                                             */
/*  Guests can browse freely, but placing an order requires proving they      */
/*  own the phone number the merchant will be delivering to. This reuses     */
/*  Supabase's native phone-auth OTP flow (SMS) rather than a bespoke        */
/*  gateway integration:                                                      */
/*   - Guests: `signInWithOtp({ phone })` creates/authenticates a lightweight */
/*     phone-based session once the code is confirmed.                       */
/*   - Logged-in customers without a verified phone on file: the number is   */
/*     linked to their existing account via `updateUser({ phone })` +        */
/*     `verifyOtp({ type: "phone_change" })`, so future checkouts skip OTP.   */
/*                                                                             */
/*  NOTE: This requires the Phone provider + an SMS provider (Twilio,        */
/*  MessageBird, Vonage, etc.) to be enabled in the Supabase Dashboard        */
/*  (Authentication → Providers → Phone). Until that's configured, sends     */
/*  fail gracefully and checkout proceeds without blocking commerce — see    */
/*  `sendCheckoutPhoneOtp`'s returned `providerUnavailable` flag.             */
/* -------------------------------------------------------------------------- */

export interface PhoneOtpSendResult {
  success: boolean;
  error?: string;
  phoneE164?: string;
  /** True when Supabase's phone provider isn't configured — callers should degrade gracefully. */
  providerUnavailable?: boolean;
}

/**
 * Normalize a phone number to E.164 format for Supabase phone auth.
 * Defaults to Pakistan's country code (+92) since that's TrendMart's primary market,
 * but passes through any number that already includes a country code.
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

/** Detect whether an error message indicates the SMS/phone provider isn't configured. */
function isProviderUnavailableError(message: string): boolean {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("sms") ||
    lowered.includes("phone provider") ||
    lowered.includes("unsupported phone") ||
    lowered.includes("signups not allowed") ||
    lowered.includes("phone_provider_disabled") ||
    lowered.includes("provider is not enabled")
  );
}

/**
 * Check whether the currently authenticated user already has this exact
 * phone number verified — if so, checkout skips the OTP step permanently
 * (not just for one hour).
 */
export async function isPhoneAlreadyVerified(rawPhone: string): Promise<boolean> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    // Auth phone already confirmed for this number
    if (
      user.phone &&
      user.phone_confirmed_at &&
      user.phone.replace(/\D/g, "") === digits
    ) {
      return true;
    }

    // Profile phone marked verified after a prior successful checkout OTP
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("phone, phone_verified_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (
      profile?.phone_verified_at &&
      profile.phone &&
      profile.phone.replace(/\D/g, "") === digits
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Persist a verified checkout phone onto the user profile so future orders
 * never re-prompt for OTP for the same number.
 */
export async function markCheckoutPhoneVerified(rawPhone: string): Promise<void> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) return;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("user_profiles").upsert(
      {
        user_id: user.id,
        phone,
        phone_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    /* non-fatal */
  }
}

/**
 * True when the signed-in user already completed email verification —
 * checkout must not force another email check.
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
 * Send a 6-digit SMS OTP to verify a customer's phone number at checkout.
 * Links to the existing account if logged in, otherwise starts a guest
 * phone-auth session.
 */
export async function sendCheckoutPhoneOtp(rawPhone: string): Promise<PhoneOtpSendResult> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) {
    return { success: false, error: "Enter a valid phone number to continue." };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Logged-in user with no verified phone on file (or a different one) → link + verify.
    if (user && (!user.phone || !user.phone_confirmed_at || user.phone.replace(/\D/g, "") !== phone.replace(/\D/g, ""))) {
      const { error } = await supabase.auth.updateUser({ phone });
      if (error) {
        return {
          success: false,
          error: mapSupabaseError(error.message),
          phoneE164: phone,
          providerUnavailable: isProviderUnavailableError(error.message),
        };
      }
      return { success: true, phoneE164: phone };
    }

    // Guest checkout — start (or resend) a phone-auth OTP session.
    const { error } = await supabase.auth.signInWithOtp({ phone });
    if (error) {
      return {
        success: false,
        error: mapSupabaseError(error.message),
        phoneE164: phone,
        providerUnavailable: isProviderUnavailableError(error.message),
      };
    }
    return { success: true, phoneE164: phone };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not send verification code.",
      phoneE164: phone,
    };
  }
}

/**
 * Verify the 6-digit code sent via `sendCheckoutPhoneOtp`.
 */
export async function verifyCheckoutPhoneOtp(
  rawPhone: string,
  token: string,
): Promise<OtpVerificationResult> {
  const phone = normalizePhoneE164(rawPhone);
  if (!phone) return { success: false, error: "Invalid phone number." };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const isLinkingExisting = !!user && (!user.phone || user.phone.replace(/\D/g, "") !== phone.replace(/\D/g, ""));

    const { error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: isLinkingExisting ? "phone_change" : "sms",
    });

    if (error) {
      return { success: false, error: mapSupabaseError(error.message) };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification failed.",
    };
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

  // 1. Check user_roles table (authoritative source)
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
        return roleData.role as AuthRole | "admin";
      }
    }
  } catch { /* fall through to metadata check */ }

  // 2. Check user metadata for role
  const metadataRole = user.user_metadata?.role as AuthRole | undefined;
  if (metadataRole === "merchant" || metadataRole === "customer") {
    return metadataRole;
  }

  // 3. Check app_metadata for role
  const appRole = user.app_metadata?.role as AuthRole | undefined;
  if (appRole === "merchant" || appRole === "customer") {
    return appRole;
  }

  // 4. Fallback: query if user has a shop
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
    return shop ? "merchant" : "customer";
  } catch {
    return "customer";
  }
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