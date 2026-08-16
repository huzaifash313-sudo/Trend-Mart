"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  requestUserLocation,
  reverseGeocode,
  encodeDeliveryZones,
  parseCoverageFromZones,
  type GeoCoordinates,
  type ServiceCoverageMode,
} from "@/services/geoRadiusService";
import { SUPPORTED_CITIES } from "@/types";
import CustomSelect from "@/components/CustomSelect";

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

function PakistanIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function CityIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="10" width="6" height="11" rx="1" />
      <rect x="15" y="3" width="6" height="18" rx="1" />
      <path d="M9 21V14h6v7" />
    </svg>
  );
}

function RadiusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const RADIUS_PRESETS = [3, 5, 10, 15, 20, 50, 100] as const;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface ShopLocationValue {
  latitude: number | null;
  longitude: number | null;
  service_radius_km: number;
  address_display: string;
  /** City / area field on the shop form — filled from reverse geocode when pin is set. */
  location?: string;
  /** Encoded coverage mode markers used by proximity filtering. */
  delivery_zones?: string[];
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

  const coverage = useMemo(
    () => parseCoverageFromZones(value.delivery_zones),
    [value.delivery_zones],
  );
  const mode = coverage.mode;
  const serviceCity = coverage.city || value.location?.trim() || "";

  const hasPin = value.latitude != null && value.longitude != null;

  const applyMode = useCallback(
    (nextMode: ServiceCoverageMode, city?: string) => {
      const resolvedCity =
        nextMode === "city"
          ? (city || serviceCity || "Gujranwala").trim()
          : city;
      onChange({
        delivery_zones: encodeDeliveryZones(nextMode, resolvedCity),
        ...(nextMode === "city" && resolvedCity
          ? { location: resolvedCity }
          : {}),
        ...(nextMode === "nationwide" ? { service_radius_km: 500 } : {}),
      });
    },
    [onChange, serviceCity],
  );

  const handleDetect = useCallback(async () => {
    setError(null);
    setDetecting(true);
    try {
      const coords: GeoCoordinates | null = await requestUserLocation({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
      if (!coords) {
        setError(
          "Couldn't get your location. Allow location access in the browser, then try again.",
        );
        setDetecting(false);
        return;
      }

      onChange({ latitude: coords.latitude, longitude: coords.longitude });

      const geocode = await reverseGeocode(coords.latitude, coords.longitude);
      const address =
        geocode.address?.trim() ||
        geocode.displayName?.trim() ||
        "";
      const cityLabel = geocode.city?.trim() || "";
      const locationLabel =
        address ||
        (cityLabel
          ? geocode.neighbourhood
            ? `${geocode.neighbourhood}, ${cityLabel}`
            : cityLabel
          : "");

      const nextZones =
        mode === "city" && cityLabel
          ? encodeDeliveryZones("city", cityLabel)
          : mode === "nationwide"
            ? encodeDeliveryZones("nationwide")
            : encodeDeliveryZones("radius");

      onChange({
        latitude: coords.latitude,
        longitude: coords.longitude,
        address_display: address,
        ...(locationLabel ? { location: locationLabel.slice(0, 200) } : {}),
        delivery_zones: nextZones,
      });
    } catch {
      setError("Location detection failed. Please try again.");
    }
    setDetecting(false);
  }, [mode, onChange]);

  const handleClear = useCallback(() => {
    onChange({ latitude: null, longitude: null, address_display: "" });
  }, [onChange]);

  const modeHint =
    mode === "nationwide"
      ? "Customers across Pakistan can discover your store (no km limit)."
      : mode === "city"
        ? `Only customers browsing in ${serviceCity || "the selected city"} will see your store.`
        : "Only customers within this distance of your pinned location will see your store.";

  return (
    <div className="space-y-3">
      {/* GPS pin status / detect button */}
      {hasPin ? (
        <div className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
          <span className="mt-0.5 text-emerald-600 dark:text-emerald-400">
            <PinIcon />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              Store location pinned
            </p>
            {value.address_display ? (
              <p className="mt-0.5 text-[0.7rem] leading-snug text-emerald-800 dark:text-emerald-200">
                {value.address_display}
              </p>
            ) : (
              <p className="mt-0.5 text-[0.65rem] text-emerald-700 dark:text-emerald-300">
                Address lookup pending — tap Update to refresh.
              </p>
            )}
            <p className="mt-1 text-[0.6rem] text-emerald-600/90 dark:text-emerald-400/90">
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
            <>
              <CrosshairIcon /> Detecting your location…
            </>
          ) : (
            <>
              <CrosshairIcon /> Use My Current Location as Store Pin
            </>
          )}
        </button>
      )}
      {error && <p className="text-[0.65rem] text-red-500">{error}</p>}

      {/* Coverage mode */}
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
          Delivery / Service Area
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CoverageModeButton
            active={mode === "radius"}
            icon={<RadiusIcon />}
            title="Custom radius"
            subtitle="Around your pin"
            onClick={() => applyMode("radius")}
          />
          <CoverageModeButton
            active={mode === "city"}
            icon={<CityIcon />}
            title="Specific city"
            subtitle="One city only"
            onClick={() => applyMode("city")}
          />
          <CoverageModeButton
            active={mode === "nationwide"}
            icon={<PakistanIcon />}
            title="All Pakistan"
            subtitle="Nationwide"
            onClick={() => applyMode("nationwide")}
          />
        </div>
      </div>

      {mode === "radius" && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Radius (km)
          </label>
          <div className="flex flex-wrap gap-1.5">
            {RADIUS_PRESETS.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => onChange({ service_radius_km: km, delivery_zones: encodeDeliveryZones("radius") })}
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
                  if (Number.isFinite(n)) {
                    onChange({
                      service_radius_km: Math.max(1, Math.min(500, Math.round(n))),
                      delivery_zones: encodeDeliveryZones("radius"),
                    });
                  }
                }}
                className="w-14 bg-transparent text-center text-xs font-semibold text-zinc-700 focus:outline-none dark:text-zinc-300"
                aria-label="Custom radius in kilometers"
              />
              <span className="text-[0.6rem] text-zinc-400">km</span>
            </div>
          </div>
        </div>
      )}

      {mode === "city" && (
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Serve this city
          </label>
          <CustomSelect
            value={
              SUPPORTED_CITIES.includes(serviceCity as (typeof SUPPORTED_CITIES)[number])
                ? serviceCity
                : serviceCity || "Gujranwala"
            }
            onChange={(val) => applyMode("city", val)}
            options={[
              ...(!SUPPORTED_CITIES.includes(serviceCity as (typeof SUPPORTED_CITIES)[number]) &&
              serviceCity
                ? [{ value: serviceCity, label: serviceCity }]
                : []),
              ...SUPPORTED_CITIES.map((city) => ({ value: city, label: city })),
            ]}
            size="sm"
          />
        </div>
      )}

      {mode === "nationwide" && (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/30">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            Delivering all over Pakistan
          </p>
          <p className="mt-0.5 text-[0.65rem] text-emerald-700 dark:text-emerald-300">
            Your store stays visible to customers nationwide. Pin still helps with sorting and checkout distance.
          </p>
        </div>
      )}

      {!compact && (
        <p className="text-[0.65rem] text-zinc-400 dark:text-zinc-500">{modeHint}</p>
      )}
    </div>
  );
}

function CoverageModeButton({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
        active
          ? "border-emerald-500 bg-emerald-50 shadow-sm shadow-emerald-500/10 dark:border-emerald-500 dark:bg-emerald-950/40"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600"
      }`}
    >
      <span
        className={`mt-0.5 ${active ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400"}`}
      >
        {icon}
      </span>
      <span>
        <span
          className={`block text-xs font-semibold ${
            active ? "text-emerald-800 dark:text-emerald-200" : "text-zinc-700 dark:text-zinc-200"
          }`}
        >
          {title}
        </span>
        <span className="block text-[0.65rem] text-zinc-500 dark:text-zinc-400">{subtitle}</span>
      </span>
    </button>
  );
}
