"use client";

import { useCallback, useState } from "react";
import {
  requestUserLocation,
  reverseGeocode,
  type GeoCoordinates,
} from "@/services/geoRadiusService";

/* -------------------------------------------------------------------------- */
/*  Icons                                                                      */
/* -------------------------------------------------------------------------- */

function CrosshairIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function XIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RADIUS_PRESETS = [3, 5, 10, 15, 20] as const;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ShopLocationValue {
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
  address_display: string;
}

interface ShopLocationRadiusPickerProps {
  value: ShopLocationValue;
  onChange: (patch: Partial<ShopLocationValue>) => void;
  /** Compact mode renders a tighter layout for embedding inside larger forms. */
  compact?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function ShopLocationRadiusPicker({
  value,
  onChange,
  compact = false,
}: ShopLocationRadiusPickerProps) {
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPin = value.latitude != null && value.longitude != null;

  const handleDetect = useCallback(async () => {
    setError(null);
    setDetecting(true);
    try {
      const coords: GeoCoordinates | null = await requestUserLocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
      if (!coords) {
        setError("Couldn't get your location. Please allow location access and try again.");
        setDetecting(false);
        return;
      }
      // Optimistically set the pin, then enrich with a human-readable address.
      onChange({ latitude: coords.latitude, longitude: coords.longitude });
      const geocode = await reverseGeocode(coords.latitude, coords.longitude);
      onChange({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address_display: geocode.address ?? geocode.displayName ?? "",
      });
    } catch {
      setError("Location detection failed. Please try again.");
    }
    setDetecting(false);
  }, [onChange]);

  const handleClear = useCallback(() => {
    onChange({ latitude: null, longitude: null, address_display: "" });
  }, [onChange]);

  return (
    <div className="space-y-3">
      {/* GPS pin status / detect button */}
      {hasPin ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400"><PinIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              Store location pinned
            </p>
            {value.address_display ? (
              <p className="truncate text-[0.65rem] text-emerald-700 dark:text-emerald-300">{value.address_display}</p>
            ) : null}
            <p className="text-[0.6rem] text-emerald-600 dark:text-emerald-400">
              Lat: {value.latitude?.toFixed(5)} · Lng: {value.longitude?.toFixed(5)}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDetect}
            disabled={detecting}
            className="shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
          >
            {detecting ? "Updating…" : "Update"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 rounded-full p-1 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
            aria-label="Clear pinned location"
          >
            <XIcon />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleDetect}
          disabled={detecting}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-zinc-300 px-4 py-2.5 text-xs font-semibold text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
        >
          {detecting ? (
            <><CrosshairIcon /> Detecting your location…</>
          ) : (
            <><CrosshairIcon /> Use My Current Location as Store Pin</>
          )}
        </button>
      )}
      {error && <p className="text-[0.65rem] text-red-500">{error}</p>}

      {/* Delivery radius */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Delivery / Service Radius
        </label>
        <div className="flex flex-wrap gap-1.5">
          {RADIUS_PRESETS.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => onChange({ service_radius_km: km })}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                value.service_radius_km === km
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/25"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              }`}
            >
              {km} km
            </button>
          ))}
          <div className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
            <input
              type="number"
              min={1}
              max={500}
              value={value.service_radius_km}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onChange({ service_radius_km: Math.max(1, Math.min(500, Math.round(n))) });
              }}
              className="w-12 bg-transparent text-center text-xs font-semibold text-zinc-700 focus:outline-none dark:text-zinc-300"
              aria-label="Custom radius in kilometers"
            />
            <span className="text-[0.6rem] text-zinc-400">km</span>
          </div>
        </div>
        {!compact && (
          <p className="mt-1.5 text-[0.65rem] text-zinc-400 dark:text-zinc-500">
            Only customers within this distance of your pinned location will see your store on the homepage.
          </p>
        )}
      </div>
    </div>
  );
}
