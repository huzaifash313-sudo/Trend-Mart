"use client";

import { useEffect } from "react";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Client Navigation Recovery Watchdog                            */
/*                                                                             */
/*  Symptom it fixes: occasionally the Next.js client router silently dies —   */
/*  a link click never changes the URL, every navigation seems to do nothing,  */
/*  and only a hard refresh recovers. That leaves the whole app feeling        */
/*  frozen ("kabhi kabhi navigate hi nahi hota, refresh pe theek").            */
/*                                                                             */
/*  Mechanism: for every internal <a href> click (which is what <Link>         */
/*  renders) we arm a short watchdog. If the URL hasn't moved to the target    */
/*  and no route loading skeleton appeared within a generous window, we fall   */
/*  back to a hard navigation — the same recovery the user would otherwise do  */
/*  by hand. Healthy navigations cancel the watchdog, so normal routing is     */
/*  never disturbed or raced.                                                  */
/* -------------------------------------------------------------------------- */

const INTERACTIVE_SELECTOR =
  "button, [role='button'], input, select, textarea, label, a";

export default function NavigationRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: number | null = null;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };

    const currentLocation = () =>
      window.location.pathname + window.location.search + window.location.hash;

    const onClick = (e: MouseEvent) => {
      // Only a plain left-click — match Link's own navigation rules.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const target = e.target as Element | null;
      const anchor = target?.closest?.("a[href]");
      if (!anchor) return;

      // The click landed on a nested control (heart button, select, …) — that
      // control owns the gesture and must never trigger recovery.
      const inner = target?.closest?.(INTERACTIVE_SELECTOR);
      if (inner && inner !== anchor) return;

      // Links inside modal/dialog layers are handled by their own close logic.
      if (anchor.closest("[role='dialog'], [aria-modal='true']")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      if (/^(mailto|tel|javascript|blob|data):/i.test(href)) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return; // already on this route (e.g. same-page hash link)
      }

      const startLocation = currentLocation();

      clearTimer();
      const targetUrl = url.pathname + url.search + url.hash;

      let stalled = 0;
      let loadingChecks = 0;

      const check = () => {
        // The router is alive whenever the URL moved at all — either it reached
        // the target or middleware redirected it (auth guards, etc.). In both
        // cases the watchdog has nothing to do.
        if (currentLocation() !== startLocation) {
          clearTimer();
          return;
        }

        // A route skeleton means the router IS working — give it more time
        // (but never wait forever on a genuinely hung request).
        const loadingUi = document.querySelector(
          ".tm-page-loading, [data-route-loading='true']",
        );
        if (loadingUi) {
          loadingChecks += 1;
          if (loadingChecks <= 6) {
            timer = window.setTimeout(check, 1500);
            return;
          }
        } else if (stalled < 2) {
          // No skeleton and no URL move yet — check once more before forcing.
          stalled += 1;
          timer = window.setTimeout(check, 1000);
          return;
        }

        // URL never moved and no transition started → router is wedged.
        clearTimer();
        console.warn(
          "[NavigationRecovery] Client navigation stalled — hard navigating to",
          targetUrl,
        );
        window.location.href = targetUrl;
      };

      // Give the router a beat to start, then begin polling.
      timer = window.setTimeout(check, 1200);
    };

    const onPopState = () => clearTimer();
    const onVisibility = () => {
      if (document.visibilityState === "visible") clearTimer();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearTimer();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
