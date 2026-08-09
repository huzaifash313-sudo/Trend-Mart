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

function SegmentRow({ items }: { items: string[] }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="inline-flex items-center">
          {i > 0 ? (
            <span className="mx-3 inline-block text-emerald-400/70 dark:text-emerald-500/60" aria-hidden="true">
              ·
            </span>
          ) : null}
          <span>{item}</span>
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
  accentColor = "#10b981",
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
    "relative w-full overflow-hidden flex items-center gap-2 px-4 py-2.5 text-sm font-medium";

  if (variant === "alert") {
    return (
      <div
        className={`${baseClasses} bg-amber-50 text-amber-800 border-b border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800 ${className}`}
        role="alert"
        style={{ borderLeftColor: accentColor, borderLeftWidth: "3px" }}
      >
        <MegaphoneIcon />
        <span className="flex-1 truncate">{displayText}</span>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="ml-auto shrink-0 rounded-full p-1 text-amber-500 hover:bg-amber-200 dark:hover:bg-amber-800/50 transition-colors"
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
      className={`${baseClasses} bg-gradient-to-r from-emerald-50 via-white to-emerald-50 text-emerald-800 border-b border-emerald-200 dark:from-emerald-900/20 dark:via-zinc-900 dark:to-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 ${className}`}
      style={{ borderLeftColor: accentColor, borderLeftWidth: "3px" }}
      role="marquee"
      aria-live="off"
    >
      <MegaphoneIcon />
      <div className="relative flex-1 overflow-hidden" ref={marqueeRef}>
        <div className="animate-marquee inline-block whitespace-nowrap">
          <span className="inline-block pr-12">
            <SegmentRow items={items} />
          </span>
          <span className="inline-block pr-12" aria-hidden="true">
            <SegmentRow items={items} />
          </span>
        </div>
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          className="ml-auto shrink-0 rounded-full p-1 text-emerald-500 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 transition-colors"
          aria-label="Dismiss announcement"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
