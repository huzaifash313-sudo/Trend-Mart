"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  updatePasswordAfterRecovery,
  verifyRecoveryOtp,
} from "@/services/authService";
import { useToast } from "@/components/Toast";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToast } = useToast();
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const result = await verifyRecoveryOtp(email, code);
    setLoading(false);
    if (!result.success) {
      addToast(result.error || "Invalid code.", "error");
      return;
    }
    setVerified(true);
    addToast("Code verified — set your new password.", "success");
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      addToast("Password must be at least 8 characters.", "error");
      return;
    }
    if (password !== confirm) {
      addToast("Passwords do not match.", "error");
      return;
    }
    setLoading(true);
    const result = await updatePasswordAfterRecovery(password);
    setLoading(false);
    if (!result.success) {
      addToast(result.error || "Could not update password.", "error");
      return;
    }
    addToast("Password updated. You can sign in now.", "success");
    router.push("/login");
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Reset password</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Enter the OTP from your email, then choose a new password.
      </p>

      {!verified ? (
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          <div>
            <label htmlFor="rp-email" className="mb-1 block text-sm font-medium">Email</label>
            <input
              id="rp-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label htmlFor="rp-code" className="mb-1 block text-sm font-medium">OTP code</label>
            <input
              id="rp-code"
              inputMode="numeric"
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="6-digit code"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm tracking-widest dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Verifying…" : "Verify OTP"}
          </button>
        </form>
      ) : (
        <form onSubmit={savePassword} className="mt-6 space-y-4">
          <div>
            <label htmlFor="rp-pass" className="mb-1 block text-sm font-medium">New password</label>
            <input
              id="rp-pass"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label htmlFor="rp-confirm" className="mb-1 block text-sm font-medium">Confirm password</label>
            <input
              id="rp-confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Save new password"}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/forgot-password" className="font-medium text-emerald-600 underline">
          Resend code
        </Link>
        {" · "}
        <Link href="/login" className="font-medium text-emerald-600 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-zinc-500">Loading…</div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}
