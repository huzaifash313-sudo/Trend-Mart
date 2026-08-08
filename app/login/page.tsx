"use client";

import { useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import AuthForm from "@/components/AuthForm";
import OtpVerificationModal from "@/components/OtpVerificationModal";
import { signInWithEmail, redirectToDashboard } from "@/services/authService";
import { useToast } from "@/components/Toast";
import type { SignInFormValues, SignUpFormValues } from "@/lib/validations";

/* -------------------------------------------------------------------------- */
/*  Constants — pre-compute particle values                                   */
/* -------------------------------------------------------------------------- */

const PARTICLE_CONFIGS = Array.from({ length: 12 }).map((_, i) => ({
  width: 20 + ((i * 17 + 23) % 61),
  height: 20 + ((i * 29 + 17) % 61),
  left: ((i * 13 + 7) % 91),
  top: ((i * 19 + 11) % 91),
  duration: 6 + (i % 7) * 0.7,
  delay: i * 0.5,
}));

/* -------------------------------------------------------------------------- */
/*  Animated Background Particles                                              */
/* -------------------------------------------------------------------------- */

function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLE_CONFIGS.map((cfg, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-emerald-400/20 dark:bg-emerald-500/15"
          style={{
            width: `${cfg.width}px`,
            height: `${cfg.height}px`,
            left: `${cfg.left}%`,
            top: `${cfg.top}%`,
          }}
          animate={{
            y: [0, -30, 0, 30, 0],
            x: [0, 20, -10, 15, 0],
            scale: [1, 1.1, 0.95, 1.05, 1],
            opacity: [0.3, 0.6, 0.4, 0.7, 0.3],
          }}
          transition={{
            duration: cfg.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: cfg.delay,
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Gradient Orb Animation                                                     */
/* -------------------------------------------------------------------------- */

function GradientOrbs() {
  return (
    <>
      <motion.div
        className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-400 to-teal-300 opacity-30 blur-3xl dark:from-emerald-600 dark:to-teal-500 dark:opacity-20"
        animate={{
          x: [0, 30, -10, 0],
          y: [0, -20, 15, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-32 -right-32 h-72 w-72 rounded-full bg-gradient-to-tl from-emerald-300 to-cyan-400 opacity-30 blur-3xl dark:from-emerald-500 dark:to-cyan-600 dark:opacity-20"
        animate={{
          x: [0, -20, 15, 0],
          y: [0, 30, -10, 0],
          scale: [1, 0.9, 1.15, 1],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function LoginPage() {
  const { addToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);

  const handleSubmit = useCallback(
    async (values: SignInFormValues | SignUpFormValues) => {
      setIsLoading(true);
      setServerError(null);

      try {
        const result = await signInWithEmail(values.email, values.password);

        if (result.success && result.role) {
          addToast("Welcome back!", "success");
          // Small delay to let the session cookies propagate
          await new Promise((r) => setTimeout(r, 300));
          redirectToDashboard(result.role);
          return;
        }

        if (!result.success && "needsVerification" in result && result.needsVerification && result.user) {
          // Email not verified — redirect to verify-notice page
          setServerError(null);
          addToast("Please verify your email to continue.", "info");
          const verifyUrl = `/auth/verify-notice?redirect=${encodeURIComponent("/")}`;
          window.location.href = verifyUrl;
          return;
        }

        if (!result.success) {
          setServerError(result.error ?? "Sign in failed. Please check your credentials.");
          addToast(result.error ?? "Authentication failed.", "error");
        }
      } catch (err) {
        setServerError(err instanceof Error ? err.message : "An unexpected error occurred.");
        addToast("Login failed. Please try again.", "error");
      } finally {
        setIsLoading(false);
      }
    },
    [addToast],
  );

  const handleOtpVerified = useCallback(() => {
    setShowOtpModal(false);
    setOtpEmail(null);
    addToast("Verification successful! Signing you in...", "success");
    redirectToDashboard("customer");
  }, [addToast]);

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* ─── Left Panel: Branding & Animations ────────────────────────── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-12 lg:flex">
        {/* Gradient Orbs */}
        <GradientOrbs />
        {/* Floating Particles */}
        <FloatingParticles />

        {/* Brand */}
        <motion.div
          className="relative z-10"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <Link href="/" className="inline-block">
            <h1 className="text-3xl font-bold tracking-tight text-white">
              TrendMart
            </h1>
          </Link>
          <motion.p
            className="mt-3 text-lg text-emerald-100/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            Your neighborhood, delivered.
          </motion.p>
        </motion.div>

        {/* Hero micro-copy */}
        <motion.div
          className="relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <h2 className="mb-4 text-4xl font-bold leading-tight text-white">
            Welcome back to your local marketplace.
          </h2>
          <p className="max-w-md text-emerald-100/80 leading-relaxed">
            Sign in to manage your shop, track orders, and connect with
            customers in real time — all from one beautiful dashboard.
          </p>

          {/* Animated stats */}
          <motion.div
            className="mt-8 grid grid-cols-3 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.6 }}
          >
            {[
              { value: "500+", label: "Active Shops" },
              { value: "10k+", label: "Products Listed" },
              { value: "24/7", label: "WhatsApp Orders" },
            ].map((stat) => (
              <motion.div
                key={stat.label}
                className="rounded-xl bg-white/10 backdrop-blur-sm p-3 text-center"
                whileHover={{ scale: 1.05, backgroundColor: "rgba(255,255,255,0.15)" }}
              >
                <p className="text-2xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-emerald-100/70">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        {/* Footer */}
        <motion.p
          className="relative z-10 text-sm text-emerald-100/60"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          &copy; {new Date().getFullYear()} TrendMart. Built for local commerce.
        </motion.p>
      </div>

      {/* ─── Right Panel: Auth Form ───────────────────────────────────── */}
      <div className="flex w-full items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950 lg:w-1/2">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {/* Mobile logo (visible only on small screens) */}
          <div className="mb-8 text-center lg:hidden">
            <Link href="/">
              <h1 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                TrendMart
              </h1>
            </Link>
          </div>

          {/* Glassmorphic card */}
          <div className="rounded-2xl border border-zinc-200/60 bg-white/80 backdrop-blur-xl p-8 shadow-xl shadow-zinc-200/20 dark:border-zinc-700/40 dark:bg-zinc-900/80 dark:shadow-zinc-900/30">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                Sign In
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Enter your credentials to access your account.
              </p>
            </motion.div>

            {/* Divider */}
            <div className="my-6 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-700" />

            {/* Auth Form */}
            <AuthForm
              mode="sign-in"
              onSubmit={handleSubmit}
              isLoading={isLoading}
              serverError={serverError}
            />

            {/* Sign-up link */}
            <motion.p
              className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              >
                Sign up
              </Link>
            </motion.p>
          </div>

          {/* Back to home link */}
          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <Link
              href="/"
              className="text-sm text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
            >
              &larr; Back to home
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* OTP Modal */}
      <OtpVerificationModal
        email={otpEmail ?? ""}
        isOpen={showOtpModal}
        onClose={() => {
          setShowOtpModal(false);
          setOtpEmail(null);
        }}
        onVerified={handleOtpVerified}
      />
    </div>
  );
}