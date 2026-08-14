"use client";

import { memo } from "react";
import {
  formatOfferRemaining,
  type ShopOfferSlide,
} from "@/lib/shopOfferTicker";
import { useOfferClock } from "@/lib/offerClock";

const ROTATE_MS = 3200;

interface ShopOfferTickerProps {
  slides: ShopOfferSlide[];
}

/**
 * Compact floating promo strip between shop name and category.
 * Rotation + countdown are driven by a single shared app-wide clock
 * (lib/offerClock.ts) — zero per-card intervals.
 *
 * Memoized: the only thing that changes is the shared clock tick, so re-render
 * work is minimal and unrelated parent re-renders never touch this subtree.
 */
const ShopOfferTicker = memo(function ShopOfferTicker({ slides }: ShopOfferTickerProps) {
  const now = useOfferClock();

  const active = slides.filter((s) => {
    if (!s.expiresAt) return true;
    return new Date(s.expiresAt).getTime() > now;
  });

  if (active.length === 0) return null;

  const index = active.length > 1 ? Math.floor(now / ROTATE_MS) % active.length : 0;
  const slide = active[Math.min(index, active.length - 1)]!;
  const timer = formatOfferRemaining(slide.expiresAt, now);

  const kindClass =
    slide.kind === "coupon"
      ? "tm-offer-ticker--coupon"
      : slide.kind === "free_delivery"
        ? "tm-offer-ticker--delivery"
        : "tm-offer-ticker--offer";

  return (
    <div
      className={`tm-offer-ticker ${kindClass}`}
      aria-live="polite"
      title={slide.label}
    >
      <span className="tm-offer-ticker__dot" aria-hidden="true" />
      <span key={slide.id} className="tm-offer-ticker__label">
        {slide.label}
      </span>
      {timer ? (
        <span className="tm-offer-ticker__timer" aria-label={`Ends in ${timer}`}>
          {timer}
        </span>
      ) : null}
      {active.length > 1 ? (
        <span className="tm-offer-ticker__dots" aria-hidden="true">
          {active.map((s, i) => (
            <span
              key={s.id}
              className={`tm-offer-ticker__pip${i === index ? " is-on" : ""}`}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
});

export default ShopOfferTicker;
