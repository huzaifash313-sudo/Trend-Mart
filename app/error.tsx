"use client";

import { useEffect, useRef } from "react";
import { ErrorState } from "@/components/ErrorState";
import { logError } from "@/services/errorService";

/**
 * Route-segment error boundary (App Router convention).
 *
 * Next.js automatically resets this boundary when the user navigates to a
 * different route, so a single broken page can never wedge every subsequent
 * client-side navigation until a hard refresh — the old "stuck until refresh"
 * symptom. The one-shot auto-retry below additionally lets transient failures
 * (network blips, race conditions) recover by themselves after ~2s.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const autoRetried = useRef(false);

  useEffect(() => {
    logError(error, {
      module: "app/error.tsx",
      meta: { digest: error.digest },
    });

    if (autoRetried.current) return;
    autoRetried.current = true;

    const t = window.setTimeout(() => reset(), 1800);
    return () => window.clearTimeout(t);
  }, [error, reset]);

  return (
    <ErrorState
      title="This page hit a snag"
      message="Something went wrong loading this page. Try again — or keep browsing, it won't block you."
      onRetry={reset}
      errorStack={error.stack}
    />
  );
}
