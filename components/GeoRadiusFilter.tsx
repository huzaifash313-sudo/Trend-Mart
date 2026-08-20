"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "@/context/LocationContext";
import { getCityAreas } from "@/lib/cityAreas";
import {
  locationErrorMessage,
  type GeoCoordinates,
  type LocationDetectErrorCode,
} from "@/services/geoRadiusService";
import { SUPPORTED_CITIES, type SupportedCity } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Distance + area filter — synced with LocationContext                       */
/* -------------------------------------------------------------------------- */

function LocateIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg className="h-3.5 w-3.5 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

const RADIUS_OPTIONS = [
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 20, label: "20 km" },
  { value: 50, label: "50 km" },
  { value: 0, label: "Any" },
] as const;

/** Default radius when a specific area / colony is picked. */
const AREA_PICK_DEFAULT_KM = 10;

export type GeoScope = "radius" | "city" | "pakistan";

export interface GeoFilterState {
  coordinates: GeoCoordinates | null;
  maxDistanceKm: number;
  locationAvailable: boolean;
  scope: GeoScope;
}

interface GeoRadiusFilterProps {
  onFilterChange: (state: GeoFilterState) => void;
  isDetecting: boolean;
  onDetectStart: () => void;
  onDetectEnd: () => void;
  /**
   * Controlled mode: when provided, the panel visibility is driven from outside
   * and the internal trigger button is hidden (e.g. products-page "Area" pill).
   */
  open?: boolean;
  /** Called whenever the filter closes itself (selection / outside tap / scroll / Escape). */
  onDismiss?: () => void;
  /** Render the panel inline (no floating dropdown) — used inside a wrapper. */
  inline?: boolean;
}

export default function GeoRadiusFilter({
  onFilterChange,
  isDetecting,
  onDetectStart,
  onDetectEnd,
  open,
  onDismiss,
  inline,
}: GeoRadiusFilterProps) {
  const {
    location,
    coordinates: globalCoords,
    detectLocationDetailed,
    setManualCity,
    setManualArea,
  } = useLocation();

  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(0);
  const [scope, setScope] = useState<GeoScope>("radius");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : expanded;

  const closePanel = useCallback(() => {
    if (isControlled) onDismiss?.();
    else setExpanded(false);
  }, [isControlled, onDismiss]);

  // Outside tap → close so the list behind is immediately visible.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) closePanel();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [isOpen, closePanel]);

  // Scrolling the page behind closes the panel (scrolls inside it are ignored).
  useEffect(() => {
    if (!isOpen) return;
    function onScroll(e: Event) {
      const target = e.target as Node | null;
      const el = rootRef.current;
      if (el && target && el.contains(target)) return;
      closePanel();
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [isOpen, closePanel]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closePanel]);

  const emit = useCallback(
    (coords: GeoCoordinates | null, km: number, nextScope: GeoScope) => {
      onFilterChange({
        coordinates: coords,
        maxDistanceKm: km,
        locationAvailable: !!coords || nextScope === "pakistan" || nextScope === "city",
        scope: nextScope,
      });
    },
    [onFilterChange],
  );

  // Keep filter synced with global LocationContext pin
  useEffect(() => {
    emit(globalCoords, maxDistanceKm, scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalCoords, location?.city, location?.address, location?.deliveryZone]);

  const handleDetectLocation = useCallback(async () => {
    setLocationError(null);
    onDetectStart();
    try {
      const { location: detected, error } = await detectLocationDetailed();
      if (detected?.coordinates) {
        emit(detected.coordinates, maxDistanceKm || 10, scope === "pakistan" ? "radius" : scope);
        if (scope === "pakistan") setScope("radius");
        if (maxDistanceKm === 0) setMaxDistanceKm(10);
        closePanel();
      } else {
        const code = (error ?? "unavailable") as LocationDetectErrorCode;
        setLocationError(locationErrorMessage(code));
      }
    } catch {
      setLocationError("Location detection failed. Try again.");
    }
    onDetectEnd();
  }, [
    detectLocationDetailed,
    emit,
    maxDistanceKm,
    onDetectEnd,
    onDetectStart,
    scope,
    closePanel,
  ]);

  const handleRadiusChange = useCallback(
    (km: number) => {
      setMaxDistanceKm(km);
      setScope("radius");
      // Real-time: emit immediately so homepage refilters to shops within `km`
      emit(globalCoords, km, "radius");
      if (km > 0 && !globalCoords) {
        setLocationError("Turn on location (or refresh GPS) to filter by km.");
      } else {
        setLocationError(null);
      }
      // Close the sheet right away — the filtered list should be visible
      closePanel();
    },
    [emit, globalCoords, closePanel],
  );

  const handleScopeChange = useCallback(
    (next: GeoScope) => {
      setScope(next);
      if (next === "radius" && maxDistanceKm === 0) {
        setMaxDistanceKm(10);
        emit(globalCoords, 10, "radius");
      } else {
        emit(globalCoords, maxDistanceKm, next);
      }
      closePanel();
    },
    [emit, globalCoords, maxDistanceKm, closePanel],
  );

  const handleCityPick = useCallback(
    (city: SupportedCity) => {
      setManualCity(city);
      setScope("city");
      setLocationError(null);
      // City centroid coords come from context after setManualCity
      emit(null, 0, "city");
      closePanel();
    },
    [emit, setManualCity, closePanel],
  );

  const handleAreaPick = useCallback(
    (city: SupportedCity, areaName: string) => {
      setManualArea(city, areaName);
      setScope("radius");
      setMaxDistanceKm(AREA_PICK_DEFAULT_KM);
      setLocationError(null);
      // Area pin coordinates arrive via context → sync effect re-emits
      emit(null, AREA_PICK_DEFAULT_KM, "radius");
      closePanel();
    },
    [emit, setManualArea, closePanel],
  );

  const handleClearLocation = useCallback(() => {
    setMaxDistanceKm(0);
    setScope("radius");
    setLocationError(null);
    emit(null, 0, "radius");
  }, [emit]);

  const isActive = !!globalCoords || scope === "city" || scope === "pakistan";
  const activeAreas = location?.city ? getCityAreas(location.city) : [];
  const isAreaPicked =
    !!location?.deliveryZone &&
    location.deliveryZone !== location.city &&
    activeAreas.some((a) => a.name === location.deliveryZone);

  const addressLabel =
    location?.address ||
    location?.deliveryZone ||
    location?.city ||
    (globalCoords
      ? `Lat ${globalCoords.latitude.toFixed(4)}, Lng ${globalCoords.longitude.toFixed(4)}`
      : null);

  const triggerText = (() => {
    if (scope === "pakistan") return "All Pakistan";
    if (scope === "city") return location?.city ? `City: ${location.city}` : "This city";
    if (globalCoords) {
      if (isAreaPicked && location.deliveryZone) return location.deliveryZone;
      return maxDistanceKm > 0 ? `Within ${maxDistanceKm} km` : "Nearest first";
    }
    return "Nearby";
  })();

  return (
    <div ref={rootRef} className="relative w-full sm:w-auto">
      {!isControlled && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:w-auto ${
            isActive
              ? "border-teal-300 bg-gradient-to-r from-emerald-50 to-teal-50 text-teal-800 shadow-sm shadow-teal-600/10 dark:border-teal-700 dark:from-emerald-900/30 dark:to-teal-900/30 dark:text-teal-300"
              : "border-zinc-200 bg-white text-zinc-500 hover:border-teal-200 hover:bg-teal-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          }`}
          aria-label="Filter by location distance"
          aria-expanded={expanded}
        >
          <LocateIcon />
          {isActive ? (
            <span className="inline-flex items-center gap-1">
              <PinIcon />
              {triggerText}
            </span>
          ) : (
            "Nearby"
          )}
        </button>
      )}

      {isOpen && (
        <div
          className={
            inline
              ? "w-full rounded-2xl border border-teal-200/80 bg-white p-4 shadow-xl shadow-teal-900/10 dark:border-teal-900/50 dark:bg-zinc-900"
              : "absolute right-0 top-full z-50 mt-2 w-[min(88vw,320px)] rounded-2xl border border-teal-200/80 bg-white p-4 shadow-xl shadow-teal-900/10 dark:border-teal-900/50 dark:bg-zinc-900 sm:left-auto sm:right-0 sm:w-[320px] sm:max-w-[92vw]"
          }
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              Filter by area
            </h3>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Close filter"
            >
              <XIcon />
            </button>
          </div>

          <div className="mb-3">
            {addressLabel ? (
              <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <span className="text-base">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    Location Active
                  </p>
                  <p className="mt-0.5 text-[0.65rem] leading-relaxed text-emerald-700 dark:text-emerald-400">
                    {addressLabel}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="shrink-0 rounded-full p-1 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                  aria-label="Reset distance filter"
                >
                  <XIcon />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
              >
                {isDetecting ? (
                  <><CrosshairIcon /> Detecting location...</>
                ) : (
                  <><CrosshairIcon /> Detect My Location</>
                )}
              </button>
            )}
            {locationError && (
              <p className="mt-1 text-[0.6rem] leading-relaxed text-red-500">{locationError}</p>
            )}
            {addressLabel && (
              <button
                type="button"
                onClick={handleDetectLocation}
                disabled={isDetecting}
                className="mt-2 w-full rounded-lg border border-emerald-200 py-1.5 text-[0.65rem] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-400"
              >
                {isDetecting ? "Updating…" : "Refresh live GPS pin"}
              </button>
            )}
          </div>

          <div className="mb-3">
            <p className="mb-1.5 text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
              Browse scope
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: "radius" as const, label: "Near me" },
                  { id: "city" as const, label: "This city" },
                  { id: "pakistan" as const, label: "All Pakistan" },
                ]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleScopeChange(opt.id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    scope === opt.id
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {scope === "radius" && (
            <div className="mb-3">
              <label className="mb-2 block text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                Show shops within:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {RADIUS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleRadiusChange(option.value)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                      maxDistanceKm === option.value
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                        : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {maxDistanceKm > 0 && (
                <p className="mt-1.5 text-[0.6rem] font-medium text-teal-700 dark:text-teal-300">
                  Only shops within {maxDistanceKm} km of your pin (live).
                </p>
              )}
            </div>
          )}

          {scope === "city" && (
            <div className="mb-2">
              <p className="mb-1.5 text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                Pick a city
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_CITIES.slice(0, 8).map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => handleCityPick(city as SupportedCity)}
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-medium ${
                      location?.city === city
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
                    }`}
                  >
                    {city}
                  </button>
                ))}
              </div>
            </div>
          )}

          {location?.city && activeAreas.length > 0 && (
            <div className="mb-2">
              <p className="mb-1.5 text-[0.65rem] font-semibold text-zinc-500 dark:text-zinc-400">
                Nearby areas in {location.city}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {activeAreas.map((area) => (
                  <button
                    key={area.name}
                    type="button"
                    onClick={() => handleAreaPick(location.city as SupportedCity, area.name)}
                    className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-medium ${
                      location.deliveryZone === area.name
                        ? "border-teal-600 bg-teal-600 text-white"
                        : "border-zinc-200 text-zinc-600 hover:border-teal-300 hover:bg-teal-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-teal-700 dark:hover:bg-teal-950/30"
                    }`}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-2 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
            {scope === "pakistan"
              ? "Showing shops across Pakistan — closest to your pin first when GPS is on."
              : scope === "city"
                ? "Showing shops in the selected city — nearest first. Tap an area below for that exact ilaqa."
                : isAreaPicked
                  ? `Filtering around ${location?.deliveryZone ?? "your area"} — shops within ${maxDistanceKm} km show first.`
                  : maxDistanceKm > 0
                    ? `Filtering live: stores farther than ${maxDistanceKm} km are hidden.`
                    : "“Any” shows all nearby shops sorted by distance (no km cut-off)."}
          </p>
        </div>
      )}
    </div>
  );
}
