"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

/**
 * Heavy always-on chrome (chatbot, onboarding motion, review prompts) mounts
 * after first paint / idle so mobile main-thread can finish hydrating the
 * storefront first. Navbar / cart / bottom nav stay eager — they're above-fold UX.
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

    // Prefer idle; always fall back so slow phones still get chrome.
    const w = window as Window &
      typeof globalThis & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(arm, { timeout: 2200 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }

    const t = window.setTimeout(arm, 900);
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
