"use client";

import { useEffect, useState } from "react";
import {
  formatOfferRemaining,
  type ShopOfferSlide,
} from "@/lib/shopOfferTicker";

const ROTATE_MS = 3200;

interface ShopOfferTickerProps {
  slides: ShopOfferSlide[];
}

/**
 * Compact floating promo strip between shop name and category.
 * Rotates offer / free-delivery / coupon slides; shows a small timer when timed.
 */
export default function ShopOfferTicker({ slides }: ShopOfferTickerProps) {
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const active = slides.filter((s) => {
    if (!s.expiresAt) return true;
    return new Date(s.expiresAt).getTime() > now;
  });

  useEffect(() => {
    if (active.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % active.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active.length]);

  useEffect(() => {
    const needsTick = active.some((s) => s.expiresAt);
    if (!needsTick) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (index >= active.length) setIndex(0);
  }, [active.length, index]);

  if (active.length === 0) return null;

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
}
