"use client";

import { useEffect, useState } from "react";

/**
 * Reactive media-query hook.
 *
 * SSR-safe: defaults to `false` and resolves the real value after mount, so
 * it never produces a hydration mismatch. Used to switch between the desktop
 * persistent sidebar and the mobile slide-out drawer.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(query);
    setMatches(mql.matches);

    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
