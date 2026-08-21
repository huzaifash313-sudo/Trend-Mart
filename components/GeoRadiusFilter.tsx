"use client";

import { useState, useCallback, useEffect, type ComponentType } from "react";
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

function BuildingIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg className="h-4 w-4 animate-pulse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36" /><polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

const RADIUS_OPTIONS = [
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 15, label: "15 km" },
  { value: 0, label: "Any" },
] as const;

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
  /** Called whenever the filter closes itself (Done / X / Escape). */
  onDismiss?: () => void;
  /** Render the panel inline (no floating dropdown) — used inside a wrapper. */
  inline?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Persistence (scope + radius survive refresh)                               */
/* -------------------------------------------------------------------------- */

const PREFS_KEY = "trendmart_geo_filter_prefs_v1";

interface GeoFilterPrefs {
  scope: GeoScope;
  maxDistanceKm: number;
}

function loadPrefs(): GeoFilterPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GeoFilterPrefs>;
    if (!p || !["radius", "city", "pakistan"].includes(p.scope as string)) return null;
    return {
      scope: p.scope as GeoScope,
      maxDistanceKm:
        typeof p.maxDistanceKm === "number" && Number.isFinite(p.maxDistanceKm)
          ? p.maxDistanceKm
          : 0,
    };
  } catch {
    return null;
  }
}

function savePrefs(prefs: GeoFilterPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
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
    clearLocation,
  } = useLocation();

  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(0);
  const [scope, setScope] = useState<GeoScope>("radius");
  const [locationError, setLocationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  /** Inside "This city": "cities" list first, then the picked city's areas. */
  const [cityStep, setCityStep] = useState<"cities" | "areas">("cities");
  const [hydrated, setHydrated] = useState(false);

  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : expanded;

  const closePanel = useCallback(() => {
    if (isControlled) onDismiss?.();
    else setExpanded(false);
  }, [isControlled, onDismiss]);

  // Close on Escape. No outside-tap close: the picker is a multi-step flow and
  // a stray tap/scroll shouldn't discard the selection.
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
        locationAvailable:
          !!coords || nextScope === "pakistan" || nextScope === "city",
        scope: nextScope,
      });
    },
    [onFilterChange],
  );

  // Restore the last-used scope + radius once on mount (client-only).
  useEffect(() => {
    const saved = loadPrefs();
    if (saved) {
      setScope(saved.scope);
      setMaxDistanceKm(saved.maxDistanceKm);
    }
    setHydrated(true);
  }, []);

  // Persist scope + radius so a refresh keeps the same filtering.
  useEffect(() => {
    if (!hydrated) return;
    savePrefs({ scope, maxDistanceKm });
  }, [hydrated, scope, maxDistanceKm]);

  // Keep the parent filter in sync with the global pin + local scope/radius.
  useEffect(() => {
    if (!hydrated) return;
    emit(globalCoords, maxDistanceKm, scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hydrated,
    globalCoords,
    maxDistanceKm,
    scope,
    location?.city,
    location?.address,
    location?.deliveryZone,
  ]);

  const handleDetectLocation = useCallback(async () => {
    setLocationError(null);
    onDetectStart();
    try {
      const { location: detected, error } = await detectLocationDetailed();
      if (detected?.coordinates) {
        // GPS fix is a complete action — apply and close.
        if (scope === "pakistan") setScope("radius");
        closePanel();
      } else {
        setLocationError(locationErrorMessage((error ?? "unavailable") as LocationDetectErrorCode));
      }
    } catch {
      setLocationError("Location detection failed. Try again.");
    }
    onDetectEnd();
  }, [detectLocationDetailed, scope, closePanel, onDetectEnd, onDetectStart]);

  const handleRadiusChange = useCallback(
    (km: number) => {
      setMaxDistanceKm(km);
      setLocationError(
        km > 0 && !globalCoords ? "Turn on location to filter by km." : null,
      );
    },
    [globalCoords],
  );

  const handleScopeChange = useCallback((next: GeoScope) => {
    setScope(next);
    setCityQuery("");
    setCityStep("cities");
    setLocationError(null);
  }, []);

  const handleCityPick = useCallback(
    (city: SupportedCity) => {
      setManualCity(city);
      setScope("city");
      setCityQuery("");
      setCityStep("areas");
      setLocationError(null);
    },
    [setManualCity],
  );

  const handleAreaPick = useCallback(
    (city: SupportedCity, areaName: string) => {
      setManualArea(city, areaName);
      setScope("city");
      setCityQuery("");
      setLocationError(null);
    },
    [setManualArea],
  );

  const handleClearLocation = useCallback(() => {
    setMaxDistanceKm(0);
    setScope("radius");
    setCityQuery("");
    setCityStep("cities");
    setLocationError(null);
    clearLocation();
  }, [clearLocation]);

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
      ? `${globalCoords.latitude.toFixed(4)}, ${globalCoords.longitude.toFixed(4)}`
      : null);

  const isActive =
    !!globalCoords || scope === "city" || scope === "pakistan";

  const triggerText = (() => {
    if (scope === "pakistan") return "All Pakistan";
    if (scope === "city") return location?.city ?? "This city";
    if (isAreaPicked && location.deliveryZone) return location.deliveryZone;
    if (globalCoords && maxDistanceKm > 0) return `Within ${maxDistanceKm} km`;
    return "Nearest";
  })();

  const trimmedCityQuery = cityQuery.trim().toLowerCase();
  const visibleCities = trimmedCityQuery
    ? SUPPORTED_CITIES.filter((c) => c.toLowerCase().includes(trimmedCityQuery))
    : SUPPORTED_CITIES;

  const scopeTabs: { id: GeoScope; label: string; Icon: ComponentType }[] = [
    { id: "radius", label: "Nearest", Icon: LocateIcon },
    { id: "city", label: "This city", Icon: BuildingIcon },
    { id: "pakistan", label: "All Pakistan", Icon: GlobeIcon },
  ];

  return (
    <div className="relative w-full sm:w-auto">
      {!isControlled && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:w-auto ${
            isActive
              ? "border-teal-300 bg-gradient-to-r from-emerald-50 to-teal-50 text-teal-800 shadow-sm shadow-teal-600/10 dark:border-teal-700 dark:from-emerald-900/30 dark:to-teal-900/30 dark:text-teal-300"
              : "border-zinc-200 bg-white text-zinc-600 hover:border-teal-200 hover:bg-teal-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
          aria-label="Filter by location"
          aria-expanded={expanded}
        >
          <PinIcon />
          <span className="truncate">{triggerText}</span>
        </button>
      )}

      {isOpen && (
        <div
          className={
            inline
              ? "w-full rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xl shadow-teal-900/10 dark:border-zinc-700/80 dark:bg-zinc-900"
              : "absolute right-0 top-full z-50 mt-2 w-[min(92vw,340px)] rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xl shadow-teal-900/10 dark:border-zinc-700/80 dark:bg-zinc-900 sm:left-auto sm:right-0 sm:w-[340px] sm:max-w-[92vw]"
          }
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-600/30">
                <PinIcon />
              </span>
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                Location
              </h3>
            </div>
            <button
              type="button"
              onClick={closePanel}
              className="rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Close filter"
            >
              <XIcon />
            </button>
          </div>

          {/* Scope tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
            {scopeTabs.map(({ id, label, Icon }) => {
              const active = scope === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleScopeChange(id)}
                  aria-pressed={active}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold leading-tight transition-all ${
                    active
                      ? "bg-white text-emerald-700 shadow-sm dark:bg-zinc-900 dark:text-emerald-400"
                      : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  <Icon />
                  <span className="text-center">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="mt-3 min-h-0 space-y-3">
            {scope === "radius" && (
              <div className="space-y-3">
                {globalCoords ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                    <PinIcon />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                        {addressLabel ?? "Current location"}
                      </p>
                      <p className="text-[0.65rem] text-emerald-600 dark:text-emerald-400">
                        Live pin
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDetectLocation}
                      disabled={isDetecting}
                      className="shrink-0 rounded-full p-1.5 text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                      aria-label="Refresh live GPS pin"
                    >
                      <RefreshIcon />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={isDetecting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 px-4 py-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  >
                    <CrosshairIcon />
                    {isDetecting ? "Detecting location…" : "Detect my location"}
                  </button>
                )}

                <div>
                  <p className="mb-2 text-[0.7rem] font-semibold text-zinc-500 dark:text-zinc-400">
                    Show shops within
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {RADIUS_OPTIONS.map((option) => {
                      const active = maxDistanceKm === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleRadiusChange(option.value)}
                          className={`rounded-lg py-2 text-xs font-semibold transition-all ${
                            active
                              ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  {locationError && (
                    <p className="mt-1.5 text-[0.65rem] leading-relaxed text-red-500">
                      {locationError}
                    </p>
                  )}
                </div>
              </div>
            )}

            {scope === "city" && (
              <div className="space-y-3">
                {cityStep === "cities" || !location?.city ? (
                  <div>
                    <p className="mb-1.5 text-[0.7rem] font-semibold text-zinc-500 dark:text-zinc-400">
                      Select your city
                    </p>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400">
                        <SearchIcon />
                      </span>
                      <input
                        type="search"
                        value={cityQuery}
                        onChange={(e) => setCityQuery(e.target.value)}
                        placeholder="Search city…"
                        autoComplete="off"
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-8 pr-3 text-xs text-zinc-900 outline-none transition-colors focus:border-emerald-400 focus:bg-white dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-emerald-500 dark:focus:bg-zinc-900"
                        aria-label="Search cities"
                      />
                    </div>
                    {visibleCities.length > 0 ? (
                      <div className="mt-1.5 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-zinc-100 p-1.5 dark:border-zinc-800">
                        {visibleCities.map((city) => (
                          <button
                            key={city}
                            type="button"
                            onClick={() => handleCityPick(city as SupportedCity)}
                            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all ${
                              location?.city === city
                                ? "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/25"
                                : "border-zinc-200 text-zinc-600 hover:border-emerald-300 hover:bg-emerald-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30"
                            }`}
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[0.65rem] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                        No city matches “{cityQuery.trim()}”.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCityStep("cities")}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[0.65rem] font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        aria-label="Back to city list"
                      >
                        <BackIcon />
                        Cities
                      </button>
                      <p className="truncate text-xs font-bold text-zinc-800 dark:text-zinc-100">
                        {location?.city ?? "This city"}
                      </p>
                    </div>
                    <p className="mb-1.5 text-[0.7rem] font-semibold text-zinc-500 dark:text-zinc-400">
                      Areas in {location?.city}
                    </p>
                    {activeAreas.length > 0 ? (
                      <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-zinc-100 p-1.5 dark:border-zinc-800">
                        {activeAreas.map((area) => (
                          <button
                            key={area.name}
                            type="button"
                            onClick={() =>
                              handleAreaPick(location.city as SupportedCity, area.name)
                            }
                            className={`rounded-full border px-2.5 py-1 text-[0.65rem] font-medium transition-all ${
                              location.deliveryZone === area.name
                                ? "border-teal-600 bg-teal-600 text-white shadow-sm shadow-teal-600/25"
                                : "border-zinc-200 text-zinc-600 hover:border-teal-300 hover:bg-teal-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-teal-700 dark:hover:bg-teal-950/30"
                            }`}
                          >
                            {area.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-[0.65rem] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                        No areas listed for {location?.city} yet — tap Done to
                        browse the whole city.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {scope === "pakistan" && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900/50 dark:bg-teal-950/30">
                <p className="text-xs font-semibold text-teal-800 dark:text-teal-200">
                  All of Pakistan
                </p>
                <p className="mt-1 text-[0.7rem] leading-relaxed text-teal-700 dark:text-teal-400">
                  Showing shops across the country. Nearest stores rank first when
                  your location is on.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <button
              type="button"
              onClick={closePanel}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/30 transition-colors hover:bg-emerald-700"
            >
              <CheckIcon />
              Done
            </button>
            {isActive && (
              <button
                type="button"
                onClick={handleClearLocation}
                className="rounded-xl border border-zinc-200 px-3 py-2.5 text-xs font-semibold text-zinc-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-800 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
