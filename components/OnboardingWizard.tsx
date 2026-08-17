"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectUserRole } from "@/services/authService";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface OnboardingAction {
  label: string;
  href: string;
  primary?: boolean;
}

interface OnboardingStep {
  icon: string;
  title: string;
  subtitle: string;
  actions?: OnboardingAction[];
}

type OnboardingVariant = "guest" | "customer" | "merchant";

const GUEST_STEPS: OnboardingStep[] = [
  {
    icon: "🛒",
    title: "Welcome to TrendMart",
    subtitle:
      "Your neighbourhood marketplace — browse local shops, compare deals, and order straight on WhatsApp with fast delivery.",
  },
  {
    icon: "🏪",
    title: "Shop or sell?",
    subtitle:
      "As a customer you can track orders and save addresses. As a merchant you can open your own store and sell to your area.",
  },
  {
    icon: "🚀",
    title: "Create your free account",
    subtitle:
      "One verified email is all you need. You can also keep browsing as a guest — no sign-up required.",
    actions: [
      { label: "Create account", href: "/signup", primary: true },
      { label: "Sign in", href: "/login" },
    ],
  },
];

const CUSTOMER_STEPS: OnboardingStep[] = [
  {
    icon: "🎉",
    title: "Welcome aboard!",
    subtitle:
      "Your name, phone and precise location are already saved from signup — checkout now fills them in automatically.",
  },
  {
    icon: "📍",
    title: "Save your addresses",
    subtitle:
      "Add home and work addresses once, then every order pre-fills the right one so you check out faster.",
    actions: [{ label: "Add an address", href: "/account/addresses", primary: true }],
  },
  {
    icon: "📦",
    title: "Track orders live",
    subtitle:
      "Follow every order through Pending → Processing → Dispatched → Delivered, right from your account.",
    actions: [{ label: "View tracking", href: "/orders/tracking", primary: true }],
  },
];

const MERCHANT_STEPS: OnboardingStep[] = [
  {
    icon: "🏪",
    title: "Let's open your store",
    subtitle:
      "Register your store name, category, WhatsApp number and logo/banner — then you're ready to start selling.",
    actions: [{ label: "Register my store", href: "/account/become-merchant", primary: true }],
  },
  {
    icon: "⚡",
    title: "Add products fast",
    subtitle:
      "Just Name, Category, Price and Image — no complex stock counts. Toggle any item in/out of stock instantly.",
  },
  {
    icon: "📍",
    title: "Set your delivery radius",
    subtitle:
      "Control how far you deliver (3km, 5km, 10km) and set free-delivery thresholds for bigger orders.",
    actions: [{ label: "Open dashboard", href: "/dashboard", primary: true }],
  },
];

const STORAGE_PREFIX = "tm_onboarding_v1";

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function OnboardingWizard() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);

  const [variant, setVariant] = useState<OnboardingVariant | null>(null);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let key = `${STORAGE_PREFIX}:guest`;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user ?? null;

        if (user) {
          const role = await detectUserRole(user);
          if (role === "admin") {
            if (!cancelled) setVariant(null);
            return;
          }
          key = `${STORAGE_PREFIX}:${user.id}`;
          if (typeof window !== "undefined") {
            try {
              if (localStorage.getItem(key) === "1") {
                if (!cancelled) setVariant(null);
                return;
              }
            } catch {
              /* ignore */
            }
          }
          if (!cancelled) {
            setVariant(role === "merchant" ? "merchant" : "customer");
          }
        } else {
          // Guest welcome: homepage only, once ever.
          if (typeof window !== "undefined") {
            try {
              if (localStorage.getItem(key) === "1" || pathname !== "/") {
                if (!cancelled) setVariant(null);
                return;
              }
            } catch {
              /* ignore */
            }
          }
          if (pathname !== "/") {
            if (!cancelled) setVariant(null);
            return;
          }
          if (!cancelled) setVariant("guest");
        }
      } catch {
        if (!cancelled) setVariant(null);
        return;
      }

      // Wait for the first-open brand splash to finish so overlays never stack.
      const waitForSplash = () => {
        if (cancelled) return;
        const start = Date.now();
        const tryReady = () => {
          if (cancelled) return;
          const locked =
            typeof document !== "undefined" &&
            document.documentElement.classList.contains("tm-splash-lock");
          if (!locked || Date.now() - start > 3200) {
            setReady(true);
          } else {
            window.setTimeout(tryReady, 250);
          }
        };
        window.setTimeout(tryReady, 400);
      };
      waitForSplash();
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, pathname]);

  useEffect(() => {
    if (variant && ready) setOpen(true);
  }, [variant, ready]);

  const steps = variant === "guest"
    ? GUEST_STEPS
    : variant === "merchant"
      ? MERCHANT_STEPS
      : variant === "customer"
        ? CUSTOMER_STEPS
        : [];

  const isLast = stepIndex >= steps.length - 1;

  const dismiss = () => {
    setOpen(false);
    // Persist "seen" for guest or current user.
    try {
      if (variant === "guest") {
        localStorage.setItem(`${STORAGE_PREFIX}:guest`, "1");
      } else {
        supabase.auth.getSession().then(({ data }) => {
          const id = data.session?.user?.id;
          if (id) localStorage.setItem(`${STORAGE_PREFIX}:${id}`, "1");
        });
      }
    } catch {
      /* ignore */
    }
  };

  const handleNext = () => {
    if (isLast) {
      dismiss();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleAction = (href: string) => {
    dismiss();
    router.push(href);
  };

  if (!open || steps.length === 0) return null;

  const step = steps[stepIndex];

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to TrendMart"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-2xl dark:border-zinc-700/50 dark:bg-zinc-900"
      >
        {/* Top gradient accent */}
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 opacity-95" />
        <div className="absolute inset-x-0 top-0 h-28">
          <div className="absolute -top-8 -right-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -top-6 left-1/3 h-24 w-24 rounded-full bg-white/10 blur-xl" />
        </div>

        {/* Skip */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 z-10 rounded-full bg-black/20 px-3 py-1 text-xs font-semibold text-white transition hover:bg-black/30"
        >
          Skip
        </button>

        <div className="relative px-7 pb-7 pt-24 text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-3xl shadow-lg shadow-emerald-900/10 ring-1 ring-black/5">
                <span aria-hidden="true">{step.icon}</span>
              </div>

              <h2 className="mt-5 text-xl font-bold text-zinc-900 dark:text-zinc-100">
                {step.title}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {step.subtitle}
              </p>

              {step.actions && step.actions.length > 0 && (
                <div className="mt-5 flex flex-col gap-2">
                  {step.actions.map((action) => (
                    <button
                      key={action.href}
                      type="button"
                      onClick={() => handleAction(action.href)}
                      className={
                        action.primary
                          ? "w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700"
                          : "w-full rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      }
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Progress dots */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? "w-6 bg-emerald-500"
                    : i < stepIndex
                      ? "w-1.5 bg-emerald-300"
                      : "w-1.5 bg-zinc-200 dark:bg-zinc-700"
                }`}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={dismiss}
              className="px-3 py-2 text-sm font-medium text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
            >
              {variant === "guest" ? "Browse as guest" : "Skip for now"}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-full bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              {isLast ? "Done" : "Next →"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
