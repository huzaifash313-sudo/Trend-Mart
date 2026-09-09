"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts children only once the placeholder nears the viewport.
 * Keeps below-fold homepage rails (and similar blocks) out of the DOM
 * until the shopper scrolls near them — major win for mobile scroll FPS.
 */
export default function LazyMount({
  children,
  rootMargin = "700px 0px",
  /** Reserved height so the page doesn't jump when the block mounts. */
  minHeight = 72,
  /** First / above-fold slots should pass eager to skip the observer. */
  eager = false,
  className = "",
}: {
  children: ReactNode;
  rootMargin?: string;
  minHeight?: number;
  eager?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(eager);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, rootMargin]);

  return (
    <div
      ref={ref}
      className={className}
      style={mounted ? undefined : { minHeight }}
    >
      {mounted ? children : null}
    </div>
  );
}
