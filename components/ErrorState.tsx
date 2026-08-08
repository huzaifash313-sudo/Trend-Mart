"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Reusable Error State Component                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Inline SVG alert triangle icon (zero external dependencies)                */
/* -------------------------------------------------------------------------- */

function AlertTriangleIcon() {
  return (
    <svg
      className="h-12 w-12 text-red-400 dark:text-red-500"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Props                                                                     */
/* -------------------------------------------------------------------------- */

export interface ErrorStateProps {
  /** Short heading (e.g. "Something went wrong"). Defaults to a generic message. */
  title?: string;
  /** Detailed error description. */
  message?: string;
  /** If provided, a "Retry" button is rendered. */
  onRetry?: () => void;
  /** Optional error stack trace for debugging (collapsed by default). */
  errorStack?: string;
  /** Extra class names for the outer wrapper. */
  className?: string;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Clean, professional error state component.
 *
 * Use anywhere data fetching fails or an unexpected condition occurs.
 */
export function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  onRetry,
  errorStack,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
      role="alert"
    >
      <div className="mb-4">
        <AlertTriangleIcon />
      </div>

      <h3 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>

      <p className="mb-6 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {message}
      </p>

      {errorStack && (
        <details className="mb-4 w-full max-w-md text-left">
          <summary className="cursor-pointer text-xs font-medium text-zinc-400 hover:text-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-400">
            Technical details
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-zinc-100 p-3 text-[10px] leading-relaxed text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {errorStack}
          </pre>
        </details>
      )}

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-zinc-900"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export default ErrorState;