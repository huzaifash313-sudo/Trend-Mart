"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Merchant dashboard nav polish                                  */
/*                                                                             */
/*  Prefetches the common dashboard routes so taps feel instant, and paints a  */
/*  thin teal progress bar while the App Router is still swapping pages.       */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const DASHBOARD_PREFETCH = [
  "/dashboard",
  "/dashboard/orders",
  "/dashboard/products",
  "/dashboard/products/new",
  "/dashboard/analytics",
  "/dashboard/settings",
  "/dashboard/finances",
  "/dashboard/ads",
  "/dashboard/inquiries",
  "/dashboard/leads",
  "/dashboard/kitchen",
  "/dashboard/tables",
] as const;

export default function DashboardNavSmooth() {
  const pathname = usePathname();
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const prevPath = useRef(pathname);

  /* Warm the JS bundles for sibling dashboard pages once. */
  useEffect(() => {
    let cancelled = false;

    const runPrefetch = () => {
      if (cancelled) return;
      for (const href of DASHBOARD_PREFETCH) {
        try {
          router.prefetch(href);
        } catch {
          /* prefetch is best-effort */
        }
      }
    };

    const timeoutId = window.setTimeout(runPrefetch, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  /* Start a soft progress bar on internal dashboard link clicks. */
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]");
      if (!anchor) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (!url.pathname.startsWith("/dashboard")) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return;
      }

      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (tickTimer.current) window.clearInterval(tickTimer.current);

      setVisible(true);
      setProgress(12);
      tickTimer.current = window.setInterval(() => {
        setProgress((p) => (p >= 88 ? p : p + Math.max(1, (90 - p) * 0.08)));
      }, 120);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (tickTimer.current) window.clearInterval(tickTimer.current);
    };
  }, []);

  /* Complete the bar when the pathname actually changes. */
  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;

    if (tickTimer.current) {
      window.clearInterval(tickTimer.current);
      tickTimer.current = null;
    }

    setVisible(true);
    setProgress(100);
    hideTimer.current = window.setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-0.5 overflow-hidden"
      aria-hidden
    >
      <div
        className="h-full origin-left bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.55)] transition-[width,opacity] duration-200 ease-out dark:bg-emerald-400"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
