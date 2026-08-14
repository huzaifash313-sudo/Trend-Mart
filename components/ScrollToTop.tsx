"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* -------------------------------------------------------------------------- */
/*  Smart scroll handling                                                      */
/*                                                                             */
/*  Goals (all three at once):                                                 */
/*   1. New navigation (category/search/sort/sub) → jump to top.               */
/*   2. Opening/closing the QuickView modal only changes `?product=id` in the  */
/*      URL — that must NOT reset scroll (the modal overlays the same list).   */
/*   3. Back/forward (e.g. /products → /shop/[id] → back) → restore the exact  */
/*      scroll position the customer was at, so thousands of scrolled items    */
/*      don't lose their place.                                                */
/* -------------------------------------------------------------------------- */

const SCROLL_KEY = "tm_scroll_v1";

function readMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, number>): void {
  try {
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Strip the ephemeral `product` param — it's only a deep-link for the modal. */
function contentSignature(pathname: string, search: string): string {
  const sp = new URLSearchParams(search);
  sp.delete("product");
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function ScrollToTop() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";

  // Set on browser back/forward so we can restore instead of jumping to top.
  const wasPop = useRef(false);
  const prevContentSig = useRef<string | null>(null);

  // 1. Detect back/forward navigation (popstate fires before React re-renders).
  useLayoutEffect(() => {
    const onPop = () => {
      wasPop.current = true;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // 2. Continuously remember the scroll position (rAF-throttled) so a back
  //    navigation can restore it. Keyed by path + full search (incl. product),
  //    so modal-open and modal-closed states both keep their own position.
  useLayoutEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const map = readMap();
        map[`${window.location.pathname}${window.location.search}`] =
          window.scrollY || document.documentElement.scrollTop || 0;
        saveMap(map);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 3. Decide: restore, skip (modal), or jump to top.
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;

    const sig = contentSignature(pathname, search);

    // Back/forward → restore the saved position for this exact route.
    if (wasPop.current) {
      wasPop.current = false;
      prevContentSig.current = sig;
      const y = readMap()[`${pathname}${search ? `?${search}` : ""}`] ?? 0;
      if (y > 0) {
        // Instant restore — never animate (global smooth-scroll would slide
        // the list back down from the top, which looks like a bug).
        window.scrollTo({ top: y, behavior: "instant" });
        document.documentElement.scrollTop = y;
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    // First mount: browser already starts at top.
    if (prevContentSig.current === null) {
      prevContentSig.current = sig;
      return;
    }

    // Only the modal deep-link changed (product param) → preserve scroll.
    if (prevContentSig.current === sig) {
      return;
    }

    // Genuine content change → jump to top (instant).
    prevContentSig.current = sig;
    window.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, search]);

  return null;
}
