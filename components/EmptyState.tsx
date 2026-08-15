"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Reusable Empty State Component                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Inline SVG package icon (zero external dependencies)                       */
/* -------------------------------------------------------------------------- */

function PackageIcon() {
  return (
    <svg
      className="h-14 w-14 text-zinc-300 dark:text-zinc-600"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16.5 9.4 7.55 4.24" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.29 7 12 12 20.71 7" />
      <line x1="12" y1="22" x2="12" y2="12" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  /** Primary message (e.g. "No shops yet"). */
  title: string;
  /** Optional secondary description. */
  description?: string;
  /** Optional label and handler for a CTA button. */
  action?: { label: string; onPress: () => void };
  /** Extra class names for the outer wrapper. */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Professional empty state placeholder.
 *
 * Use when a list or grid has zero items to display.
 */
export function EmptyState({
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-20 text-center ${className}`}
    >
      <div className="mb-5">
        <PackageIcon />
      </div>

      <h3 className="mb-1.5 text-base font-semibold text-zinc-800 dark:text-zinc-200">
        {title}
      </h3>

      {description && (
        <p className="mb-6 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      )}

      {action && (
        <button
          type="button"
          onClick={action.onPress}
          className="tm-btn-primary inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;