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
  type GeoCoordinates,
  type LocationDetectErrorCode,
} from "@/services/geoRadiusService";
import { getCityAreas } from "@/lib/cityAreas";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Only attempt auto-detect once per page session (not repeatedly). */
const AUTO_DETECT_KEY = "trendmart_location_autodetect_attempted_v2";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface LocationContextValue {
  /** Current user location — or null if not yet resolved / declined. */
  location: UserLocation | null;
  /** Resolved coordinates for the current location (GPS or centroid fallback). */
  coordinates: GeoCoordinates | null;
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

    (async () => {
      try {
        const { coordinates } = await requestUserLocationDetailed({
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 60_000,
        });
        if (!coordinates) return; // denied / unavailable / timeout → keep saved

        const saved = getValidSavedLocation();
        if (
          saved?.coordinates &&
          isValidCoordinate(saved.coordinates.latitude, saved.coordinates.longitude)
        ) {
          const d = haversineDistance(
            saved.coordinates.latitude,
            saved.coordinates.longitude,
            coordinates.latitude,
            coordinates.longitude,
          );
          // Customer hasn't moved — keep the richer saved label, refresh pin.
          if (d != null && d <= 0.5) {
            storeUserLocation(coordinates);
            return;
          }
        }

        const fresh = await buildLocationFromCoords(coordinates, "gps");
        saveLocation(fresh);
        storeUserLocation(coordinates);
        setLocation(fresh);
      } catch {
        // Network error during reverse-geocode — keep the saved location.
      }
    })();
  }, []);  

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
      const loc = await buildLocationFromCoords(
        { latitude: lat, longitude: lng },
        "gps",
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
      isDetecting,
      isInitialized,
      detectLocation,
      detectLocationDetailed,
      setManualPin,
      setManualCity,
      setManualArea,
      seedLocation,
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
