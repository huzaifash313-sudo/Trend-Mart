"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface FadeScrollXProps {
  children: ReactNode;
  /** Classes for the scrollable inner container (e.g. `tm-cat-scroll px-2`). */
  className?: string;
  /** Extra classes on the outer relative wrapper. */
  wrapperClassName?: string;
  /** CSS background color the edge fade blends into (matches strip surface). */
  fadeColor?: string;
  /** Fade overlay width in rem (default 1.5 = 24px). */
  fadeWidth?: number;
}

/**
 * Horizontally scrollable strip with conditional edge fades — a soft gradient
 * appears only while more content is available in that direction, so users can
 * tell a strip keeps going without a permanent mask sitting over the content.
 */
export default function FadeScrollX({
  children,
  className = "",
  wrapperClassName = "",
  fadeColor = "var(--tm-surface)",
  fadeWidth = 1.5,
}: FadeScrollXProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    el.addEventListener("scroll", update, { passive: true });
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [update]);

  const widthStyle = { width: `${fadeWidth}rem` };

  return (
    <div className={`relative ${wrapperClassName}`}>
      <div
        ref={ref}
        className={`overflow-x-auto overflow-y-hidden scrollbar-none ${className}`}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        style={{
          ...widthStyle,
          backgroundImage: `linear-gradient(to left, ${fadeColor}, transparent)`,
        }}
        className={`pointer-events-none absolute inset-y-0 right-0 z-10 transition-opacity duration-200 ${
          edges.right ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        aria-hidden="true"
        style={{
          ...widthStyle,
          backgroundImage: `linear-gradient(to right, ${fadeColor}, transparent)`,
        }}
        className={`pointer-events-none absolute inset-y-0 left-0 z-10 transition-opacity duration-200 ${
          edges.left ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
