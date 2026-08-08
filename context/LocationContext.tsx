"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { UserLocation, SupportedCity } from "@/types";
import {
  getValidSavedLocation,
  saveLocation,
  clearSavedLocation,
  detectAndSaveLocation,
  buildLocationFromCity,
  resolveCoordinates,
  type GeoCoordinates,
} from "@/services/geoRadiusService";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Default city used as fallback when GPS is denied and user hasn't picked one. */
const DEFAULT_CITY: SupportedCity = "Gujranwala";

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
  /** Set location from a manually selected city. */
  setManualCity: (city: SupportedCity) => void;
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
      if (saved) {
        setLocation(saved);
        setIsInitialized(true);
        // Mark auto-detect as already handled since we have a saved location
        autoDetectAttempted.current = true;
        if (typeof window !== "undefined") {
          try { sessionStorage.setItem(AUTO_DETECT_KEY, "1"); } catch { /* ignore */ }
        }
        return;
      }
    } catch {
      // ignore corrupt localStorage entries
    }
    setIsInitialized(true);
  }, []);

  // ── 2. Auto-detect GPS on first visit (with permission guard) ─────────
  useEffect(() => {
    // Only run on client, only once per session
    if (typeof window === "undefined") return;
    if (autoDetectAttempted.current) return;

    // Check if already attempted this session
    try {
      if (sessionStorage.getItem(AUTO_DETECT_KEY) === "1") {
        autoDetectAttempted.current = true;
        // No saved location found but auto-detect was tried — apply default city
        if (!location) {
          const defaultLoc = buildLocationFromCity(DEFAULT_CITY);
          defaultLoc.source = "cached";
          saveLocation(defaultLoc);
          setLocation(defaultLoc);
        }
        return;
      }
    } catch { /* ignore */ }

    autoDetectAttempted.current = true;

    // Mark attempted in sessionStorage so we don't keep retrying on re-renders
    try { sessionStorage.setItem(AUTO_DETECT_KEY, "1"); } catch { /* ignore */ }

    // Attempt GPS detection silently (no intrusive prompt, just a fast check)
    setIsDetecting(true);
    detectAndSaveLocation()
      .then((detected) => {
        if (detected) {
          setLocation(detected);
        } else {
          // GPS failed or was denied — apply default city fallback gracefully
          const defaultLoc = buildLocationFromCity(DEFAULT_CITY);
          defaultLoc.source = "cached";
          saveLocation(defaultLoc);
          setLocation(defaultLoc);
        }
      })
      .catch(() => {
        // Network error or any other failure — fallback to default city
        const defaultLoc = buildLocationFromCity(DEFAULT_CITY);
        defaultLoc.source = "cached";
        saveLocation(defaultLoc);
        setLocation(defaultLoc);
      })
      .finally(() => {
        setIsDetecting(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const coordinates: GeoCoordinates | null = location
    ? resolveCoordinates(location)
    : null;

  const detectLocation = useCallback(async (): Promise<UserLocation | null> => {
    setIsDetecting(true);
    try {
      const detected = await detectAndSaveLocation();
      if (detected) {
        setLocation(detected);
        return detected;
      }
      return null;
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const setManualCity = useCallback((city: SupportedCity) => {
    const loc = buildLocationFromCity(city);
    saveLocation(loc);
    setLocation(loc);
  }, []);

  const clearLocation = useCallback(() => {
    clearSavedLocation();
    setLocation(null);
  }, []);

  return (
    <LocationContext.Provider
      value={{
        location,
        coordinates,
        isDetecting,
        isInitialized,
        detectLocation,
        setManualCity,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
}

export default LocationProvider;
