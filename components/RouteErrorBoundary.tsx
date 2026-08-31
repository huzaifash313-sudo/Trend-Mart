"use client";

/* -------------------------------------------------------------------------- */
/*  TrendsMart — Route-scoped Error Boundary                                    */
/*                                                                             */
/*  The plain <ErrorBoundary> is a class component: once a child throws it     */
/*  stays in its error state until the user manually retries or hard-refreshes.*/
/*  When it wraps the main content slot in the root layout, a single error on  */
/*  one route left EVERY subsequent client navigation stuck on the error UI —  */
/*  the "har navigation pe tootta hai, refresh ke baad theek" symptom.         */
/*                                                                             */
/*  Keying the boundary by pathname makes React mount a fresh boundary for     */
/*  each route, so navigating away from a broken page automatically clears     */
/*  the error. The keyed remount also gives us a natural, cheap place to fade  */
/*  the incoming route in for smoother transitions.                            */
/* -------------------------------------------------------------------------- */

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export default function RouteErrorBoundary({
  name,
  autoResetMs,
  children,
}: {
  name?: string;
  /** Auto-retry once after this many ms so transient errors self-heal. */
  autoResetMs?: number;
  children: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <ErrorBoundary key={pathname ?? "root"} name={name} autoResetMs={autoResetMs}>
      {children}
    </ErrorBoundary>
  );
}
