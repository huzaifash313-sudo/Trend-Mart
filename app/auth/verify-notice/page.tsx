"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resendOtp } from "@/services/authService";
import { useToast } from "@/components/Toast";

/** Skip static prerender — this page reads search params at request time. */
export const dynamic = "force-dynamic";

/* -------------------------------------------------------------------------- */
/*  Email Verification Notice Page                                             */
/*  Shown to users who haven't confirmed their email yet.                      */
/*  Middleware redirects unverified users here for any protected route.        */
/* -------------------------------------------------------------------------- */

function MailIcon() {
  return (
    <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function VerifyNoticeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/";
  const { addToast } = useToast();

  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);

  // Load user's email
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled && user) {
          setEmail(user.email ?? null);
        }
        if (!cancelled && !user) {
          // No session at all — redirect to login
          router.replace("/login");
        }
      } catch {
        // ignore
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [router]);

  // Handle resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = useCallback(async () => {
    if (!email || resendCooldown > 0) return;
    setResending(true);
    try {
      const result = await resendOtp(email);
      if (result.success) {
        addToast("Verification email resent! Check your inbox.", "success");
        setResendCooldown(60);
      } else {
        addToast(result.error ?? "Could not resend verification email.", "error");
      }
    } catch {
      addToast("Failed to resend. Please try again.", "error");
    }
    setResending(false);
  }, [email, resendCooldown, addToast]);

  const handleCheckVerified = useCallback(async () => {
    setChecking(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email_confirmed_at) {
        setVerified(true);
        addToast("Email verified! Redirecting...", "success");
        setTimeout(() => {
          router.replace(redirectTo);
        }, 1500);
      } else {
        addToast("Email not yet verified. Please check your inbox and click the confirmation link.", "info");
      }
    } catch {
      addToast("Could not check verification status.", "error");
    }
    setChecking(false);
  }, [redirectTo, router, addToast]);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="w-full max-w-md text-center">
        {/* Icon */}
        <div className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${verified ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"}`}>
          {verified ? <CheckCircleIcon /> : <MailIcon />}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
          {verified ? "Email Verified!" : "Verify Your Email"}
        </h1>

        {/* Message */}
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          {verified
            ? "Your email has been confirmed. Redirecting you now..."
            : email
              ? `We sent a verification email to ${email}. Please check your inbox and click the confirmation link to continue.`
              : "Please verify your email address to access this feature."}
        </p>

        {!verified && (
          <>
            {/* Tips */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-4 text-left text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              <p className="mb-2 font-semibold text-zinc-700 dark:text-zinc-300">Didn&apos;t receive the email?</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Check your spam or junk folder</li>
                <li>Make sure you entered the correct email address</li>
                <li>Wait a minute — some email providers are slower</li>
                {process.env.NODE_ENV === "development" && (
                  <li className="text-amber-600 dark:text-amber-400">
                    (Dev mode) Check the Supabase dashboard → Authentication → Users for the confirmation link
                  </li>
                )}
              </ul>
            </div>

            {/* Actions */}
            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
                className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
              >
                {resending ? "Sending..." : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Verification Email"}
              </button>

              <button
                type="button"
                onClick={handleCheckVerified}
                disabled={checking}
                className="w-full rounded-xl border border-zinc-300 bg-white py-3 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50"
              >
                {checking ? "Checking..." : "I've Verified — Continue"}
              </button>

              <button
                type="button"
                onClick={handleSignOut}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-zinc-400 transition-all hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
              >
                Sign Out & Use a Different Account
              </button>
            </div>

            {/* Back to home */}
            <div className="mt-4">
              <Link
                href="/"
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
              >
                &larr; Back to home
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyNoticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <VerifyNoticeInner />
    </Suspense>
  );
}