"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useLocation } from "@/context/LocationContext";
import {
  locationErrorMessage,
  CITY_CENTROIDS,
  type LocationDetectErrorCode,
} from "@/services/geoRadiusService";
import { SUPPORTED_CITIES, type SupportedCity } from "@/types";

const LocationMiniMap = dynamic(() => import("@/components/LocationMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-52 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 sm:h-64">
      Loading map…
    </div>
  ),
});

/* -------------------------------------------------------------------------- */
/*  Header location control — GPS + exact map pin (single place in the app)    */
/* -------------------------------------------------------------------------- */

function LocateIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
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

function XIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const TOP_CITIES: SupportedCity[] = ["Gujranwala", "Lahore", "Islamabad", "Faisalabad", "Karachi"];

function shortAreaLabel(address?: string | null, zone?: string | null, city?: string | null): string {
  if (address) {
    const first = address.split(",")[0]?.trim();
    if (first) return first;
  }
  return zone || city || "Set location";
}

export default function LocationPicker() {
  const {
    location,
    coordinates,
    isDetecting,
    detectLocationDetailed,
    setManualPin,
    setManualCity,
    clearLocation,
  } = useLocation();

  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [mapUpdating, setMapUpdating] = useState(false);
  const mapPickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const mapLat = coordinates?.latitude ?? CITY_CENTROIDS.Gujranwala?.lat ?? 32.1877;
  const mapLng = coordinates?.longitude ?? CITY_CENTROIDS.Gujranwala?.lng ?? 74.1945;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (mapPickTimer.current) clearTimeout(mapPickTimer.current);
    };
  }, []);

  const applyDetectResult = useCallback(async () => {
    setDetectError(null);
    const { location: detected, error } = await detectLocationDetailed();
    if (!detected) {
      const code = (error ?? "unavailable") as LocationDetectErrorCode;
      setDetectError(locationErrorMessage(code));
      return false;
    }
    return true;
  }, [detectLocationDetailed]);

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      setDetectError(null);
      if (mapPickTimer.current) clearTimeout(mapPickTimer.current);
      mapPickTimer.current = setTimeout(async () => {
        setMapUpdating(true);
        try {
          await setManualPin(lat, lng);
        } catch {
          setDetectError("Could not update pin address. Try again.");
        } finally {
          setMapUpdating(false);
        }
      }, 280);
    },
    [setManualPin],
  );

  const handleDetect = useCallback(async () => {
    await applyDetectResult();
  }, [applyDetectResult]);

  const handleSelectCity = useCallback(
    (city: SupportedCity) => {
      setManualCity(city);
      setDetectError(null);
    },
    [setManualCity],
  );

  const hasLocation = !!location;
  const displayAddress = location?.address ?? null;
  const displayLabel = shortAreaLabel(
    displayAddress,
    location?.deliveryZone,
    location?.city,
  );
  const triggerLabel = hasLocation ? displayLabel : "Set location";

  const panel = open && portalReady
    ? createPortal(
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-zinc-900/45 backdrop-blur-[2px]"
            aria-label="Close location picker"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tm-location-title"
            className="relative z-[1] flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:rounded-2xl"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 id="tm-location-title" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Your delivery location
                </h2>
                <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                  Tap the map or drag the pin to set your exact spot
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="icon-only inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <XIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {hasLocation && (
                <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800/50 dark:bg-emerald-950/40">
                  <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                    {displayLabel}
                  </p>
                  {displayAddress && displayAddress !== displayLabel && (
                    <p className="mt-0.5 text-[0.7rem] leading-snug text-emerald-700 dark:text-emerald-400">
                      {displayAddress}
                    </p>
                  )}
                </div>
              )}

              <div className="mb-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-400">
                    Map pin
                  </p>
                  {mapUpdating && (
                    <span className="text-[0.65rem] text-emerald-600 animate-pulse dark:text-emerald-400">
                      Updating address…
                    </span>
                  )}
                </div>
                <LocationMiniMap
                  latitude={mapLat}
                  longitude={mapLng}
                  onPick={handleMapPick}
                  heightClassName="h-52 sm:h-64"
                />
              </div>

              <button
                type="button"
                onClick={handleDetect}
                disabled={isDetecting}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isDetecting ? (
                  <>
                    <CrosshairIcon pulsing /> Detecting GPS…
                  </>
                ) : (
                  <>
                    <CrosshairIcon /> Use my current GPS
                  </>
                )}
              </button>

              {detectError && (
                <p className="mb-3 rounded-lg bg-red-50 px-2.5 py-2 text-[0.7rem] leading-relaxed text-red-600 dark:bg-red-950/40 dark:text-red-400">
                  {detectError}
                </p>
              )}

              <div className="mb-3 flex items-center gap-2">
                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
                <span className="text-[0.6rem] font-medium uppercase tracking-widest text-zinc-400">or pick a city</span>
                <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800" />
              </div>

              <div className="mb-3 flex flex-wrap gap-1.5">
                {TOP_CITIES.map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleSelectCity(city)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      location?.city === city || location?.deliveryZone === city
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>

              <label htmlFor="tm-location-city" className="sr-only">
                All cities
              </label>
              <select
                id="tm-location-city"
                value={location?.city ?? location?.deliveryZone ?? ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && SUPPORTED_CITIES.includes(val as SupportedCity)) {
                    handleSelectCity(val as SupportedCity);
                  }
                }}
                className="mb-3 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
              >
                <option value="">— All supported cities —</option>
                {SUPPORTED_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>

              {hasLocation && (
                <button
                  type="button"
                  onClick={() => {
                    clearLocation();
                  }}
                  className="w-full rounded-xl py-2 text-xs font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  Clear saved location
                </button>
              )}
            </div>

            <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 max-w-[9.5rem] items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 sm:max-w-[12rem] sm:px-3 ${
          hasLocation
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
            : "border-zinc-200 bg-white text-zinc-600 hover:border-emerald-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
        }`}
        aria-label={hasLocation ? `Location: ${displayLabel}. Tap to update on map` : "Set your location on the map"}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <LocateIcon />
        <span className="tm-title-ellipsis min-w-0 flex-1 text-left">{triggerLabel}</span>
        <ChevronDownIcon />
      </button>
      {panel}
    </>
  );
}
