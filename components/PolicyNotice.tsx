"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getLegalAcceptances,
  recordLegalAcceptance,
  type LegalDocument,
} from "@/services/legalService";
import {
  LEGAL_HREFS,
  LEGAL_LABELS,
  LEGAL_VERSIONS,
  isVersionBehind,
} from "@/lib/legalVersions";
import { withTimeout } from "@/lib/withTimeout";

/** Give up on the audit-trail network call after this long (8s). */
const AUDIT_FETCH_TIMEOUT_MS = 8_000;
/** Fire-and-forget acceptance write deadline (10s). */
const AUDIT_WRITE_TIMEOUT_MS = 10_000;

/* -------------------------------------------------------------------------- */
/*  TrendMart — Versioned Policy-Update Notice                                 */
/*                                                                             */
/*  When Terms / Privacy / Merchant Guidelines change (their version in       */
/*  `lib/legalVersions.ts` is bumped), logged-in users who accepted an older  */
/*  version see this full-screen notice once so they can re-accept. It never  */
/*  overlaps the brand splash or the onboarding flow.                         */
/* -------------------------------------------------------------------------- */

const SEEN_PREFIX = "tm_legal_seen_v1";

/** Routes where the notice must never appear (they are the notice context). */
const BLOCKED_PATHS = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/admin",
  "/legal",
  "/support",
  "/account/become-merchant",
  "/account/complete-profile",
] as const;

function isBlockedPath(pathname: string): boolean {
  return BLOCKED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function waitForOverlaysToClear(): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tryCheck = () => {
      const splashLocked =
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("tm-splash-lock");
      const onboardingOpen =
        typeof document !== "undefined" &&
        Boolean(document.querySelector(".tm-onboarding-layer"));
      if ((!splashLocked && !onboardingOpen) || Date.now() - start > 5000) {
        resolve();
      } else {
        window.setTimeout(tryCheck, 250);
      }
    };
    window.setTimeout(tryCheck, 400);
  });
}

export default function PolicyNotice() {
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<LegalDocument[]>([]);
  const [accepting, setAccepting] = useState(false);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isBlockedPath(pathname)) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;
      userIdRef.current = user.id;

      // Compute which documents are out of date.
      const outOfDate: LegalDocument[] = [];
      for (const doc of Object.keys(LEGAL_VERSIONS) as LegalDocument[]) {
        const current = LEGAL_VERSIONS[doc];
        const seenKey = `${SEEN_PREFIX}:${user.id}:${doc}`;
        try {
          if (localStorage.getItem(seenKey) === current) continue;
        } catch {
          /* ignore */
        }
        outOfDate.push(doc);
      }
      if (outOfDate.length === 0 || cancelled) return;

      // Cross-check against the audit trail in the DB. Timed out so a hung
      // Supabase request (blocked network / ad-blocker) can never stall the
      // effect forever — an empty trail simply re-prompts the notice.
      const accepted = await withTimeout(
        getLegalAcceptances(user.id),
        AUDIT_FETCH_TIMEOUT_MS,
        () => [],
      );
      if (cancelled) return;
      const acceptedMap = new Map(
        accepted.map((row) => [row.document, row.version]),
      );
      const trulyOutOfDate = outOfDate.filter((doc) =>
        isVersionBehind(acceptedMap.get(doc), LEGAL_VERSIONS[doc]),
      );
      if (trulyOutOfDate.length === 0 || cancelled) return;

      // Never overlap the splash / onboarding.
      await waitForOverlaysToClear();
      if (cancelled) return;
      setPendingDocs(trulyOutOfDate);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, pathname]);

  const handleAccept = async () => {
    const userId = userIdRef.current;
    if (!userId || pendingDocs.length === 0) return;
    setAccepting(true);
    try {
      // Mark this device as seen FIRST so the notice can never re-show on
      // this browser — even if the audit write below is slow or never lands.
      for (const doc of pendingDocs) {
        try {
          localStorage.setItem(
            `${SEEN_PREFIX}:${userId}:${doc}`,
            LEGAL_VERSIONS[doc],
          );
        } catch {
          /* ignore */
        }
      }

      // Dismiss immediately — the user must never be trapped on the notice.
      // The audit write is best-effort and runs in the background behind a
      // timeout: if the audit table is missing, RLS blocks it, or Supabase
      // simply hangs (blocked network), the notice still goes away. A
      // late-resolving write is discarded; a late rejection is swallowed.
      setOpen(false);
      for (const doc of pendingDocs) {
        // `recordLegalAcceptance` never throws, but guard anyway so a future
        // refactor can't leak an unhandled rejection to the console.
        void withTimeout(
          recordLegalAcceptance(userId, [doc], LEGAL_VERSIONS[doc]),
          AUDIT_WRITE_TIMEOUT_MS,
          () => false,
        ).catch(() => false);
      }
    } finally {
      setAccepting(false);
    }
  };

  if (!open || pendingDocs.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[8990] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Updated policies"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200/70 bg-white shadow-2xl dark:border-zinc-700/50 dark:bg-zinc-900">
        {/* Top accent */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

        <div className="px-7 pb-7 pt-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-600/25">
            <svg
              className="h-8 w-8 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6M8 4h8l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h3z"
              />
              <path strokeLinecap="round" d="M8 4v4h4" />
            </svg>
          </div>

          <h2 className="mt-5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Our policies have been updated
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Please review the updated documents below. By continuing to use
            TrendMart, you agree to the revised policies.
          </p>

          <div className="mt-5 space-y-2 text-left">
            {pendingDocs.map((doc) => (
              <Link
                key={doc}
                href={LEGAL_HREFS[doc]}
                target="_blank"
                className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-800 transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
              >
                <span>{LEGAL_LABELS[doc]}</span>
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Updated ↗
                </span>
              </Link>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="mt-6 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {accepting ? "Accepting…" : "I agree to the updated policies"}
          </button>
          <p className="mt-3 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
            You can review these documents any time from the Legal & Support
            pages.
          </p>
        </div>
      </div>
    </div>
  );
}
