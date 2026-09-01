"use client";

import { useState, type FormEvent, Suspense, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { requestPasswordReset } from "@/services/authService";
import { useToast } from "@/components/Toast";
import TurnstileField, { type TurnstileFieldHandle } from "@/components/TurnstileField";
import { isTurnstileUiEnabled } from "@/lib/turnstilePublic";

function ForgotPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const prefill = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const locked = searchParams.get("locked") === "1";
  const captchaEnabled = isTurnstileUiEnabled();
  const captchaRef = useRef<TurnstileFieldHandle>(null);

  const [email, setEmail] = useState(prefill);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(0);

  useEffect(() => {
    if (prefill) setEmail(prefill);
  }, [prefill]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (cooldownSec > 0) return;

    let captchaToken: string | undefined;
    if (captchaEnabled) {
      captchaToken =
        captchaRef.current?.getToken() ??
        (await captchaRef.current?.waitForToken(8_000)) ??
        undefined;
      if (!captchaToken) {
        addToast("Please wait for the security check to finish.", "error");
        return;
      }
    }

    setLoading(true);
    const result = await requestPasswordReset(email, captchaToken);
    setLoading(false);
    captchaRef.current?.reset();

    if (!result.success) {
      if (result.retryAfterSec && result.retryAfterSec > 0) {
        setCooldownSec(result.retryAfterSec);
      }
      addToast(result.error || "Could not send reset code.", "error");
      return;
    }
    setSent(true);
    addToast("If an account exists for that email, a reset code was sent.", "success");
    router.push(`/auth/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Forgot password</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {locked
          ? "Your account was locked after too many failed sign-ins. Enter your email — we’ll send a one-time code so you can set a new password."
          : "Enter your account email. We'll send a one-time OTP so you can set a new password."}
      </p>
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">
        For security, you can request at most 2 reset emails every 30 minutes.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="fp-email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Email
          </label>
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            placeholder="Enter your email"
            disabled={loading || sent || cooldownSec > 0}
          />
        </div>

        {captchaEnabled && (
          <TurnstileField
            ref={captchaRef}
            disabled={loading || sent || cooldownSec > 0}
          />
        )}

        <button
          type="submit"
          disabled={loading || sent || cooldownSec > 0}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading
            ? "Sending…"
            : sent
              ? "Code sent"
              : cooldownSec > 0
                ? `Wait ${Math.floor(cooldownSec / 60)}:${String(cooldownSec % 60).padStart(2, "0")}`
                : "Send OTP"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/login" className="font-medium text-emerald-600 underline dark:text-emerald-400">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <ForgotPasswordInner />
    </Suspense>
  );
}
