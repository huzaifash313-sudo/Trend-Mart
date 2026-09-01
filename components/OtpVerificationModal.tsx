"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { verifyOtp, resendOtp } from "@/services/authService";
import { useToast } from "@/components/Toast";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface OtpVerificationModalProps {
  email: string;
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void; // called when OTP is successfully verified
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function OtpVerificationModal({
  email,
  isOpen,
  onClose,
  onVerified,
}: OtpVerificationModalProps) {
  const { addToast } = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyingRef = useRef(false);

  // ── Reset state when modal opens ─────────────────────────────────────────
  // Using a ref + state combo to avoid ESLint cascading renders warning.
  // The "key" on the parent wrapper forces React to re-mount the component,
  // which naturally resets all state. We track `isOpen` via a ref to detect
  // transitions and reset non-state refs.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      // Modal just opened — reset any non-state refs
      verifyingRef.current = false;
      // Auto-focus first input after render
      const timeout = setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
      wasOpenRef.current = true;
      return () => clearTimeout(timeout);
    }
    if (!isOpen) {
      wasOpenRef.current = false;
    }
  }, [isOpen]);

  // ── Resend cooldown timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // ── Verify handler ─────────────────────────────────────────────────────────
  const handleVerify = useCallback(async (code: string) => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;

    setIsVerifying(true);
    setError(null);

    const result = await verifyOtp(email, code);

    if (result.success) {
      addToast("Account verified! Redirecting...", "success");
      setTimeout(() => {
        onVerified();
      }, 600);
    } else {
      setError(result.error ?? "Verification failed. Please try again.");
      setIsVerifying(false);
      verifyingRef.current = false;
      // Clear digits on error for retry
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  }, [email, addToast, onVerified]);

  // ── Resend handler ─────────────────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;

    setIsResending(true);
    setError(null);

    const result = await resendOtp(email);

    if (result.success) {
      addToast("A new verification code has been sent.", "success");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError(result.error ?? "Could not resend code. Please try again.");
    }

    setIsResending(false);
  }, [email, resendCooldown, addToast]);

  // ── Change handler (auto-submit when all digits filled) ────────────────────
  const handleChange = useCallback(
    (index: number, value: string) => {
      // Only allow a single numeric digit
      const cleaned = value.replace(/[^0-9]/g, "").slice(-1);
      if (!cleaned) return;

      setDigits((prev) => {
        const next = [...prev];
        next[index] = cleaned;

        // Check if all digits are filled → auto-verify
        const code = next.join("");
        if (code.length === OTP_LENGTH && !verifyingRef.current) {
          // Use setTimeout to let React commit the state update first
          setTimeout(() => handleVerify(code), 0);
        }

        return next;
      });

      // Auto-focus next input
      if (index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [handleVerify],
  );

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace") {
        if (digits[index]) {
          // Clear current digit
          setDigits((prev) => {
            const next = [...prev];
            next[index] = "";
            return next;
          });
        } else if (index > 0) {
          // Move back and clear previous digit
          setDigits((prev) => {
            const next = [...prev];
            next[index - 1] = "";
            return next;
          });
          inputRefs.current[index - 1]?.focus();
        }
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && index > 0) {
        inputRefs.current[index - 1]?.focus();
        e.preventDefault();
      } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
        e.preventDefault();
      }
    },
    [digits],
  );

  // ── Paste handler ──────────────────────────────────────────────────────────
  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
    if (pasted.length === OTP_LENGTH) {
      e.preventDefault();
      const newDigits = pasted.slice(0, OTP_LENGTH).split("");
      setDigits(newDigits);
      // Focus the last input
      inputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Header */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                Verify Your Email
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                We sent a 6-digit code to{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {email}
                </span>
              </p>
            </div>

            {/* Error message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* OTP Input boxes — single row on all viewports */}
            <div className="mb-6 grid w-full grid-cols-6 gap-1.5 sm:gap-2.5">
              {Array.from({ length: OTP_LENGTH }).map((_, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digits[index]}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={index === 0 ? handlePaste : undefined}
                  disabled={isVerifying}
                  className={`aspect-square w-full min-w-0 rounded-lg border-2 text-center text-base font-bold transition-all outline-none sm:rounded-xl sm:text-xl ${
                    isVerifying
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : digits[index]
                        ? "border-emerald-500 bg-white text-emerald-700 dark:border-emerald-500 dark:bg-zinc-800 dark:text-emerald-400"
                        : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                  } focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20 dark:focus:border-emerald-400`}
                  aria-label={`Digit ${index + 1}`}
                />
              ))}
            </div>

            {/* Loading spinner during verification */}
            {isVerifying && (
              <div className="mb-4 flex justify-center">
                <svg className="h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            )}

            {/* Resend section */}
            <div className="text-center">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Didn&apos;t receive the code?{" "}
                {resendCooldown > 0 ? (
                  <span className="font-medium text-zinc-400 dark:text-zinc-500">
                    Resend in {resendCooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isResending}
                    className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-700 disabled:text-zinc-400 disabled:no-underline dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {isResending ? "Sending..." : "Resend Code"}
                  </button>
                )}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}