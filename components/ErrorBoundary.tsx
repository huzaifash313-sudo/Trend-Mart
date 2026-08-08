"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { ErrorState } from "@/components/ErrorState";
import { logError } from "@/services/errorService";
import { captureException, getSentryDsn, getSentryEnvironment } from "@/lib/sentry";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback UI — receives the error message and a retry callback. */
  fallback?:
    | ReactNode
    | ((error: string, retry: () => void) => ReactNode);
  /** Called when an error is caught (e.g. for logging to an external service). */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Optional component name for better error grouping in logs. */
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  /** Incrementing key forces children to remount on retry. */
  retryKey: number;
  /** The full error object for rich context display. */
  errorStack?: string;
}

/* -------------------------------------------------------------------------- */
/*  Toast Helpers (imperative, no external dependency)                         */
/* -------------------------------------------------------------------------- */

function showErrorToast(message: string): void {
  try {
    window.dispatchEvent(
      new CustomEvent("trendmart:toast", {
        detail: {
          type: "error",
          message: message.length > 200 ? message.slice(0, 197) + "..." : message,
          duration: 8_000,
        },
      }),
    );
  } catch {
    // Silently fail — toast is non-critical
  }
}

/* -------------------------------------------------------------------------- */
/*  Sentry Integration Helpers                                                */
/* -------------------------------------------------------------------------- */

/**
 * Reports the caught error to Sentry with full context.
 * This is a best-effort operation — failures in Sentry reporting
 * must never cause the boundary itself to crash.
 */
function reportToSentry(
  error: Error,
  componentName: string,
  componentStack?: string,
): void {
  try {
    const dsn = getSentryDsn();
    if (!dsn) {
      // Sentry not configured — skip telemetry but still log locally
      console.info(
        "[ErrorBoundary] Sentry DSN not set — skipping remote telemetry.",
      );
      return;
    }

    captureException(error, {
      source: "ErrorBoundary",
      boundaryName: componentName,
      environment: getSentryEnvironment(),
      componentStack: componentStack ?? "(not available)",
      timestamp: new Date().toISOString(),
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    });
  } catch {
    // Silently ignore — Sentry reporting must never throw
    console.error("[ErrorBoundary] Failed to report error to Sentry.");
  }
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Global React Error Boundary with Sentry telemetry and retry support.
 *
 * Catches JavaScript errors anywhere in its child component tree,
 * logs those errors to the centralised error service, sends them to
 * Sentry for production monitoring, dispatches a toast notification,
 * and renders a user-friendly fallback UI instead of crashing the
 * entire application.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary name="DashboardPage">
 *   <DashboardContent />
 * </ErrorBoundary>
 * ```
 *
 * Critical paths wrapped by this boundary:
 * - Checkout flow (CheckoutModal)
 * - Store catalog (app/shop/[id])
 * - Merchant dashboard (app/dashboard)
 * - Search results (app/search)
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: "",
      retryKey: 0,
      errorStack: undefined,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const errorModule = this.props.name
      ? `ErrorBoundary.${this.props.name}`
      : "ErrorBoundary";

    // 1. Centralised error service (console + ring buffer)
    logError(error, {
      module: errorModule,
      meta: {
        componentStack: info.componentStack ?? undefined,
        boundaryName: this.props.name ?? "Unknown",
      },
    });

    // 2. Sentry telemetry (production exception tracking)
    reportToSentry(error, errorModule, info.componentStack ?? undefined);

    // 3. Fire-and-forget toast notification for user awareness
    showErrorToast(
      this.props.name
        ? `${this.props.name} encountered an error. Please try again.`
        : error.message || "An unexpected error occurred.",
    );

    // 4. Optional external callback (e.g. LogRocket, custom analytics)
    this.props.onError?.(error, info);
  }

  /** Reset the boundary and increment the key so children remount cleanly. */
  handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      errorMessage: "",
      errorStack: undefined,
      retryKey: prev.retryKey + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback (can be ReactNode or render function)
      if (this.props.fallback !== undefined) {
        if (typeof this.props.fallback === "function") {
          type FallbackFn = (error: string, retry: () => void) => ReactNode;
          const fallbackFn = this.props.fallback as FallbackFn;
          return fallbackFn(this.state.errorMessage, this.handleRetry);
        }
        return this.props.fallback;
      }

      // Default fallback — enhanced ErrorState with retry button and error details
      return (
        <ErrorState
          title={
            this.props.name
              ? `"${this.props.name}" encountered an error`
              : "Something went wrong"
          }
          message={
            this.props.name
              ? `The ${this.props.name} section failed to load. This might be a temporary issue — try again or contact support if the problem persists.`
              : this.state.errorMessage ||
                "An unexpected error occurred. Please try again."
          }
          onRetry={this.handleRetry}
          errorStack={this.state.errorStack}
        />
      );
    }

    // Key remounts children on retry for a clean slate
    return (
      <div key={this.state.retryKey} className="contents">
        {this.props.children}
      </div>
    );
  }
}

export default ErrorBoundary;