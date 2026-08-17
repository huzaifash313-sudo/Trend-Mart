"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestPasswordReset } from "@/services/authService";
import { useToast } from "@/components/Toast";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (!result.success) {
      addToast(result.error || "Could not send reset code.", "error");
      return;
    }
    setSent(true);
    addToast("Reset code sent — check your email.", "success");
    router.push(`/auth/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Forgot password</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter your account email. We&apos;ll send a one-time OTP so you can set a new password.
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
            disabled={loading || sent}
          />
        </div>
        <button
          type="submit"
          disabled={loading || sent}
          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? "Sending…" : sent ? "Code sent" : "Send OTP"}
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
