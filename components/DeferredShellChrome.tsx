"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Footer from "@/components/Footer";

/**
 * Non-critical chrome after first paint. Footer stays SSR-synced via eager
 * import so bottom layout doesn't jump (CLS). Cart/PWA/policy idle-mount.
 */
const CartBar = dynamic(() => import("@/components/CartBar"), { ssr: false });
const MerchantQuickAddHost = dynamic(
  () => import("@/components/MerchantQuickAddHost"),
  { ssr: false },
);
const PolicyNotice = dynamic(() => import("@/components/PolicyNotice"), {
  ssr: false,
});
const ConnectionStatus = dynamic(() => import("@/components/ConnectionStatus"), {
  ssr: false,
});
const PwaRegister = dynamic(() => import("@/components/PwaRegister"), {
  ssr: false,
});

export default function DeferredShellChrome() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(arm, { timeout: 3500 });
      return () => {
        cancelled = true;
        w.cancelIdleCallback?.(id);
      };
    }

    const t = window.setTimeout(arm, 2000);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      <ErrorBoundary name="Footer" autoResetMs={2500}>
        <Footer />
      </ErrorBoundary>
      {ready ? (
        <>
          <ErrorBoundary name="CartBar" autoResetMs={2500}>
            <CartBar />
          </ErrorBoundary>
          <MerchantQuickAddHost />
          <PolicyNotice />
          <ConnectionStatus />
          <PwaRegister />
        </>
      ) : null}
    </>
  );
}
