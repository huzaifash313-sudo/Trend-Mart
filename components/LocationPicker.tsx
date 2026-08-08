"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "@/context/LocationContext";
import { SUPPORTED_CITIES, type SupportedCity } from "@/types";

/* -------------------------------------------------------------------------- */
/*  TrendMart — Precise Street‑Level Location Picker                            */
/*                                                                             */
/*  Features:                                                                   */
/*   - One‑tap GPS geolocation via navigator.geolocation API                   */
/*   - Reverse geocoding to resolve exact locality/street address              */
/*   - Displays resolved address (street, suburb, city) beside the pin         */
/*   - Manual city fallback with full dropdown                                  */
/*   - Quick‑select top cities chip bar                                       */
/*   - 'Use Live Location' toggle for returning users                          */
/*   - Smooth dropdown with outside‑click and Escape dismissal                 */
/*   - Graceful fallback when permissions denied — falls back to city select    */
/* -------------------------------------------------------------------------- */

/* ── Inline SVG Icons ──────────────────────────────────────────────────────── */

function LocateIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CrosshairIcon({ pulsing }: { pulsing?: boolean }) {
  return (
    <svg className={`h-4 w-4 ${pulsing ? "animate-pulse" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function MapPinHouseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10v11h6v-7h6v7h6V10L12 3z" />
      <line x1="8" y1="6" x2="16" y2="6" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function NavigationIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const TOP_CITIES: SupportedCity[] = ["Gujranwala", "Lahore", "Islamabad", "Faisalabad", "Karachi"];

/** Minimum time between refresh geolocation attempts to prevent spamming. */
const REFRESH_COOLDOWN_MS = 10_000;

/* ── Component ─────────────────────────────────────────────────────────────── */

export default function LocationPicker() {
  const { location, isDetecting, detectLocation, setManualCity, clearLocation } = useLocation();
  const [open, setOpen] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [lastRefreshTime, setLastRefreshTime] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // ── Close on Escape ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // ── GPS Detection Handler ───────────────────────────────────────────────────
  const handleDetect = useCallback(async () => {
    setDetectError(null);
    const result = await detectLocation();
    if (!result) {
      setDetectError("Location access denied or unavailable. Please select a city manually.");
    } else {
      setOpen(false);
    }
  }, [detectLocation]);

  // ── Refresh location (re-detect with cooldown) ──────────────────────────────
  const handleRefreshLocation = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshTime < REFRESH_COOLDOWN_MS) {
      setDetectError("Please wait a moment before refreshing your location.");
      return;
    }
    setLastRefreshTime(now);
    setDetectError(null);
    await detectLocation();
  }, [detectLocation, lastRefreshTime]);

  // ── Manual city selection ───────────────────────────────────────────────────
  const handleSelectCity = useCallback(
    (city: SupportedCity) => {
      setManualCity(city);
      setDetectError(null);
      setOpen(false);
    },
    [setManualCity],
  );

  // ── Clear location ──────────────────────────────────────────────────────────
  const handleClear = useCallback(() => {
    clearLocation();
    setOpen(false);
  }, [clearLocation]);

  const hasLocation = !!location;
  const isGps = hasLocation && location!.source === "gps";
  const displayLabel = location?.deliveryZone ?? location?.city;
  const displayAddress = location?.address ?? null;

  // ── Build trigger label with street address context ─────────────────────────
  const triggerLabel = hasLocation
    ? displayLabel ?? "Set"
    : "Set Location";

  return (
    <div className="relative" ref={panelRef}>
      {/* ── Trigger button ────────────────────────────────────────────────── */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 ${
          hasLocation
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "border-zinc-200 bg-white text-zinc-500 hover:border-emerald-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-500"
        }`}
        aria-label={hasLocation ? `Location: ${displayLabel ?? "Set"}${isGps ? " (GPS)" : ""}` : "Set your location"}
        aria-expanded={open}
      >
        {isGps ? <NavigationIcon /> : <LocateIcon />}
        <span className="max-w-[120px] truncate">{triggerLabel}</span>
        <ChevronDownIcon />
      </button>

      {/* ── Dropdown panel ────────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-2 w-[340px] max-w-[92vw] rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
              <MapPinHouseIcon /> Set Your Location
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Close"
            >
              <XIcon />
            </button>
          </div>

          {/* ── Current location status card ───────────────────────────────── */}
          {hasLocation && (
            <div className="mb-3 rounded-xl border border-emerald-200/60 bg-emerald-50 p-3 dark:border-emerald-700/30 dark:bg-emerald-900/20">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-lg dark:bg-emerald-900/40">
                  📍
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-emerald-800 dark:text-emerald-200">
                    {displayLabel ?? "Location Set"}
                  </p>
                  {/* Show street-level address when GPS */}
                  {isGps && displayAddress && (
                    <p className="mt-0.5 text-[0.65rem] leading-relaxed text-emerald-600 dark:text-emerald-400">
                      {displayAddress}
                    </p>
                  )}
                  <p className="mt-0.5 flex items-center gap-1 text-[0.6rem] text-emerald-500 dark:text-emerald-500">
                    {isGps ? (
                      <>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Live GPS location
                      </>
                    ) : location!.source === "manual" ? (
                      "Manually selected"
                    ) : (
                      "Restored from previous visit"
                    )}
                  </p>
                  {/* Refresh GPS + Clear buttons */}
                  <div className="mt-2 flex items-center gap-2">
                    {isGps && (
                      <button
                        type="button"
                        onClick={handleRefreshLocation}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-200/60 px-2.5 py-1 text-[0.6rem] font-semibold text-emerald-800 transition-colors hover:bg-emerald-200 dark:bg-emerald-800/40 dark:text-emerald-300 dark:hover:bg-emerald-700/60"
                        aria-label="Refresh GPS location"
                      >
                        <RefreshIcon /> Refresh
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleClear}
                      className="rounded-full px-2.5 py-1 text-[0.6rem] font-medium text-emerald-700 transition-colors hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                      aria-label="Clear location"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Detect My Location button ──────────────────────────────────── */}
          <div className="mb-3">
            <button
              type="button"
              onClick={handleDetect}
              disabled={isDetecting}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-all hover:border-emerald-400 hover:bg-emerald-50 active:scale-[0.98] disabled:opacity-50 disabled:cursor-wait dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:border-emerald-500"
            >
              {isDetecting ? (
                <>
                  <CrosshairIcon pulsing /> Detecting your precise location...
                </>
              ) : (
                <>
                  <CrosshairIcon /> {hasLocation ? "Update My Live Location" : "Detect My Exact Location"}
                </>
              )}
            </button>
            {detectError && (
              <p className="mt-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-[0.65rem] leading-relaxed text-red-600 dark:bg-red-900/20 dark:text-red-400">
                {detectError}
              </p>
            )}
            <p className="mt-1 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
              Uses browser GPS for accurate street‑level proximity matching.
            </p>
          </div>

          {/* ── Divider ────────────────────────────────────────────────────── */}
          <div className="mb-3 flex items-center gap-2">
            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
            <span className="text-[0.6rem] font-medium uppercase tracking-widest text-zinc-400 dark:text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
          </div>

          {/* ── Quick-pick top cities ──────────────────────────────────────── */}
          <div className="mb-3">
            <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              Quick Select a City
            </p>
            <div className="flex flex-wrap gap-1.5">
              {TOP_CITIES.map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => handleSelectCity(city)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 ${
                    location?.deliveryZone === city
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 hover:text-emerald-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          {/* ── Full city list dropdown ────────────────────────────────────── */}
          <div>
            <label
              htmlFor="location-city-select"
              className="mb-1.5 block text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
            >
              All Supported Cities
            </label>
            <div className="relative">
              <select
                id="location-city-select"
                value={location?.deliveryZone ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && SUPPORTED_CITIES.includes(val as SupportedCity)) {
                    handleSelectCity(val as SupportedCity);
                  }
                }}
                className="w-full appearance-none rounded-xl border border-zinc-200 bg-white px-3 py-2 pr-8 text-xs font-medium text-zinc-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="">— Select your city —</option>
                {SUPPORTED_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-zinc-400">
                <ChevronDownIcon />
              </div>
            </div>
            <p className="mt-1.5 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
              Shops are filtered and sorted by proximity to your location.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}