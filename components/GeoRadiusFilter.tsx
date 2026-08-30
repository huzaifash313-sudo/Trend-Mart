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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
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
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function ChevronDownIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
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

  // Close on Escape. Backdrop tap closes on mobile sheet too.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, closePanel]);

  // Lock page scroll while the mobile bottom-sheet is open.
  useEffect(() => {
    if (!isOpen || inline) return;
    const mq = window.matchMedia("(max-width: 767px)");
    if (!mq.matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen, inline]);

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

  const panelClass = inline
    ? "tm-geo-panel tm-geo-panel--inline"
    : "tm-geo-panel tm-geo-panel--sheet";

  return (
    <div className="tm-geo">
      {!isControlled && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={`tm-geo-trigger${isActive ? " is-active" : ""}`}
          aria-label="Filter by location"
          aria-expanded={expanded}
          aria-haspopup="dialog"
        >
          <PinIcon />
          <span className="tm-geo-trigger-label">{triggerText}</span>
          <span className="tm-geo-trigger-chevron">
            <ChevronDownIcon />
          </span>
        </button>
      )}

      {isOpen && !inline ? (
        <button
          type="button"
          className="tm-geo-backdrop"
          aria-label="Close location filter"
          onClick={closePanel}
        />
      ) : null}

      {isOpen ? (
        <div
          className={panelClass}
          role="dialog"
          aria-modal={!inline}
          aria-label="Location filter"
        >
          {!inline ? (
            <div className="tm-geo-handle" aria-hidden="true">
              <span className="tm-geo-handle-bar" />
            </div>
          ) : null}

          <div className="tm-geo-body">
            <div className="tm-geo-head">
              <div className="tm-geo-head-title-wrap">
                <span className="tm-geo-head-icon">
                  <PinIcon />
                </span>
                <div className="min-w-0">
                  <h3 className="tm-geo-head-title">Location</h3>
                  <p className="tm-geo-head-sub">Find shops near you</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closePanel}
                className="tm-geo-close"
                aria-label="Close filter"
              >
                <XIcon />
              </button>
            </div>

            <div className="tm-geo-tabs" role="tablist" aria-label="Location scope">
              {scopeTabs.map(({ id, label, Icon }) => {
                const active = scope === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleScopeChange(id)}
                    className={`tm-geo-tab${active ? " is-active" : ""}`}
                  >
                    <span className="tm-geo-tab-icon">
                      <Icon />
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="tm-geo-content">
              {scope === "radius" && (
                <div className="tm-geo-section">
                  {globalCoords ? (
                    <div className="tm-geo-live">
                      <span className="tm-geo-live-icon">
                        <PinIcon />
                      </span>
                      <div className="tm-geo-live-text">
                        <p className="tm-geo-live-title">
                          {addressLabel ?? "Current location"}
                        </p>
                        <p className="tm-geo-live-sub">Live pin · GPS on</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleDetectLocation}
                        disabled={isDetecting}
                        className="tm-geo-icon-btn"
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
                      className="tm-geo-detect"
                    >
                      <CrosshairIcon />
                      {isDetecting ? "Detecting location…" : "Detect my location"}
                    </button>
                  )}

                  <div>
                    <p className="tm-geo-label">Show shops within</p>
                    <div className="tm-geo-radius-grid">
                      {RADIUS_OPTIONS.map((option) => {
                        const active = maxDistanceKm === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => handleRadiusChange(option.value)}
                            className={`tm-geo-radius-btn${active ? " is-active" : ""}`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {locationError ? (
                      <p className="tm-geo-error">{locationError}</p>
                    ) : null}
                  </div>
                </div>
              )}

              {scope === "city" && (
                <div className="tm-geo-section">
                  {cityStep === "cities" || !location?.city ? (
                    <div>
                      <p className="tm-geo-label">Select your city</p>
                      <div className="tm-geo-search">
                        <span className="tm-geo-search-icon">
                          <SearchIcon />
                        </span>
                        <input
                          type="search"
                          value={cityQuery}
                          onChange={(e) => setCityQuery(e.target.value)}
                          placeholder="Search city…"
                          autoComplete="off"
                          className="tm-geo-search-input"
                          aria-label="Search cities"
                        />
                      </div>
                      {visibleCities.length > 0 ? (
                        <div className="tm-geo-chip-grid mt-2">
                          {visibleCities.map((city) => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => handleCityPick(city as SupportedCity)}
                              className={`tm-geo-chip${location?.city === city ? " is-active" : ""}`}
                            >
                              {city}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="tm-geo-note mt-2">
                          No city matches “{cityQuery.trim()}”.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="tm-geo-back-row mb-2">
                        <button
                          type="button"
                          onClick={() => setCityStep("cities")}
                          className="tm-geo-back"
                          aria-label="Back to city list"
                        >
                          <BackIcon />
                          Cities
                        </button>
                        <p className="tm-geo-back-title">
                          {location?.city ?? "This city"}
                        </p>
                      </div>
                      <p className="tm-geo-label">Areas in {location?.city}</p>
                      {activeAreas.length > 0 ? (
                        <div className="tm-geo-chip-grid">
                          {activeAreas.map((area) => (
                            <button
                              key={area.name}
                              type="button"
                              onClick={() =>
                                handleAreaPick(location.city as SupportedCity, area.name)
                              }
                              className={`tm-geo-chip tm-geo-chip--teal${
                                location.deliveryZone === area.name ? " is-active" : ""
                              }`}
                            >
                              {area.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="tm-geo-note">
                          No areas listed for {location?.city} yet — tap Done to
                          browse the whole city.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {scope === "pakistan" && (
                <div className="tm-geo-pakistan">
                  <p className="tm-geo-pakistan-title">All of Pakistan</p>
                  <p className="tm-geo-pakistan-body">
                    Showing shops across the country. Nearest stores rank first when
                    your location is on.
                  </p>
                </div>
              )}
            </div>

            <div className="tm-geo-footer">
              <button type="button" onClick={closePanel} className="tm-geo-done">
                <CheckIcon />
                Done
              </button>
              {isActive ? (
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="tm-geo-reset"
                >
                  Reset
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
