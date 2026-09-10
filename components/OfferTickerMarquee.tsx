"use client";

import { useEffect, useRef, useState } from "react";
import { observeInView } from "@/lib/inViewObserver";

/** Dark continuous ticker over product / deal image. Pauses when off-screen. */
export function OfferTickerMarquee({ tags }: { tags: string[] }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(true);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return observeInView(el, setActive);
  }, []);

  if (tags.length === 0) return null;

  const unique = tags.filter((t, i) => tags.indexOf(t) === i);
  const sequence = unique.length === 1 ? [unique[0], unique[0], unique[0]] : unique;
  const track = [...sequence, ...sequence];
  const durationSec = Math.max(12, Math.min(36, track.length * 3.5));

  return (
    <div
      ref={rootRef}
      className="tm-product-offer-strip"
      aria-label={unique.join(", ")}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="tm-product-offer-track"
        style={{
          animationDuration: `${durationSec}s`,
          animationPlayState: active ? "running" : "paused",
        }}
      >
        {track.map((tag, i) => (
          <span key={`${tag}-${i}`} className="tm-product-offer-chip">
            <span className="tm-product-offer-dot" aria-hidden="true" />
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
