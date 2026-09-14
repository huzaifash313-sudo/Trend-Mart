"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getSafeImageUrl } from "@/services/storageService";

interface DualImageTiltProps {
  frontUrl: string;
  backUrl: string;
  alt: string;
  className?: string;
  /** Max tilt degrees */
  maxTilt?: number;
}

/**
 * Client-only dual-layer tilt — zero server work.
 * Dragging uses a ref (not React state) so the first move always tilts.
 */
export default function DualImageTilt({
  frontUrl,
  backUrl,
  alt,
  className = "",
  maxTilt = 12,
}: DualImageTiltProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const frontRef = useRef<HTMLDivElement | null>(null);
  const backRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const reset = useCallback(() => {
    draggingRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const front = frontRef.current;
    const back = backRef.current;
    if (front) {
      front.style.transition = "transform 0.35s ease";
      front.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(0)";
    }
    if (back) {
      back.style.transition = "transform 0.35s ease, opacity 0.35s ease";
      back.style.transform = "translate3d(0,0,0) scale(1.04)";
      back.style.opacity = "0.45";
    }
  }, []);

  const applyTilt = useCallback(
    (clientX: number, clientY: number) => {
      const root = rootRef.current;
      const front = frontRef.current;
      const back = backRef.current;
      if (!root || !front || !back || reducedMotion) return;

      const rect = root.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return;

      const nx = Math.max(-0.5, Math.min(0.5, (clientX - rect.left) / rect.width - 0.5));
      const ny = Math.max(-0.5, Math.min(0.5, (clientY - rect.top) / rect.height - 0.5));
      const rotY = nx * maxTilt * 2;
      const rotX = -ny * maxTilt * 2;
      const shiftX = nx * 16;
      const shiftY = ny * 16;

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        front.style.transition = "none";
        back.style.transition = "none";
        front.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(18px)`;
        back.style.transform = `translate3d(${(-shiftX).toFixed(1)}px, ${(-shiftY).toFixed(1)}px, 0) scale(1.08)`;
        back.style.opacity = "0.55";
      });
    },
    [maxTilt, reducedMotion],
  );

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  if (reducedMotion) {
    return (
      <div className={`relative overflow-hidden bg-zinc-100 dark:bg-zinc-900 ${className}`}>
        <Image
          src={getSafeImageUrl(frontUrl, "product")}
          alt={alt}
          fill
          className="object-contain"
          sizes="(max-width: 640px) 100vw, 32rem"
          unoptimized
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`relative select-none overflow-hidden bg-zinc-100 dark:bg-zinc-900 ${className}`}
      style={{ perspective: "900px", touchAction: "none" }}
      onPointerDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        try {
          rootRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        applyTilt(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        applyTilt(e.clientX, e.clientY);
      }}
      onPointerUp={reset}
      onPointerCancel={reset}
      role="img"
      aria-label={`${alt} — drag for a light 3D tilt`}
    >
      <div
        ref={backRef}
        className="pointer-events-none absolute inset-0"
        style={{
          transform: "translate3d(0,0,0) scale(1.04)",
          opacity: 0.45,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getSafeImageUrl(backUrl, "product")}
          alt=""
          className="h-full w-full object-cover blur-[1.5px]"
          draggable={false}
          aria-hidden
        />
      </div>

      <div
        ref={frontRef}
        className="pointer-events-none absolute inset-[6%] overflow-hidden rounded-xl"
        style={{
          transformStyle: "preserve-3d",
          transform: "rotateX(0deg) rotateY(0deg) translateZ(0)",
          boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getSafeImageUrl(frontUrl, "product")}
          alt={alt}
          className="h-full w-full object-contain bg-white/80 dark:bg-zinc-900/80"
          draggable={false}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent px-3 pb-3 pt-10">
        <p className="text-center text-[11px] font-semibold text-white">
          Finger / mouse se drag karo — halka 3D tilt
        </p>
      </div>
    </div>
  );
}
