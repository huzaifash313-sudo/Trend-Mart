"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { UserLocation, SupportedCity } from "@/types";
import {
  getValidSavedLocation,
  saveLocation,
  clearSavedLocation,
  detectAndSaveLocation,
  detectAndSaveLocationDetailed,
  buildLocationFromCity,
  buildLocationFromArea,
  buildLocationFromCoords,
  resolveCoordinates,
  storeUserLocation,
  requestUserLocationDetailed,
  haversineDistance,
  isValidCoordinate,
  isPreciseLocation,
  type GeoCoordinates,
  type LocationDetectErrorCode,
} from "@/services/geoRadiusService";
import { getCityAreas } from "@/lib/cityAreas";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Only attempt auto-detect once per page session (not repeatedly). */
const AUTO_DETECT_KEY = "trendsmart_location_autodetect_attempted_v2";

/**
 * How far the customer must move before we re-resolve their address. Below
 * this the saved (richer) label is kept and only the pin is refreshed —
 * re-geocoding on every GPS jitter would hammer Nominatim for nothing.
 */
const DRIFT_REFRESH_KM = 0.4;

/** Poll interval for the background "has the customer moved?" check. */
const DRIFT_CHECK_INTERVAL_MS = 90_000;

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LocationContextValue {
  /** Current user location — or null if not yet resolved / declined. */
  location: UserLocation | null;
  /** Resolved coordinates for the current location (GPS or centroid fallback). */
  coordinates: GeoCoordinates | null;
  /** Device-reported accuracy of the current pin, in metres. */
  accuracyMeters: number | null;
  /** True when the pin is exact enough to deliver to (device fix or user pin). */
  isPrecise: boolean;
  /** Is a GPS detection currently in progress? */
  isDetecting: boolean;
  /** Has the initial location check completed? */
  isInitialized: boolean;
  /** Detect via browser GPS, reverse-geocode, and persist. */
  detectLocation: () => Promise<UserLocation | null>;
  /** Same as detectLocation with typed GPS error for UI messages. */
  detectLocationDetailed: () => Promise<{
    location: UserLocation | null;
    error: LocationDetectErrorCode;
  }>;
  /** Set pin from map click / drag (reverse-geocodes + saves). */
  setManualPin: (lat: number, lng: number) => Promise<UserLocation | null>;
  /** Set location from a manually selected city. */
  setManualCity: (city: SupportedCity) => void;
  /** Set location to a curated area (colony / town) inside a city. */
  setManualArea: (city: SupportedCity, areaName: string) => void;
  /** Seed a saved location (e.g. from account profile) without re-geocoding. */
  seedLocation: (loc: UserLocation) => void;
  /**
   * Silently re-read the device position and update if the customer moved.
   * Never prompts beyond the browser's own permission dialog.
   */
  refreshLocation: (options?: {
    timeout?: number;
    targetAccuracyMeters?: number;
  }) => Promise<UserLocation | null>;
  /** Clear the saved location (reset to no location). */
  clearLocation: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Context                                                                    */
/* -------------------------------------------------------------------------- */

const LocationContext = createContext<LocationContextValue | null>(null);


export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx)
    throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

export function LocationProvider({ children }: { children: ReactNode }) {
  // Initialize to null on both server and client to prevent hydration mismatch.
  // We load from localStorage inside useEffect after mount (client-only).
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const autoDetectAttempted = useRef(false);

  // ── 1. Load persisted location from localStorage on mount ──────────────
  useEffect(() => {
    try {
      const saved = getValidSavedLocation();
      if (saved) setLocation(saved);
    } catch {
      // ignore corrupt localStorage entries
    }
    setIsInitialized(true);
  }, []);

  /**
   * Read the device position and reconcile it with what we have saved.
   *
   * Returns the location in use afterwards. Silent by design: any failure
   * (denied, timeout, offline reverse-geocode) simply leaves the saved
   * location untouched.
   */
  const syncFromDevice = useCallback(
    async (options?: { timeout?: number; targetAccuracyMeters?: number }) => {
      try {
        const { coordinates } = await requestUserLocationDetailed({
          timeout: options?.timeout ?? 12_000,
          targetAccuracyMeters: options?.targetAccuracyMeters,
        });
        if (!coordinates) return null; // denied / unavailable / timeout → keep saved

        const saved = getValidSavedLocation();
        if (
          saved?.coordinates &&
          isValidCoordinate(saved.coordinates.latitude, saved.coordinates.longitude)
        ) {
          const movedKm = haversineDistance(
            saved.coordinates.latitude,
            saved.coordinates.longitude,
            coordinates.latitude,
            coordinates.longitude,
          );
          // Customer hasn't moved — keep the richer saved label, refresh pin.
          if (movedKm != null && movedKm <= DRIFT_REFRESH_KM) {
            const refreshed: UserLocation = {
              ...saved,
              coordinates,
              updatedAt: Date.now(),
            };
            saveLocation(refreshed);
            storeUserLocation(coordinates);
            setLocation(refreshed);
            return refreshed;
          }
        }

        const fresh = await buildLocationFromCoords(coordinates, "gps");
        saveLocation(fresh);
        storeUserLocation(coordinates);
        setLocation(fresh);
        return fresh;
      } catch {
        // Network error during reverse-geocode — keep the saved location.
        return null;
      }
    },
    [],
  );

  // ── 2. Refresh with a fresh GPS fix on mount (silent, once per session) ──
  // Always attempt a current read so a customer who moved cities (e.g.
  // Gujranwala → Lahore) sees shops around their *current* position, never a
  // stale last-known pin. The browser only prompts once (permission is
  // remembered), so this stays silent for returning users. When the fresh fix
  // is essentially the same as the saved pin we skip the reverse-geocode and
  // just refresh the pin timestamp.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (autoDetectAttempted.current) return;
    autoDetectAttempted.current = true;
    try { sessionStorage.setItem(AUTO_DETECT_KEY, "1"); } catch { /* ignore */ }

    void syncFromDevice({ timeout: 12_000 });
  }, [syncFromDevice]);

  // ── 3. Follow the customer while they move ──────────────────────────────
  // A customer who opens the app at home and then travels must see the shops
  // around where they actually are. This only runs when permission is already
  // granted (never prompts) and never overrides a pin/city the user chose by
  // hand — that choice is deliberate and outranks the device.
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;
    let timer: number | null = null;

    const canFollow = async () => {
      if (!navigator.permissions?.query) return false;
      try {
        const status = await navigator.permissions.query({ name: "geolocation" });
        return status.state === "granted";
      } catch {
        return false;
      }
    };

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;

      const saved = getValidSavedLocation();
      // `manual` (city/area) and `pin` are user decisions — leave them alone.
      if (saved && saved.source !== "gps" && saved.source !== "cached") return;
      if (!(await canFollow())) return;

      await syncFromDevice({ timeout: 8_000, targetAccuracyMeters: 80 });
    };

    void (async () => {
      if (!(await canFollow())) return;
      timer = window.setInterval(() => void tick(), DRIFT_CHECK_INTERVAL_MS);
    })();

    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncFromDevice]);

  const coordinates: GeoCoordinates | null = location
    ? resolveCoordinates(location)
    : null;

  const detectLocation = useCallback(async (): Promise<UserLocation | null> => {
    setIsDetecting(true);
    try {
      const detected = await detectAndSaveLocation();
      if (detected) {
        setLocation(detected);
        if (detected.coordinates) storeUserLocation(detected.coordinates);
        return detected;
      }
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const detectLocationDetailed = useCallback(async () => {
    setIsDetecting(true);
    try {
      const result = await detectAndSaveLocationDetailed();
      if (result.location) {
        setLocation(result.location);
        if (result.location.coordinates) {
          storeUserLocation(result.location.coordinates);
        }
      }
      return result;
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const setManualPin = useCallback(async (lat: number, lng: number) => {
    setIsDetecting(true);
    try {
      // `pin`, not `gps`: the user chose this spot deliberately, so it is
      // precise enough to deliver to, but it is not a device fix and must not
      // be silently overwritten by background GPS drift.
      const loc = await buildLocationFromCoords(
        { latitude: lat, longitude: lng },
        "pin",
      );
      saveLocation(loc);
      setLocation(loc);
      if (loc.coordinates) storeUserLocation(loc.coordinates);
      return loc;
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const setManualCity = useCallback((city: SupportedCity) => {
    const loc = buildLocationFromCity(city);
    saveLocation(loc);
    setLocation(loc);
    if (loc.coordinates) storeUserLocation(loc.coordinates);
  }, []);

  const setManualArea = useCallback((city: SupportedCity, areaName: string) => {
    const area = getCityAreas(city).find((a) => a.name === areaName);
    if (!area) {
      setManualCity(city);
      return;
    }
    const loc = buildLocationFromArea(city, area);
    saveLocation(loc);
    setLocation(loc);
    if (loc.coordinates) storeUserLocation(loc.coordinates);
  }, [setManualCity]);

  const seedLocation = useCallback((loc: UserLocation) => {
    saveLocation(loc);
    setLocation(loc);
    if (loc.coordinates) storeUserLocation(loc.coordinates);
  }, []);

  const clearLocation = useCallback(() => {
    clearSavedLocation();
    setLocation(null);
  }, []);

  const value = useMemo(
    () => ({
      location,
      coordinates,
      accuracyMeters: location?.coordinates?.accuracyMeters ?? null,
      isPrecise: isPreciseLocation(location),
      isDetecting,
      isInitialized,
      detectLocation,
      detectLocationDetailed,
      setManualPin,
      setManualCity,
      setManualArea,
      seedLocation,
      refreshLocation: syncFromDevice,
      clearLocation,
    }),
    [
      location,
      coordinates,
      isDetecting,
      isInitialized,
      detectLocation,
      detectLocationDetailed,
      setManualPin,
      setManualCity,
      setManualArea,
      seedLocation,
      syncFromDevice,
      clearLocation,
    ],
  );

  return (
    <LocationContext.Provider value={value}>
      {children}
    </LocationContext.Provider>
  );
}

export default LocationProvider;
