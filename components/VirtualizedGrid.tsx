"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { VIRTUALIZE_AFTER } from "@/lib/mobilePerf";

function useGridColumnCount(breakpoints: {
  sm?: number;
  md?: number;
  lg?: number;
  xl?: number;
  base: number;
}): number {
  const { base, sm = base, md = sm, lg = md, xl = lg } = breakpoints;
  const [cols, setCols] = useState(base);

  useEffect(() => {
    const read = () => {
      const w = window.innerWidth;
      if (w >= 1280) setCols(xl);
      else if (w >= 1024) setCols(lg);
      else if (w >= 768) setCols(md);
      else if (w >= 640) setCols(sm);
      else setCols(base);
    };
    read();
    window.addEventListener("resize", read, { passive: true });
    return () => window.removeEventListener("resize", read);
  }, [base, sm, md, lg, xl]);

  return cols;
}

export interface VirtualizedGridProps<T> {
  items: T[];
  /** Unique key per item */
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Tailwind grid class for the inner row (e.g. grid-cols-2 ...) — unused when virtual; cols drive layout */
  columnBreakpoints?: {
    base: number;
    sm?: number;
    md?: number;
    lg?: number;
    xl?: number;
  };
  /** Estimated card row height in px (including gap). */
  estimateRowHeight?: number;
  gapClassName?: string;
  className?: string;
  /** Force-enable even below VIRTUALIZE_AFTER */
  force?: boolean;
  overscan?: number;
}

/**
 * Window-scrolled CSS-grid virtualizer for shop/product catalogs.
 * Keeps ~1–2 screens of DOM nodes so Android/iPhone scroll stays smooth
 * with large catalogs (Daraz-style windowing).
 */
export default function VirtualizedGrid<T>({
  items,
  getKey,
  renderItem,
  columnBreakpoints = { base: 2, md: 3, lg: 4, xl: 5 },
  estimateRowHeight = 280,
  gapClassName = "gap-2.5 sm:gap-3",
  className = "",
  force = false,
  overscan = 2,
}: VirtualizedGridProps<T>) {
  const colCount = useGridColumnCount(columnBreakpoints);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const measureMargin = useCallback(() => {
    if (!listRef.current) return;
    setScrollMargin(listRef.current.offsetTop);
  }, []);

  useEffect(() => {
    measureMargin();
    window.addEventListener("resize", measureMargin, { passive: true });
    return () => window.removeEventListener("resize", measureMargin);
  }, [measureMargin, items.length, colCount]);

  const rowCount = Math.max(1, Math.ceil(items.length / Math.max(1, colCount)));
  const shouldVirtualize = force || items.length > VIRTUALIZE_AFTER;

  const rowVirtualizer = useWindowVirtualizer({
    count: shouldVirtualize ? rowCount : 0,
    estimateSize: () => estimateRowHeight,
    overscan,
    scrollMargin,
  });

  if (!shouldVirtualize) {
    return (
      <div
        ref={listRef}
        className={`grid ${gapClassName} ${className}`}
        style={
          {
            gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
          } as CSSProperties
        }
      >
        {items.map((item, index) => (
          <div key={getKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const virtualRows = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={listRef}
      className={className}
      style={{
        height: `${rowVirtualizer.getTotalSize()}px`,
        width: "100%",
        position: "relative",
      }}
    >
      {virtualRows.map((virtualRow) => {
        const start = virtualRow.index * colCount;
        const rowItems = items.slice(start, start + colCount);
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={rowVirtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            }}
          >
            <div
              className={`grid ${gapClassName}`}
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              }}
            >
              {rowItems.map((item, i) => {
                const index = start + i;
                return (
                  <div key={getKey(item, index)}>{renderItem(item, index)}</div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
