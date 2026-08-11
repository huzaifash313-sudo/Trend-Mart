"use client";

import { useState, useCallback, Suspense } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import OtpVerificationModal from "@/components/OtpVerificationModal";
import { signUpWithEmail, redirectToDashboard, getCurrentUser, claimSignupRole, syncContactProfileFromMetadata } from "@/services/authService";
import { recordLegalAcceptance } from "@/services/legalService";
import { useToast } from "@/components/Toast";
import type { SignInFormValues, SignUpFormValues } from "@/lib/validations";
import type { AuthRole } from "@/services/authService";

/* -------------------------------------------------------------------------- */
/*  Pre-computed particle configurations                                      */
/* -------------------------------------------------------------------------- */

const PARTICLE_CONFIGS = Array.from({ length: 14 }).map((_, i) => ({
  width: 18 + ((i * 13 + 31) % 53),
  height: 18 + ((i * 23 + 17) % 53),
  left: ((i * 17 + 3) % 93),
  top: ((i * 11 + 7) % 93),
  duration: 5.5 + (i % 6) * 0.8,
  delay: i * 0.4,
}));

/* -------------------------------------------------------------------------- */
/*  Floating Particles                                                         */
/* -------------------------------------------------------------------------- */

function FloatingParticles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {PARTICLE_CONFIGS.map((cfg, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-emerald-300/20 dark:bg-emerald-400/15"
          style={{
            width: `${cfg.width}px`,
            height: `${cfg.height}px`,
            left: `${cfg.left}%`,
            top: `${cfg.top}%`,
          }}
          animate={{
            y: [0, -25, 0, 25, 0],
            x: [0, -15, 10, -5, 0],
            scale: [1, 1.08, 0.92, 1.06, 1],
            opacity: [0.25, 0.55, 0.35, 0.65, 0.25],
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
/*  Gradient Orbs                                                              */
/* -------------------------------------------------------------------------- */

function GradientOrbs() {
  return (
    <>
      <motion.div
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-bl from-emerald-400 to-teal-400 opacity-25 blur-3xl dark:from-emerald-500 dark:to-teal-500 dark:opacity-15"
        animate={{
          x: [0, -25, 10, 0],
          y: [0, 20, -15, 0],
          scale: [1, 1.15, 0.9, 1],
        }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-gradient-to-tr from-teal-300 to-emerald-400 opacity-25 blur-3xl dark:from-teal-500 dark:to-emerald-500 dark:opacity-15"
        animate={{
          x: [0, 15, -20, 0],
          y: [0, -25, 10, 0],
          scale: [1, 0.85, 1.1, 1],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

function safeRedirect(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return null;
  return path;
}

function SignupPageInner() {
  const { addToast } = useToast();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingRole, setPendingRole] = useState<AuthRole>("customer");

  const goAfterAuth = useCallback(
    (role: AuthRole | "admin") => {
      if (redirectTo) {
        window.location.href = redirectTo;
        return;
      }
      redirectToDashboard(role);
    },
    [redirectTo],
  );

  const handleSubmit = useCallback(
    async (values: SignInFormValues | SignUpFormValues) => {
      const signupValues = values as SignUpFormValues;
      setIsLoading(true);
      setServerError(null);

      const result = await signUpWithEmail(
        signupValues.email,
        signupValues.password,
        signupValues.role,
        {
          fullName: signupValues.full_name,
          phone: signupValues.phone,
        },
      );

      if (result.success && !result.needsOtpVerification && result.role) {
        setIsLoading(false);
        if (result.user?.id) {
          recordLegalAcceptance(result.user.id, ["terms", "privacy"]);
        }
        addToast(
          signupValues.role === "merchant"
            ? "Merchant account created! Set up your store next."
            : "Account created! Welcome to TrendMart.",
          "success",
        );
        goAfterAuth(result.role);
        return;
      }

      if (result.success && result.needsOtpVerification) {
        setIsLoading(false);
        setOtpEmail(signupValues.email);
        setPendingRole(signupValues.role);
        setShowOtpModal(true);
        addToast("Please verify your email to continue.", "info");
        return;
      }

      setIsLoading(false);
      setServerError(result.error ?? "Sign up failed. Please try again.");
      addToast(result.error ?? "Registration failed.", "error");
    },
    [addToast, goAfterAuth],
  );

  const handleOtpVerified = useCallback(async () => {
    setShowOtpModal(false);
    setOtpEmail(null);
    const user = await getCurrentUser();
    if (user?.id) {
      recordLegalAcceptance(user.id, ["terms", "privacy"]);
      await claimSignupRole(pendingRole);
      await syncContactProfileFromMetadata(user);
    }
    addToast(
      pendingRole === "merchant"
        ? "Email verified! Set up your store next."
        : "Email verified! Welcome to TrendMart.",
      "success",
    );
    goAfterAuth(pendingRole);
  }, [addToast, pendingRole, goAfterAuth]);

  return (
    <div className="relative flex min-h-screen overflow-hidden">
      {/* ─── Left Panel: Branding & Animations ────────────────────────── */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 p-12 lg:flex">
        <GradientOrbs />
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
                Join TrendMart today.
              </h2>
              <p className="max-w-md text-emerald-100/80 leading-relaxed">
                Shop local as a customer — or open your store as a merchant.
                One platform for browsing, ordering, and selling in your neighborhood.
              </p>

              {/* Feature highlights */}
              <motion.div
                className="mt-8 space-y-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.6 }}
              >
                {[
                  { icon: "🛒", text: "Customers: orders, tracking & wishlist" },
                  { icon: "🏪", text: "Merchants: store dashboard & WhatsApp orders" },
                  { icon: "✅", text: "Verify once — never again at checkout" },
                ].map((feature) => (
              <motion.div
                key={feature.text}
                className="flex items-center gap-3 text-white/90"
                whileHover={{ x: 4 }}
              >
                <span className="text-xl">{feature.icon}</span>
                <span className="text-sm">{feature.text}</span>
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
      <div className="flex w-full items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-[color:var(--tm-surface)] lg:w-1/2">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {/* Mobile logo */}
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
                Create an Account
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Start your journey with TrendMart today.
              </p>
            </motion.div>

            {/* Divider */}
            <div className="my-6 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent dark:via-zinc-700" />

            {/* Auth Form */}
            <AuthForm
              mode="sign-up"
              onSubmit={handleSubmit}
              isLoading={isLoading}
              serverError={serverError}
            />

            {/* Sign-in link */}
            <motion.p
              className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors"
              >
                Sign in
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

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <SignupPageInner />
    </Suspense>
  );
}