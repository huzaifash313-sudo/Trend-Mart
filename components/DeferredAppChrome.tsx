"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { shouldSkipHeavyMedia } from "@/lib/mobilePerf";

/**
 * Heavy always-on chrome (chatbot, onboarding motion, review prompts) mounts
 * after first paint / idle so mobile main-thread can finish hydrating the
 * storefront first. Navbar / cart / bottom nav stay eager — they're above-fold UX.
 * Low-end (≈2 GB) phones wait longer so the feed stays scrollable first.
 */
const TrendBotHost = dynamic(() => import("@/components/trendbot/TrendBotHost"), {
  ssr: false,
});
const OnboardingWizard = dynamic(() => import("@/components/OnboardingWizard"), {
  ssr: false,
});
const ReviewReminderPopup = dynamic(
  () => import("@/components/ReviewReminderPopup"),
  { ssr: false },
);

export default function DeferredAppChrome() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };

    const lowEnd = shouldSkipHeavyMedia();
    const idleTimeout = lowEnd ? 20000 : 8000;
    const fallbackMs = lowEnd ? 12000 : 4500;

    const w = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(arm, { timeout: idleTimeout });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }

    const t = window.setTimeout(arm, fallbackMs);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  if (!ready) return null;

  return (
    <>
      <TrendBotHost />
      <OnboardingWizard />
      <ReviewReminderPopup />
    </>
  );
}
