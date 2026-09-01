"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { clearQueryCache } from "@/lib/cacheBus";
import { withTimeout } from "@/lib/withTimeout";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type AuthRole = "customer" | "merchant";

export interface AuthLockoutInfo {
  retryAfterSec: number;
  lockedUntil: number | null;
  failures: number;
  forceReset: boolean;
}

export interface AuthResult {
  success: boolean;
  user?: User | null;
  error?: string;
  role?: AuthRole | "admin";
  lockout?: AuthLockoutInfo;
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
 * Give up on a direct Supabase sign-in request after 20s. A browser that
 * cannot reach Supabase (ad-blocker, VPN, firewall, dying network) would
 * otherwise leave the login button spinning forever with no error. 20s is a
 * compromise: long enough for slow-but-working connections to finish, short
 * enough that a hung request surfaces a clear error instead of an endless
 * spinner.
 */
const SIGN_IN_TIMEOUT_MS = 20_000;

/**
 * Sign in with email and password via the server auth API (progressive lockout).
 * On success, syncs the browser session and returns the role for redirect.
 * Enforces email verification: returns needsVerification if unconfirmed.
 */
export async function signInWithEmail(
  email: string,
  password: string,
  captchaToken?: string,
): Promise<AuthResult & { needsVerification?: boolean }> {
  try {
    const normalizedEmail = email.trim().toLowerCase();

    const res = await withTimeout(
      fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          captchaToken: captchaToken || undefined,
        }),
      }),
      SIGN_IN_TIMEOUT_MS,
      () =>
        ({
          ok: false,
          status: 408,
          json: async () => ({
            success: false,
            error:
              "Sign-in is taking too long. Check your internet connection and try again.",
          }),
        }) as unknown as Response,
    );

    const jsonBody = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      needsVerification?: boolean;
      role?: AuthRole | "admin";
      user?: User;
      session?: {
        access_token: string;
        refresh_token: string;
        expires_at?: number;
      };
      lockout?: AuthLockoutInfo;
    };

    if (!res.ok || !jsonBody.success) {
      return {
        success: false,
        error: jsonBody.error ?? "Sign in failed. Please check your credentials.",
        lockout: jsonBody.lockout,
        needsVerification: jsonBody.needsVerification,
      };
    }

    // Sync browser client with tokens from the server (cookies alone can lag).
    if (jsonBody.session?.access_token && jsonBody.session?.refresh_token) {
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: jsonBody.session.access_token,
        refresh_token: jsonBody.session.refresh_token,
      });
      if (sessionError) {
        return {
          success: false,
          error: mapSupabaseError(sessionError.message),
        };
      }
    }

    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();
    const user = currentUser ?? jsonBody.user ?? null;

    if (jsonBody.needsVerification || (user && !user.email_confirmed_at)) {
      return {
        success: false,
        user,
        error: "Please verify your email before continuing. Check your inbox.",
        needsVerification: true,
      };
    }

    const role = jsonBody.role ?? (await detectUserRole(user));

    if (user) {
      void resolveRoleFromDb(user).then((authoritative) => {
        if (authoritative !== role) {
          roleCache.set(user.id, { role: authoritative, at: Date.now() });
        }
      });
    }

    return {
      success: true,
      user,
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
 * `fullName` + `phone` are mandatory contact fields (no phone SMS OTP yet).
 */
export async function signUpWithEmail(
  email: string,
  password: string,
  role: AuthRole = "customer",
  profile?: { fullName: string; phone: string },
  captchaToken?: string,
): Promise<AuthResult & { needsOtpVerification: boolean }> {
  try {
    const signupRole: AuthRole = role === "merchant" ? "merchant" : "customer";
    const fullName = (profile?.fullName ?? "").trim();
    const phone = (profile?.phone ?? "").trim();

    // Custom OTP flow: the server creates the user as UNCONFIRMED (no Supabase
    // email) and emails a branded 6-digit code via Resend. The account only
    // becomes usable after the code is verified — see /api/auth/verify-otp.
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
        role: signupRole,
        fullName,
        phone,
        captchaToken: captchaToken || undefined,
      }),
    });

    const jsonBody = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      role?: AuthRole;
      needsOtpVerification?: boolean;
    };

    if (!res.ok || !jsonBody.success) {
      return {
        success: false,
        error: jsonBody.error ?? "Sign up failed. Please try again.",
        needsOtpVerification: false,
      };
    }

    // Verification is always required — the caller shows the 6-digit code modal.
    return {
      success: true,
      role: jsonBody.role ?? signupRole,
      needsOtpVerification: true,
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

/** Save mandatory name/phone contact fields (no SMS OTP verification). */
export async function upsertSignupProfile(
  userId: string,
  fullName: string,
  phone: string,
): Promise<void> {
  if (!userId || (!fullName && !phone)) return;
  try {
    await supabase.from("user_profiles").upsert(
      {
        user_id: userId,
        full_name: fullName || null,
        phone: phone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    // Non-fatal — checkout can still collect name/phone later.
    console.warn("[authService] upsertSignupProfile failed (non-fatal):", err);
  }
}

/** After email OTP, copy contact fields from auth metadata into user_profiles. */
export async function syncContactProfileFromMetadata(user: User): Promise<void> {
  const fullName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.trim()
      : "";
  const phone =
    typeof user.user_metadata?.phone === "string"
      ? user.user_metadata.phone.trim()
      : "";
  await upsertSignupProfile(user.id, fullName, phone);
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
      const user = await getCurrentUser();
      if (user) {
        clearRoleCache(user.id);
        roleCache.set(user.id, { role, at: Date.now() });
      }
      const { error: metaError } = await supabase.auth.updateUser({ data: { role } });
      if (metaError) {
        // Non-fatal: the DB (user_roles + shop ownership) is authoritative and
        // detectUserRole's slow path resolves the real role. Metadata just keeps
        // the fast path warm — log so a broken metadata write is visible.
        console.warn("[authService] updateUser role metadata failed:", metaError.message);
      }
      return { success: true };
    }
  } catch {
    /* RPC may not exist yet — fall through */
    console.warn("[authService] set_my_signup_role RPC unavailable — falling back to upsert.");
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
    clearRoleCache(user.id);
    roleCache.set(user.id, { role, at: Date.now() });
    const { error: metaError } = await supabase.auth.updateUser({ data: { role } });
    if (metaError) {
      console.warn("[authService] updateUser role metadata failed:", metaError.message);
    }
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
    const res = await fetch("/api/auth/verify-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        code: token.trim(),
      }),
    });

    const jsonBody = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };

    if (!res.ok || !jsonBody.success) {
      return {
        success: false,
        error: jsonBody.error ?? "Verification failed. Please try again.",
      };
    }

    // NOTE: verification confirms the account but does NOT create a session.
    // The signup page signs the user in with their password after this resolves.
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Verification failed.",
    };
  }
}

/**
 * Send a password-reset OTP / recovery email via the server (send caps + IP limit).
 * Configure the Recovery template in Supabase to use a 6-digit OTP for best UX.
 */
export async function requestPasswordReset(
  email: string,
  captchaToken?: string,
): Promise<{ success: boolean; error?: string; retryAfterSec?: number }> {
  try {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        captchaToken: captchaToken || undefined,
      }),
    });

    const jsonBody = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      retryAfterSec?: number;
    };

    if (!res.ok || !jsonBody.success) {
      return {
        success: false,
        error: jsonBody.error ?? "Could not send reset code.",
        retryAfterSec: jsonBody.retryAfterSec,
      };
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
    // Email ownership proven — drop progressive lockout / force-reset.
    void fetch("/api/auth/clear-lockout", { method: "POST" }).catch(() => undefined);
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
    // Clear progressive lockout so the user can sign in with the new password.
    void fetch("/api/auth/clear-lockout", { method: "POST" }).catch(() => undefined);
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
    const res = await fetch("/api/auth/resend-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    const jsonBody = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
    };

    if (!res.ok || !jsonBody.success) {
      return {
        success: false,
        error: jsonBody.error ?? "Could not resend the code. Please try again.",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Could not resend code.",
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
 * Re-authenticate the current user by password.
 *
 * Used to gate sensitive merchant actions (e.g. changing the locked store
 * location pin). Verifies the entered password against the signed-in account
 * without losing the session — `signInWithPassword` refreshes the session for
 * the same account, so the user stays signed in.
 */
export async function verifyPassword(
  password: string,
): Promise<{ success: boolean; error?: string }> {
  if (!password) {
    return { success: false, error: "Enter your password to continue." };
  }
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return {
        success: false,
        error: "Could not verify your account. Please sign in again.",
      };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error) {
      return { success: false, error: "Incorrect password. Please try again." };
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
 *
 * After the Supabase session is closed, this wipes the React Query cache so a
 * previous user's cached storefront/order data can never surface for the next
 * user on the same device. Device-local buyer data (cart, order history,
 * wishlist) is scrubbed by AccountScopeGuard on identity change; we must NOT
 * call localStorage.clear() here because that would also erase user
 * preferences (theme, font scale) and the one-time onboarding "seen" flags,
 * making the welcome flow and dark mode reset after every sign-out.
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    clearRoleCache();
    clearQueryCache();
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
 * Detect the user's role as fast as possible.
 *
 * Fast path (zero network calls): the signed-in `User` object already carries
 * the role in its metadata, so sign-in / page load resolves the role instantly.
 *   - app_metadata.role  — written ONLY by the service role, fully trusted.
 *   - user_metadata.role — user-editable, so it is only ever a harmless
 *     customer/merchant hint (never admin).
 *
 * Slow path: runs get_my_role() RPC and the shop-ownership check IN PARALLEL so
 * the whole lookup costs one max() round-trip instead of two sequential waits.
 * Reached when metadata gives no trusted answer — accounts created before
 * metadata roles existed, AND accounts whose signup-time "customer" metadata
 * is stale (e.g. a customer who later became a merchant).
 *
 * Results are memoized per user so components on the same page never repeat
 * the database work (BottomNav, account pages, sign-in redirect all share it).
 */
export async function detectUserRole(user: User | null): Promise<AuthRole | "admin"> {
  if (!user) return "customer";

  const cached = roleCache.get(user.id);
  if (cached && Date.now() - cached.at < ROLE_CACHE_TTL_MS) {
    return cached.role;
  }

  const fromMetadata = roleFromUserObject(user);
  if (fromMetadata) {
    roleCache.set(user.id, { role: fromMetadata, at: Date.now() });
    return fromMetadata;
  }

  const role = await resolveRoleFromDb(user);
  roleCache.set(user.id, { role, at: Date.now() });
  return role;
}

/** Invalidate the role cache — call after the role actually changes. */
export function clearRoleCache(userId?: string): void {
  if (userId) {
    roleCache.delete(userId);
  } else {
    roleCache.clear();
  }
}

const roleCache = new Map<string, { role: AuthRole | "admin"; at: number }>();
const ROLE_CACHE_TTL_MS = 60_000;

/** Resolve a role from the already-loaded user object — no network. */
function roleFromUserObject(user: User): AuthRole | "admin" | null {
  const appRole = user.app_metadata?.role as string | undefined;
  if (appRole === "admin" || appRole === "merchant" || appRole === "customer") {
    return appRole;
  }
  const metaRole = user.user_metadata?.role as string | undefined;
  // Only a "merchant" hint from user_metadata is trusted as a fast path — it
  // can never elevate to admin, and matches the DB's promotion signal. A stale
  // "customer" hint (written at signup) must NOT short-circuit the
  // authoritative shop-ownership / user_roles check: a customer who later
  // becomes a merchant would otherwise keep seeing the customer portal
  // ("My Account" sidebar link, /account with "Become a Merchant") until the
  // session metadata catches up.
  if (metaRole === "merchant") return metaRole;
  return null;
}

/** Authoritative fallback — parallel RPC + shop-ownership lookups. Never throws. */
async function resolveRoleFromDb(user: User): Promise<AuthRole | "admin"> {
  // Resolve null on timeout (local helper) so a hung Supabase response can
  // never block the sign-in; distinct from the shared lib/withTimeout.
  const raceWithTimeout = <T,>(p: PromiseLike<T>, ms: number): Promise<T | null> =>
    Promise.race([
      Promise.resolve(p),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
    ]);

  const ownsShop = async (): Promise<boolean> => {
    try {
      const result = await raceWithTimeout(
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

  let rpcRole: string | null = null;
  let hasShop = false;
  try {
    const [rpcResult, shop] = await Promise.all([
      raceWithTimeout(supabase.rpc("get_my_role").then((r) => r), 4000),
      ownsShop(),
    ]);
    rpcRole =
      rpcResult && "data" in rpcResult && typeof rpcResult.data === "string"
        ? rpcResult.data
        : null;
    hasShop = shop;
  } catch {
    /* transient network failure — fall through to metadata hints */
  }

  if (rpcRole === "admin") return "admin";
  if (rpcRole === "merchant") return "merchant";
  if (hasShop) return "merchant";
  if (rpcRole === "customer") return "customer";

  const appRole = user.app_metadata?.role as string | undefined;
  if (appRole === "admin" || appRole === "merchant") return appRole;

  return "customer";
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