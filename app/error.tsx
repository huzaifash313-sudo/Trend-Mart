"use client";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Route-level error boundary                                    */
/*  Catches runtime errors in the app router segment and shows a branded,     */
/*  retryable fallback instead of a blank crash.                              */
/* -------------------------------------------------------------------------- */

import { useEffect } from "react";
import { ErrorState } from "@/components/ErrorState";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[TrendMart] Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl items-center justify-center px-4 py-10">
      <ErrorState
        title="Something went wrong"
        message="This page hit an unexpected error. Try again — it's usually temporary."
        onRetry={() => reset()}
      />
    </div>
  );
}
