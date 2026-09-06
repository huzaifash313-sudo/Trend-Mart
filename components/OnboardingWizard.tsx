"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectUserRole } from "@/services/authService";
import { fetchMyShop } from "@/services/shopService";

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
    title: "Welcome to TrendsMart",
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
      "Finish your delivery profile — name, phone and precise location — so checkout auto-fills everything for you.",
    actions: [{ label: "Complete my profile", href: "/account/complete-profile", primary: true }],
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

/**
 * The dedicated onboarding pages already guide the user — never stack the
 * full-screen welcome on top of them. Auth pages, the admin panel, and the
 * verify-notice screen are also excluded so the flow only ever appears in
 * the normal storefront.
 */
const BLOCKED_PATHS = [
  "/account/become-merchant",
  "/account/complete-profile",
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/admin",
] as const;

function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function markSeen(storageKey: string): void {
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    /* ignore */
  }
}

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

  /* Lock body scroll while the full-screen flow is visible. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let key = `${STORAGE_PREFIX}:guest`;

      try {
        if (isBlockedPath(pathname)) {
          if (!cancelled) setVariant(null);
          return;
        }

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

          // DB is the source of truth: once onboarding_seen_at is set for this
          // account, the wizard never plays again — on any device/browser, even
          // if localStorage was cleared. The localStorage key is only a fast
          // same-device cache.
          const seen = await isOnboardingSeen(supabase, user.id, key);
          if (seen) {
            if (!cancelled) setVariant(null);
            return;
          }

          let show = false;
          if (role === "merchant") {
            // Merchants: welcome them until their first store exists.
            const shopResult = await fetchMyShop();
            if (cancelled) return;
            show = !(shopResult.success && shopResult.data);
          } else {
            // Customers: welcome them while the delivery profile is incomplete.
            const complete = await isProfileComplete(supabase, user.id);
            if (cancelled) return;
            show = !complete;
          }

          if (!show) {
            // Durable flag for established accounts too — but only once per
            // device (localStorage cache), so we don't write on every nav.
            try {
              if (typeof window !== "undefined" && localStorage.getItem(key) !== "1") {
                markSeen(key);
                void persistOnboardingSeen(supabase, user.id);
              }
            } catch {
              markSeen(key);
            }
            if (!cancelled) setVariant(null);
            return;
          }

          // ONE-TIME flow: persist the flag right now — before the wizard even
          // opens — so a refresh, navigation, sign-out or re-login can never
          // replay it for this account.
          markSeen(key);
          if (!cancelled) {
            try {
              await persistOnboardingSeen(supabase, user.id);
            } catch {
              /* non-fatal — localStorage cache still blocks same-device replays */
            }
          }
          if (cancelled) return;
          setVariant(role === "merchant" ? "merchant" : "customer");
        } else {
          // Guest welcome: homepage only, once ever per device.
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
    if (variant && ready) {
      setStepIndex(0);
      setOpen(true);
    }
  }, [variant, ready]);

  const steps =
    variant === "guest"
      ? GUEST_STEPS
      : variant === "merchant"
        ? MERCHANT_STEPS
        : variant === "customer"
          ? CUSTOMER_STEPS
          : [];

  const isLast = stepIndex >= steps.length - 1;
  const step = steps[stepIndex];

  const dismiss = () => {
    setOpen(false);
    // Persist "seen" for guest or current user so refresh / sign-out never replays.
    try {
      if (variant === "guest") {
        markSeen(`${STORAGE_PREFIX}:guest`);
      } else {
        supabase.auth.getSession().then(({ data }) => {
          const id = data.session?.user?.id;
          if (id) markSeen(`${STORAGE_PREFIX}:${id}`);
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

  const dismissLabel =
    variant === "guest"
      ? "Continue browsing"
      : variant === "customer"
        ? "Skip for now"
        : "Skip for now";

  return (
    <div
      className="tm-onboarding-layer fixed inset-0 z-[9000] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to TrendsMart"
    >
      {/* Full-screen brand backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -10%, color-mix(in srgb, var(--tm-sea-400) 35%, transparent), transparent 55%), radial-gradient(90% 70% at 100% 100%, color-mix(in srgb, var(--tm-sea-600) 50%, transparent), transparent 50%), linear-gradient(165deg, var(--tm-sea-700) 0%, var(--tm-sea-600) 42%, var(--tm-sea-900) 100%)",
        }}
      />
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />

      {/* Top brand */}
      <header className="relative z-10 mx-auto w-full max-w-md px-6 pt-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/trendsmart-mark.png?v=12"
              alt=""
              width={36}
              height={36}
              className="rounded-xl bg-white/95 object-contain p-1 shadow-lg shadow-black/20"
            />
            <span className="text-lg font-bold tracking-tight text-white">
              TrendsMart
            </span>
          </div>
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? "w-7 bg-white"
                    : i < stepIndex
                      ? "w-2 bg-white/70"
                      : "w-2 bg-white/25"
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Step content — fills the screen */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={stepIndex}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex w-full flex-col items-center text-center"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 text-5xl shadow-xl shadow-black/20 ring-1 ring-white/25 backdrop-blur-sm">
              <span aria-hidden="true">{step.icon}</span>
            </div>

            <h2 className="mt-7 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {step.title}
            </h2>
            <p className="mx-auto mt-3 max-w-sm text-base leading-relaxed text-emerald-50/90">
              {step.subtitle}
            </p>

            {step.actions && step.actions.length > 0 && (
              <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
                {step.actions.map((action) => (
                  <button
                    key={action.href}
                    type="button"
                    onClick={() => handleAction(action.href)}
                    className={
                      action.primary
                        ? "w-full rounded-2xl bg-white py-3.5 text-sm font-bold text-emerald-800 shadow-lg shadow-black/20 transition hover:bg-emerald-50 active:scale-[0.98]"
                        : "w-full rounded-2xl border border-white/30 bg-white/10 py-3.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
                    }
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom controls */}
      <footer className="relative z-10 mx-auto w-full max-w-md px-6 pb-10">
        <div className="flex flex-col items-center gap-4">
          {!isLast ? (
            <button
              type="button"
              onClick={handleNext}
              className="w-full max-w-xs rounded-2xl bg-white/10 py-3.5 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
            >
              Next →
            </button>
          ) : step.actions ? (
            <button
              type="button"
              onClick={dismiss}
              className="text-sm font-medium text-emerald-50/70 underline underline-offset-4 transition hover:text-white"
            >
              {dismissLabel}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="w-full max-w-xs rounded-2xl bg-white py-3.5 text-sm font-bold text-emerald-800 shadow-lg shadow-black/20 transition hover:bg-emerald-50 active:scale-[0.98]"
            >
              Get started
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function isOnboardingSeen(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  storageKey: string,
): Promise<boolean> {
  // Fast path — same device already played it.
  try {
    if (typeof window !== "undefined" && localStorage.getItem(storageKey) === "1") {
      return true;
    }
  } catch {
    /* ignore */
  }
  // Durable source of truth — per account, survives device changes & cache clears.
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("onboarding_seen_at")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(profile?.onboarding_seen_at);
  } catch {
    return false;
  }
}

async function persistOnboardingSeen(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> {
  await supabase.from("user_profiles").upsert(
    { user_id: userId, onboarding_seen_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
}

async function isProfileComplete(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, phone, address, latitude, longitude")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return false;
    const nameOk =
      typeof profile.full_name === "string" && profile.full_name.trim().length >= 2;
    const phoneOk =
      typeof profile.phone === "string" && profile.phone.trim().length >= 7;
    const locationOk =
      typeof profile.latitude === "number" ||
      (typeof profile.address === "string" && profile.address.trim().length > 0);
    return nameOk && phoneOk && locationOk;
  } catch {
    return false;
  }
}
