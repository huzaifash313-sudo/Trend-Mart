"use client";

import { useState, useCallback, useEffect } from "react";
import { requestUserLocation, getCachedUserLocation, storeUserLocation, formatDistance, type GeoCoordinates } from "@/services/geoRadiusService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
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

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RADIUS_OPTIONS = [
  { value: 5, label: "5 km" },
  { value: 10, label: "10 km" },
  { value: 20, label: "20 km" },
  { value: 50, label: "50 km" },
  { value: 0, label: "Any" },
] as const;

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export interface GeoFilterState {
  coordinates: GeoCoordinates | null;
  maxDistanceKm: number;
  locationAvailable: boolean;
}

interface GeoRadiusFilterProps {
  onFilterChange: (state: GeoFilterState) => void;
  isDetecting: boolean;
  onDetectStart: () => void;
  onDetectEnd: () => void;
}

export default function GeoRadiusFilter({
  onFilterChange,
  isDetecting,
  onDetectStart,
  onDetectEnd,
}: GeoRadiusFilterProps) {
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState<number>(0);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Try to load cached location on mount
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const cached = await getCachedUserLocation();
      if (!cancelled && cached) {
        setCoordinates(cached);
        onFilterChange({
          coordinates: cached,
          maxDistanceKm: maxDistanceKm,
          locationAvailable: true,
        });
      }
    }
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDetectLocation = useCallback(async () => {
    setLocationError(null);
    onDetectStart();
    try {
      const coords = await requestUserLocation();
      if (coords) {
        setCoordinates(coords);
        storeUserLocation(coords);
        onFilterChange({
          coordinates: coords,
          maxDistanceKm,
          locationAvailable: true,
        });
      } else {
        setLocationError("Could not detect location. Please enable location access.");
        onFilterChange({
          coordinates: null,
          maxDistanceKm: 0,
          locationAvailable: false,
        });
      }
    } catch {
      setLocationError("Location detection failed. Try again.");
    }
    onDetectEnd();
  }, [maxDistanceKm, onFilterChange, onDetectStart, onDetectEnd]);

  const handleRadiusChange = useCallback(
    (km: number) => {
      setMaxDistanceKm(km);
      onFilterChange({
        coordinates,
        maxDistanceKm: km,
        locationAvailable: !!coordinates,
      });
    },
    [coordinates, onFilterChange],
  );

  const handleClearLocation = useCallback(() => {
    setCoordinates(null);
    setMaxDistanceKm(0);
    setLocationError(null);
    onFilterChange({
      coordinates: null,
      maxDistanceKm: 0,
      locationAvailable: false,
    });
  }, [onFilterChange]);

  const isActive = !!coordinates;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
          isActive
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
            : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        }`}
        aria-label="Filter by location distance"
        aria-expanded={expanded}
      >
        <LocateIcon />
        {isActive ? (
          <span className="inline-flex items-center gap-1">
            <PinIcon />
            Within {maxDistanceKm > 0 ? `${maxDistanceKm} km` : "any distance"}
          </span>
        ) : (
          "Nearby"
        )}
      </button>

      {/* Dropdown panel */}
      {expanded && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
              📍 Filter by Distance
            </h3>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-full p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Close filter"
            >
              <XIcon />
            </button>
          </div>

          {/* Detect location button */}
          <div className="mb-3">
            {isActive ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
                <span className="text-base">📍</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                    Location Active
                  </p>
                  <p className="text-[0.6rem] text-emerald-600 dark:text-emerald-400">
                    Lat: {coordinates?.latitude.toFixed(4)} · Lng: {coordinates?.longitude.toFixed(4)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleClearLocation}
                  className="shrink-0 rounded-full p-1 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                  aria-label="Clear location"
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
              <p className="mt-1 text-[0.6rem] text-red-500">{locationError}</p>
            )}
          </div>

          {/* Radius slider */}
          {isActive && (
            <div>
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
              <p className="mt-2 text-[0.6rem] text-zinc-400 dark:text-zinc-500">
                Shops are sorted by proximity — closest first.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}