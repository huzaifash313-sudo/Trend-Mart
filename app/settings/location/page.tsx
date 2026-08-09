"use client";

import Link from "next/link";
import LocationPicker from "@/components/LocationPicker";
import { useLocation } from "@/context/LocationContext";

function ChevronLeftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default function LocationSettingsPage() {
  const { location, isDetecting, detectLocation } = useLocation();

  const summary =
    location?.address ||
    location?.deliveryZone ||
    location?.city ||
    "Not set yet — GPS runs automatically on first visit";

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-[color:var(--tm-bg)]">
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur-md dark:border-[color:var(--tm-border)] dark:bg-[color:var(--tm-surface)]/95">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-3 py-3">
          <Link
            href="/settings"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-600 hover:bg-zinc-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
            aria-label="Go back"
          >
            <ChevronLeftIcon />
          </Link>
          <h1 className="text-sm font-bold text-zinc-900 dark:text-emerald-400">
            Location
          </h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-3 py-5">
        <section className="trend-card space-y-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-sm">
              <PinIcon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Delivery area
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                {summary}
              </p>
              {location?.city ? (
                <p className="mt-1 text-[0.7rem] font-medium text-teal-700 dark:text-teal-300">
                  City: {location.city}
                </p>
              ) : null}
            </div>
          </div>

          <p className="rounded-lg bg-teal-50/80 px-3 py-2 text-[0.7rem] leading-relaxed text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
            Location detects automatically in the background on first visit. Change it anytime here — it stays off the main header so the app stays clean.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <LocationPicker />
            <button
              type="button"
              onClick={() => void detectLocation()}
              disabled={isDetecting}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50 disabled:opacity-50 dark:border-teal-800 dark:bg-[color:var(--tm-elevated)] dark:text-teal-300 dark:hover:bg-teal-950/40"
            >
              {isDetecting ? "Detecting…" : "Use my GPS"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
