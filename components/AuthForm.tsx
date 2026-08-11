"use client";

import { useState, useCallback, type FormEvent } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { signInSchema, signUpSchema, type SignInFormValues, type SignUpFormValues } from "@/lib/validations";
import { formatPkPhoneInput, PK_PHONE_PLACEHOLDER } from "@/lib/phoneFormat";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AuthFormProps {
  mode: "sign-in" | "sign-up";
  onSubmit: (values: SignInFormValues | SignUpFormValues) => Promise<void>;
  isLoading: boolean;
  serverError?: string | null;
}

interface FieldErrors {
  [field: string]: string;
}

/* -------------------------------------------------------------------------- */
/*  Password Strength Calculator                                              */
/* -------------------------------------------------------------------------- */

interface StrengthResult {
  score: number; // 0-4
  label: string;
  color: string;
}

function calculatePasswordStrength(password: string): StrengthResult {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const normalized = Math.min(4, score);

  const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong"];
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-400",
    "bg-emerald-600",
  ];

  return {
    score: normalized,
    label: labels[normalized],
    color: colors[normalized],
  };
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export default function AuthForm({ mode, onSubmit, isLoading, serverError }: AuthFormProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<"customer" | "merchant">("customer");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsTouched, setTermsTouched] = useState(false);

  const passwordStrength = calculatePasswordStrength(password);

  const validateField = useCallback(
    (field: string, value: string) => {
      const data =
        mode === "sign-in"
          ? { email, password, [field]: value }
          : {
              full_name: fullName,
              phone,
              email,
              password,
              confirmPassword,
              role,
              [field]: value,
            };

      const schema = mode === "sign-in" ? signInSchema : signUpSchema;
      const result = schema.safeParse(data);

      if (result.success) {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
        return;
      }

      const issues = result.error.issues.filter(
        (issue) => issue.path[0] === field,
      );

      if (issues.length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          [field]: issues[0].message,
        }));
      } else {
        setFieldErrors((prev) => {
          const next = { ...prev };
          delete next[field];
          return next;
        });
      }
    },
    [email, password, confirmPassword, fullName, phone, role, mode],
  );

  const validateAll = useCallback((): boolean => {
    const data =
      mode === "sign-in"
        ? { email, password }
        : { full_name: fullName, phone, email, password, confirmPassword, role };
    const schema = mode === "sign-in" ? signInSchema : signUpSchema;
    const result = schema.safeParse(data);

    if (result.success) {
      setFieldErrors({});
      return true;
    }

    const errors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0]);
      if (!errors[field]) {
        errors[field] = issue.message;
      }
    }
    setFieldErrors(errors);
    return false;
  }, [email, password, confirmPassword, fullName, phone, role, mode]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      setTouched({
        full_name: true,
        phone: true,
        email: true,
        password: true,
        confirmPassword: true,
        role: true,
      });

      if (!validateAll()) return;

      if (mode === "sign-up") {
        setTermsTouched(true);
        if (!agreedToTerms) return;
      }

      const values =
        mode === "sign-in"
          ? { email, password }
          : {
              full_name: fullName.trim(),
              phone,
              email,
              password,
              confirmPassword,
              role,
            };

      await onSubmit(values);
    },
    [
      email,
      password,
      confirmPassword,
      fullName,
      phone,
      role,
      mode,
      onSubmit,
      validateAll,
      agreedToTerms,
    ],
  );

  const handleChange = useCallback(
    (field: string, value: string) => {
      const nextValue = field === "phone" ? formatPkPhoneInput(value) : value;
      switch (field) {
        case "full_name":
          setFullName(nextValue);
          break;
        case "phone":
          setPhone(nextValue);
          break;
        case "email":
          setEmail(nextValue);
          break;
        case "password":
          setPassword(nextValue);
          break;
        case "confirmPassword":
          setConfirmPassword(nextValue);
          break;
      }

      setTouched((prev) => ({ ...prev, [field]: true }));
      validateField(field, nextValue);
    },
    [validateField],
  );

  const getFieldError = (field: string): string | undefined => {
    if (touched[field]) {
      return fieldErrors[field];
    }
    return undefined;
  };

  const inputClassName = (field: string) =>
    `w-full rounded-xl border bg-white/70 backdrop-blur-sm px-4 py-3 text-sm text-zinc-900 placeholder-zinc-300/50 transition-all duration-200 outline-none dark:bg-zinc-800/70 dark:text-zinc-100 ${
      getFieldError(field)
        ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 dark:border-red-500"
        : touched[field] && !getFieldError(field)
          ? "border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-emerald-500"
          : "border-zinc-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:focus:border-emerald-400"
    }`;

  return (
    <motion.form
      onSubmit={handleSubmit}
      className="space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3, duration: 0.4 }}
    >
      {serverError && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
        >
          {serverError}
        </motion.div>
      )}

      {mode === "sign-up" && (
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            I want to sign up as
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRole("customer")}
              disabled={isLoading}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                role === "customer"
                  ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/40"
                  : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50"
              }`}
            >
              <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">Customer</span>
              <span className="mt-0.5 block text-[0.7rem] leading-snug text-zinc-500 dark:text-zinc-400">
                Shop, track orders & wishlist
              </span>
            </button>
            <button
              type="button"
              onClick={() => setRole("merchant")}
              disabled={isLoading}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                role === "merchant"
                  ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-950/40"
                  : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800/50"
              }`}
            >
              <span className="block text-sm font-bold text-zinc-900 dark:text-zinc-100">Merchant</span>
              <span className="mt-0.5 block text-[0.7rem] leading-snug text-zinc-500 dark:text-zinc-400">
                Open a store & sell products
              </span>
            </button>
          </div>
          {role === "customer" ? (
            <p className="mt-2 text-[0.7rem] text-zinc-500 dark:text-zinc-400">
              Name + phone required. Verify email before checkout. Phone SMS OTP is not required.
            </p>
          ) : (
            <p className="mt-2 text-[0.7rem] text-zinc-500 dark:text-zinc-400">
              Name + phone required. Email verify once — then register your store and go live immediately (auto-approved).
            </p>
          )}
        </div>
      )}

      {mode === "sign-up" && (
        <>
          <div>
            <label
              htmlFor="full_name"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Full name <span className="text-red-500">*</span>
            </label>
            <input
              id="full_name"
              type="text"
              required
              autoComplete="name"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => handleChange("full_name", e.target.value)}
              className={inputClassName("full_name")}
              disabled={isLoading}
            />
            {getFieldError("full_name") && (
              <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
                {getFieldError("full_name")}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Phone number <span className="text-red-500">*</span>
            </label>
            <input
              id="phone"
              type="tel"
              required
              autoComplete="tel"
              inputMode="numeric"
              placeholder={PK_PHONE_PLACEHOLDER}
              value={phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className={inputClassName("phone")}
              disabled={isLoading}
            />
            <p className="mt-1 text-[0.65rem] text-zinc-500 dark:text-zinc-400">
              Required for orders & WhatsApp contact. SMS OTP verification is disabled for now.
            </p>
            {getFieldError("phone") && (
              <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
                {getFieldError("phone")}
              </p>
            )}
          </div>
        </>
      )}

      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Email address
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => handleChange("email", e.target.value)}
            className={`${inputClassName("email")} pl-10`}
            disabled={isLoading}
          />
          {touched["email"] && !getFieldError("email") && email && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3.5">
              <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </div>
        {getFieldError("email") && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-1.5 text-xs text-red-500 dark:text-red-400"
          >
            {getFieldError("email")}
          </motion.p>
        )}
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Password
        </label>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => handleChange("password", e.target.value)}
            className={`${inputClassName("password")} pl-10 pr-10`}
            disabled={isLoading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            aria-label={showPassword ? "Hide password" : "Show password"}
            tabIndex={-1}
          >
            {showPassword ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {getFieldError("password") && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-1.5 text-xs text-red-500 dark:text-red-400"
          >
            {getFieldError("password")}
          </motion.p>
        )}
        {mode === "sign-in" && (
          <div className="mt-1.5 text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-emerald-600 underline dark:text-emerald-400"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {mode === "sign-up" && password.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2"
          >
            <div className="flex gap-1">
              {[0, 1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    level <= passwordStrength.score && passwordStrength.score > 0
                      ? passwordStrength.color
                      : "bg-zinc-200 dark:bg-zinc-700"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {passwordStrength.label}
            </p>
          </motion.div>
        )}
      </div>

      {mode === "sign-up" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <label
            htmlFor="confirmPassword"
            className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Confirm password
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => handleChange("confirmPassword", e.target.value)}
              className={`${inputClassName("confirmPassword")} pl-10 pr-10`}
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              tabIndex={-1}
            >
              {showConfirmPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {getFieldError("confirmPassword") && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-1.5 text-xs text-red-500 dark:text-red-400"
            >
              {getFieldError("confirmPassword")}
            </motion.p>
          )}
        </motion.div>
      )}

      {mode === "sign-up" && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
        >
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => {
                setAgreedToTerms(e.target.checked);
                setTermsTouched(true);
              }}
              disabled={isLoading}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-emerald-600 focus:ring-1 focus:ring-emerald-500 dark:border-zinc-600"
            />
            <span className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              I agree to TrendMart&apos;s{" "}
              <Link href="/legal/terms" target="_blank" className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400">
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link href="/legal/privacy" target="_blank" className="font-medium text-emerald-600 underline underline-offset-2 hover:text-emerald-700 dark:text-emerald-400">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {termsTouched && !agreedToTerms && (
            <p className="mt-1.5 text-xs text-red-500 dark:text-red-400">
              You must agree to the Terms &amp; Privacy Policy to create an account.
            </p>
          )}
        </motion.div>
      )}

      <motion.button
        type="submit"
        disabled={isLoading}
        whileTap={isLoading ? undefined : { scale: 0.98 }}
        className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-zinc-900 relative overflow-hidden"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {mode === "sign-in" ? "Signing in..." : "Creating account..."}
          </span>
        ) : mode === "sign-in" ? (
          "Sign In"
        ) : (
          "Create Account"
        )}
      </motion.button>
    </motion.form>
  );
}
