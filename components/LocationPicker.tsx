"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useLocation } from "@/context/LocationContext";
import {
  locationErrorMessage,
  CITY_CENTROIDS,
  requestUserLocationDetailed,
  searchPlaces,
  type LocationDetectErrorCode,
  type PlaceSearchResult,
} from "@/services/geoRadiusService";
import { SUPPORTED_CITIES, type SupportedCity } from "@/types";
import { getCityAreas } from "@/lib/cityAreas";
import CustomSelect from "@/components/CustomSelect";

const LocationMiniMap = dynamic(() => import("@/components/LocationMiniMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-zinc-200 text-sm text-zinc-500 dark:bg-zinc-800">
      Loading map…
    </div>
  ),
});

/* -------------------------------------------------------------------------- */
/*  Full-screen map + area search (Settings → Location; auto GPS elsewhere)    */
/* -------------------------------------------------------------------------- */

function LocateIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
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
    setManualArea,
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
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<PlaceSearchResult[]>([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);
  const mapPickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGpsTried = useRef(false);
  const placeAbortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

   
  useEffect(() => {
    setPortalReady(true);
  }, []);

  const mapLat = coordinates?.latitude ?? CITY_CENTROIDS.Gujranwala?.lat ?? 32.1877;
  const mapLng = coordinates?.longitude ?? CITY_CENTROIDS.Gujranwala?.lng ?? 74.1945;

  useEffect(() => {
    if (!open) {
      autoGpsTried.current = false;
      setPlaceQuery("");
      setPlaceResults([]);
      setPlaceSearchError(null);
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (placeResults.length > 0 || placeQuery) {
          setPlaceQuery("");
          setPlaceResults([]);
          return;
        }
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, placeQuery, placeResults.length]);

  useEffect(() => {
    return () => {
      if (mapPickTimer.current) clearTimeout(mapPickTimer.current);
      placeAbortRef.current?.abort();
    };
  }, []);

  // Debounced area / landmark search (Pakistan)
  useEffect(() => {
    if (!open) return;
    const q = placeQuery.trim();
    if (q.length < 2) {
      setPlaceResults([]);
      setPlaceSearching(false);
      setPlaceSearchError(null);
      placeAbortRef.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      placeAbortRef.current?.abort();
      const controller = new AbortController();
      placeAbortRef.current = controller;
      setPlaceSearching(true);
      setPlaceSearchError(null);
      try {
        const results = await searchPlaces(q, {
          limit: 8,
          signal: controller.signal,
          latitude: mapLat,
          longitude: mapLng,
        });
        if (!controller.signal.aborted) {
          setPlaceResults(results);
          if (results.length === 0) {
            setPlaceSearchError(
              "No places found — try full name + city (e.g. Heaven Science Academy Gujranwala)",
            );
          }
        }
      } catch {
        if (!controller.signal.aborted) {
          setPlaceResults([]);
          setPlaceSearchError("Search failed. Check connection and try again.");
        }
      } finally {
        if (!controller.signal.aborted) setPlaceSearching(false);
      }
    }, 380);

    return () => window.clearTimeout(timer);
  }, [placeQuery, open, mapLat, mapLng]);

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
    // Location found — close the picker right away (no extra tap needed).
    setOpen(false);
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

  const handleSelectPlace = useCallback(
    async (place: PlaceSearchResult) => {
      setPlaceQuery(place.label);
      setPlaceResults([]);
      setPlaceSearchError(null);
      setDetectError(null);
      setMapUpdating(true);
      try {
        await setManualPin(place.latitude, place.longitude);
        searchInputRef.current?.blur();
        // Exact area picked — close the picker so the shop list refreshes.
        setOpen(false);
      } catch {
        setDetectError("Could not open that place on the map. Try again.");
      } finally {
        setMapUpdating(false);
      }
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
      if (getCityAreas(city).length > 0) {
        // Keep the sheet open so the user can pick an exact area (colony).
        setShowCities(true);
      } else {
        // No curated areas — the city pick itself is final.
        setShowCities(false);
        setOpen(false);
      }
    },
    [setManualCity],
  );

  const handleSelectArea = useCallback(
    (city: SupportedCity, areaName: string) => {
      setManualArea(city, areaName);
      setDetectError(null);
      // Area picked — close the picker immediately.
      setOpen(false);
    },
    [setManualArea],
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
            <div className="relative min-h-0 flex-1">
              <LocationMiniMap
                mode="fullscreen"
                latitude={mapLat}
                longitude={mapLng}
                onPick={handleMapPick}
                gpsFix={gpsFix}
                resizeKey={open}
              />

              <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] bg-gradient-to-b from-black/50 to-transparent px-3 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <div className="pointer-events-auto relative mx-auto max-w-3xl">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="icon-only inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-zinc-800 shadow-md dark:bg-zinc-900 dark:text-zinc-100"
                      aria-label="Close map"
                    >
                      <XIcon />
                    </button>
                    <div className="relative min-w-0 flex-1">
                      <label htmlFor="tm-map-place-search" className="sr-only">
                        Search area, colony, or landmark
                      </label>
                      <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-lg ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
                        <SearchIcon />
                        <input
                          ref={searchInputRef}
                          id="tm-map-place-search"
                          type="search"
                          value={placeQuery}
                          onChange={(e) => setPlaceQuery(e.target.value)}
                          placeholder="Search your area"
                          autoComplete="off"
                          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-300/50 dark:text-zinc-50"
                        />
                        {placeQuery && (
                          <button
                            type="button"
                            onClick={() => {
                              setPlaceQuery("");
                              setPlaceResults([]);
                              setPlaceSearchError(null);
                              searchInputRef.current?.focus();
                            }}
                            className="icon-only rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                            aria-label="Clear search"
                          >
                            <XIcon />
                          </button>
                        )}
                      </div>

                      {(placeSearching || placeResults.length > 0 || placeSearchError) &&
                        placeQuery.trim().length >= 2 && (
                          <ul
                            className="absolute left-0 right-0 top-full z-[510] mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                            role="listbox"
                            aria-label="Place search results"
                          >
                            {placeSearching && placeResults.length === 0 && (
                              <li className="px-3 py-2.5 text-xs text-zinc-400">Searching…</li>
                            )}
                            {!placeSearching && placeSearchError && placeResults.length === 0 && (
                              <li className="px-3 py-2.5 text-xs text-zinc-500">{placeSearchError}</li>
                            )}
                            {placeResults.map((place) => (
                              <li key={place.id} role="option">
                                <button
                                  type="button"
                                  onClick={() => void handleSelectPlace(place)}
                                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                >
                                  <LocateIcon />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                      {place.label}
                                    </span>
                                    {place.secondary && (
                                      <span className="mt-0.5 block text-[0.7rem] leading-snug text-zinc-500 dark:text-zinc-400">
                                        {place.secondary}
                                      </span>
                                    )}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  </div>
                  <p id="tm-location-title" className="mt-2 px-1 text-[0.65rem] font-medium text-white/90 drop-shadow">
                    Search an ilaqa, or move the map — pin stays in the center
                  </p>
                </div>
              </div>

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
                          : "Search above or pan the map to your street")}
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
                  <CustomSelect
                    value={location?.city ?? location?.deliveryZone ?? ""}
                    onChange={(val) => {
                      if (val && SUPPORTED_CITIES.includes(val as SupportedCity)) {
                        handleSelectCity(val as SupportedCity);
                      }
                    }}
                    options={[
                      { value: "", label: "— All cities —" },
                      ...SUPPORTED_CITIES.map((city) => ({
                        value: city,
                        label: city,
                      })),
                    ]}
                    size="sm"
                  />
                </div>
              )}

              {location?.city && getCityAreas(location.city).length > 0 && (
                <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                  <p className="mb-1.5 text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                    Nearby areas in {location.city}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {getCityAreas(location.city).map((area) => (
                      <button
                        key={area.name}
                        type="button"
                        onClick={() =>
                          handleSelectArea(location.city as SupportedCity, area.name)
                        }
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${
                          location?.deliveryZone === area.name
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40"
                        }`}
                      >
                        {area.name}
                      </button>
                    ))}
                  </div>
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
