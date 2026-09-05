"use client";

import { useState, useRef, useCallback, useMemo } from "react";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                     */
/* -------------------------------------------------------------------------- */

function MegaphoneIcon() {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M2 12h4l6-4v8l-6-4H2z" />
      <path d="M20 6v12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface AnnouncementBannerProps {
  /** Single announcement text (legacy). Prefer `segments` for multi-promo strips. */
  text?: string;
  /**
   * Promo pieces shown in one strip with spacing between them
   * (e.g. free delivery · coupon · offer).
   */
  segments?: string[];
  /** Visual variant — marquee slides horizontally, alert is a static highlighted bar. */
  variant?: "marquee" | "alert";
  /** Accent color used for the border / highlight. Defaults to emerald. */
  accentColor?: string;
  /** Whether the banner can be dismissed by the user (stored in session). */
  dismissible?: boolean;
  /** Optional class name for the outer container. */
  className?: string;
}

function normalizeSegments(text?: string, segments?: string[]): string[] {
  const fromSegments = (segments ?? []).map((s) => s.trim()).filter(Boolean);
  if (fromSegments.length > 0) return fromSegments;
  const t = text?.trim();
  return t ? [t] : [];
}

function segmentKind(text: string): "coupon" | "delivery" | "discount" | "offer" {
  const t = text.toLowerCase();
  if (/\bcode\b|\bcoupon\b/.test(t)) return "coupon";
  if (/free delivery|delivery/.test(t)) return "delivery";
  if (/%|off|discount|rs\./i.test(t)) return "discount";
  return "offer";
}

function SegmentChip({ text }: { text: string }) {
  const kind = segmentKind(text);
  const styles =
    kind === "coupon"
      ? "bg-amber-400 text-amber-950 shadow-amber-500/30 dark:bg-amber-300 dark:shadow-amber-500/20"
      : kind === "delivery"
        ? "bg-white text-emerald-800 shadow-white/20 dark:bg-emerald-900/50 dark:text-emerald-200 dark:shadow-black/30 dark:ring-1 dark:ring-emerald-400/30"
        : kind === "discount"
          ? "bg-rose-500 text-white shadow-rose-500/30"
          : "bg-emerald-950/25 text-white ring-1 ring-white/25";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[0.72rem] font-bold uppercase tracking-wide shadow-sm ${styles}`}
    >
      {text}
    </span>
  );
}

function SegmentRow({ items }: { items: string[] }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="inline-flex items-center gap-2.5">
          {i > 0 ? (
            <span className="text-white/50" aria-hidden="true">
              •
            </span>
          ) : null}
          <SegmentChip text={item} />
        </span>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * AnnouncementBanner — merchant promo strip (offer / free delivery / coupon).
 * Marquee variant scrolls; multiple segments sit in one line with spacing.
 */
export default function AnnouncementBanner({
  text,
  segments,
  variant = "marquee",
  accentColor = "var(--tm-brand-500)",
  dismissible = false,
  className = "",
}: AnnouncementBannerProps) {
  const items = useMemo(() => normalizeSegments(text, segments), [text, segments]);
  const joinedKey = items.join("|");
  const sessionKey = `announcement-dismissed:${joinedKey.slice(0, 60)}`;

  const [dismissed, setDismissed] = useState(() => {
    if (!dismissible) return false;
    try {
      return sessionStorage.getItem(sessionKey) === "1";
    } catch {
      return false;
    }
  });
  const marqueeRef = useRef<HTMLDivElement>(null);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // silently ignore
    }
  }, [sessionKey]);

  if (items.length === 0 || dismissed) return null;

  const displayText = items.join(" · ");
  const baseClasses =
    "relative w-full overflow-hidden flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold";

  if (variant === "alert") {
    return (
      <div
        className={`${baseClasses} border-b border-amber-300 bg-gradient-to-r from-amber-100 via-amber-50 to-orange-100 text-amber-900 dark:border-amber-700 dark:from-amber-900/50 dark:via-amber-950/40 dark:to-orange-950/40 dark:text-amber-100 ${className}`}
        role="alert"
        style={{ borderLeftColor: accentColor, borderLeftWidth: "4px" }}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
          <MegaphoneIcon />
        </span>
        <span className="flex-1 truncate">{displayText}</span>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-auto shrink-0 rounded-full p-1 text-amber-700 hover:bg-amber-200 dark:text-amber-200 dark:hover:bg-amber-800/50 transition-colors"
            aria-label="Dismiss announcement"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} tm-promo-strip border-b border-emerald-400/40 text-white ${className}`}
      style={{ borderLeftColor: accentColor, borderLeftWidth: "4px" }}
      role="marquee"
      aria-live="off"
    >
      <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-white ring-2 ring-white/30">
        <MegaphoneIcon />
      </span>
      <div className="relative z-[1] flex-1 overflow-hidden" ref={marqueeRef}>
        <div className="animate-marquee inline-block whitespace-nowrap py-0.5">
          <span className="inline-block pr-16">
            <SegmentRow items={items} />
          </span>
          <span className="inline-block pr-16" aria-hidden="true">
            <SegmentRow items={items} />
          </span>
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="relative z-[1] ml-auto shrink-0 rounded-full p-1 text-white/80 hover:bg-white/15 transition-colors"
          aria-label="Dismiss announcement"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
