"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useLocation } from "@/context/LocationContext";
import {
  locationErrorMessage,
  CITY_CENTROIDS,
  requestUserLocationDetailed,
  type LocationDetectErrorCode,
} from "@/services/geoRadiusService";
import { SUPPORTED_CITIES, type SupportedCity } from "@/types";

const LocationMiniMap = dynamic(() => import("@/components/LocationMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-sm text-zinc-500 dark:bg-zinc-800">
      Loading map…
    </div>
  ),
});

/* -------------------------------------------------------------------------- */
/*  Daraz-style full-screen map location picker (header entry point)           */
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
    <svg className={`h-5 w-5 ${pulsing ? "animate-pulse" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
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
  } = useLocation();

  const [open, setOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [mapUpdating, setMapUpdating] = useState(false);
  const [showCities, setShowCities] = useState(false);
  const [gpsFix, setGpsFix] = useState<{
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null>(null);
  const mapPickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGpsTried = useRef(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const mapLat = coordinates?.latitude ?? CITY_CENTROIDS.Gujranwala?.lat ?? 32.1877;
  const mapLng = coordinates?.longitude ?? CITY_CENTROIDS.Gujranwala?.lng ?? 74.1945;

  useEffect(() => {
    if (!open) {
      autoGpsTried.current = false;
      return;
    }
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
    const result = await detectLocationDetailed();
    if (!result.location?.coordinates) {
      const code = (result.error ?? "unavailable") as LocationDetectErrorCode;
      setDetectError(locationErrorMessage(code));
      return false;
    }
    const c = result.location.coordinates;
    setGpsFix({
      latitude: c.latitude,
      longitude: c.longitude,
      accuracyMeters: c.accuracyMeters ?? null,
    });
    return true;
  }, [detectLocationDetailed]);

  // Show live GPS blue-dot when map opens (does not move the delivery pin)
  useEffect(() => {
    if (!open || autoGpsTried.current) return;
    autoGpsTried.current = true;

    let cancelled = false;
    void (async () => {
      const result = await requestUserLocationDetailed({
        enableHighAccuracy: true,
        timeout: 12_000,
        maximumAge: 20_000,
      });
      if (cancelled || !result.coordinates) return;
      setGpsFix({
        latitude: result.coordinates.latitude,
        longitude: result.coordinates.longitude,
        accuracyMeters: result.accuracyMeters ?? result.coordinates.accuracyMeters ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleMapPick = useCallback(
    (lat: number, lng: number) => {
      setDetectError(null);
      if (mapPickTimer.current) clearTimeout(mapPickTimer.current);
      mapPickTimer.current = setTimeout(async () => {
        setMapUpdating(true);
        try {
          await setManualPin(lat, lng);
        } catch {
          setDetectError("Could not update address for this pin. Try again.");
        } finally {
          setMapUpdating(false);
        }
      }, 320);
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
      setShowCities(false);
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
  const accuracyLabel =
    gpsFix?.accuracyMeters != null && gpsFix.accuracyMeters > 0
      ? `GPS accuracy ±${Math.round(gpsFix.accuracyMeters)} m`
      : null;

  const panel =
    open && portalReady
      ? createPortal(
          <div
            className="fixed inset-0 z-[80] flex flex-col bg-zinc-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tm-location-title"
          >
            {/* Full-bleed map */}
            <div className="relative min-h-0 flex-1">
              <LocationMiniMap
                mode="fullscreen"
                latitude={mapLat}
                longitude={mapLng}
                onPick={handleMapPick}
                gpsFix={gpsFix}
                resizeKey={open}
              />

              {/* Top bar */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-black/45 to-transparent px-3 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="icon-only inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-800 shadow-md dark:bg-zinc-900 dark:text-zinc-100"
                    aria-label="Close map"
                  >
                    <XIcon />
                  </button>
                  <div className="min-w-0 flex-1 rounded-2xl bg-white/95 px-3 py-2 shadow-md backdrop-blur dark:bg-zinc-900/95">
                    <h2
                      id="tm-location-title"
                      className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
                    >
                      Select delivery location
                    </h2>
                    <p className="text-[0.7rem] text-zinc-500 dark:text-zinc-400">
                      Move the map — pin stays in the center
                    </p>
                  </div>
                </div>
              </div>

              {/* Recenter to GPS */}
              <button
                type="button"
                onClick={handleDetect}
                disabled={isDetecting}
                className="absolute bottom-[13.5rem] right-3 z-[500] inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-emerald-700 shadow-lg ring-1 ring-zinc-200 disabled:opacity-60 dark:bg-zinc-900 dark:text-emerald-400 dark:ring-zinc-700 sm:bottom-[14.5rem]"
                aria-label="Go to my current GPS location"
                title="Current location"
              >
                <CrosshairIcon pulsing={isDetecting} />
              </button>
            </div>

            {/* Bottom address sheet */}
            <div className="z-[500] shrink-0 rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(0,0,0,.18)] dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200 dark:bg-zinc-700" />

              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 text-xl" aria-hidden="true">
                  📍
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {hasLocation ? displayLabel : "Finding your spot…"}
                  </p>
                  <p className="mt-0.5 text-[0.75rem] leading-snug text-zinc-500 dark:text-zinc-400">
                    {mapUpdating
                      ? "Updating address…"
                      : displayAddress ||
                        (isDetecting
                          ? "Reading GPS & nearest road…"
                          : "Pan the map to your street / house")}
                  </p>
                  {accuracyLabel && !mapUpdating && (
                    <p className="mt-1 text-[0.65rem] font-medium text-blue-600 dark:text-blue-400">
                      ● {accuracyLabel}
                      <span className="ml-1 font-normal text-zinc-400">
                        (blue circle = where GPS sees you)
                      </span>
                    </p>
                  )}
                  {detectError && (
                    <p className="mt-1.5 text-[0.7rem] leading-snug text-red-600 dark:text-red-400">
                      {detectError}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={handleDetect}
                disabled={isDetecting}
                className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                {isDetecting ? (
                  <>
                    <CrosshairIcon pulsing /> Getting exact GPS…
                  </>
                ) : (
                  <>
                    <CrosshairIcon /> Use my current location
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={!hasLocation && !coordinates}
                className="mb-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm this location
              </button>

              <button
                type="button"
                onClick={() => setShowCities((v) => !v)}
                className="w-full py-1.5 text-center text-[0.7rem] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
              >
                {showCities ? "Hide cities" : "Or choose a city instead"}
              </button>

              {showCities && (
                <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  <div className="flex flex-wrap gap-1.5">
                    {TOP_CITIES.map((city) => (
                      <button
                        key={city}
                        type="button"
                        onClick={() => handleSelectCity(city)}
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          location?.city === city || location?.deliveryZone === city
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                  <select
                    value={location?.city ?? location?.deliveryZone ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val && SUPPORTED_CITIES.includes(val as SupportedCity)) {
                        handleSelectCity(val as SupportedCity);
                      }
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    <option value="">— All cities —</option>
                    {SUPPORTED_CITIES.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
        aria-label={
          hasLocation
            ? `Location: ${displayLabel}. Open full map`
            : "Open full map to set location"
        }
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
