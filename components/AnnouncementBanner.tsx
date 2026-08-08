"use client";

import { useState, useRef, useCallback } from "react";

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
  /** The announcement text to display. */
  text: string;
  /** Visual variant — marquee slides horizontally, alert is a static highlighted bar. */
  variant?: "marquee" | "alert";
  /** Accent color used for the border / highlight. Defaults to emerald. */
  accentColor?: string;
  /** Whether the banner can be dismissed by the user (stored in session). */
  dismissible?: boolean;
  /** Optional class name for the outer container. */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * AnnouncementBanner — A customizable merchant announcement banner.
 *
 * Supports two visual variants:
 * - `marquee`: A horizontally-scrolling ticker (using CSS animation).
 * - `alert`: A static highlighted bar with an icon and the message.
 *
 * If `dismissible` is true, the banner can be closed and won't reappear
 * for the remainder of the browser session.
 */
export default function AnnouncementBanner({
  text,
  variant = "marquee",
  accentColor = "#10b981",
  dismissible = false,
  className = "",
}: AnnouncementBannerProps) {
  // Session-level dismiss key — unique per text so a new announcement still shows
  const sessionKey = `announcement-dismissed:${text.slice(0, 40)}`;

  // Lazy initial state: check sessionStorage on first render (avoids cascading effect)
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

  // Don't render if no text or already dismissed
  if (!text || !text.trim() || dismissed) return null;

  // Shared base styling
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
        <span className="flex-1 truncate">{text}</span>
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

  // Marquee variant (default)
  return (
    <div
      className={`${baseClasses} bg-gradient-to-r from-emerald-50 via-white to-emerald-50 text-emerald-800 border-b border-emerald-200 dark:from-emerald-900/20 dark:via-zinc-900 dark:to-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 ${className}`}
      style={{ borderLeftColor: accentColor, borderLeftWidth: "3px" }}
      role="marquee"
      aria-live="off"
    >
      <MegaphoneIcon />
      <div className="relative flex-1 overflow-hidden" ref={marqueeRef}>
        <div className="animate-marquee whitespace-nowrap inline-block">
          <span className="inline-block pr-8">{text}</span>
          <span className="inline-block pr-8">{text}</span>
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