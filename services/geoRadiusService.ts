/* -------------------------------------------------------------------------- */
/*  TrendMart — Geo-Radius & Proximity Filtering Service                       */
/*                                                                             */
/*  Handles:                                                                    */
/*   - Customer geolocation (browser API)                                      */
/*   - Distance calculation (Haversine formula)                                */
/*   - Shop filtering by service_radius_km                                     */
/*   - Proximity-based sorting of active shops                                 */
/*   - Delivery zone matching                                                  */
/* -------------------------------------------------------------------------- */

import { createClient } from "@/lib/supabase/client";
import type { Shop, UserLocation, SupportedCity } from "@/types";
import { SUPPORTED_CITIES } from "@/types";
import { logError } from "@/services/errorService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface ShopWithDistance extends Shop {
  distance_km?: number;
  within_radius?: boolean;
}

export interface GeoFilterOptions {
  coordinates?: GeoCoordinates | null;
  maxDistanceKm?: number;
  enforceServiceRadius?: boolean;
  sortByProximity?: boolean;
  deliveryZone?: string;
}

export interface GeoFilterResult {
  shops: ShopWithDistance[];
  locationAvailable: boolean;
  userCoordinates: GeoCoordinates | null;
  totalBeforeFilter: number;
  totalAfterFilter: number;
}

export interface ReverseGeocodeResult {
  city: string | null;
  deliveryZone: string | null;
  displayName: string | null;
  address?: string | null;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_DISTANCE_KM = 50;
const LOCATION_CACHE_KEY = "trendmart_user_location_v2";
/** Re-detect location after 30 minutes (GPS). Manual/cached persists indefinitely. */
const GPS_CACHE_MAX_AGE_MS = 1_800_000; // 30 min

// ─── Known city coordinate centroids (for fallback matching) ─────────────────
const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  "Gujranwala": { lat: 32.1877, lng: 74.1945 },
  "Lahore": { lat: 31.5497, lng: 74.3436 },
  "Islamabad": { lat: 33.6844, lng: 73.0479 },
  "Rawalpindi": { lat: 33.5651, lng: 73.0169 },
  "Faisalabad": { lat: 31.4180, lng: 73.0790 },
  "Karachi": { lat: 24.8607, lng: 67.0011 },
  "Multan": { lat: 30.1575, lng: 71.5249 },
  "Sialkot": { lat: 32.4945, lng: 74.5229 },
  "Gujrat": { lat: 32.5741, lng: 74.0803 },
  "Wazirabad": { lat: 32.4432, lng: 74.1133 },
  "Hafizabad": { lat: 32.0674, lng: 73.6886 },
  "Daska": { lat: 32.3293, lng: 74.3500 },
  "Kamoke": { lat: 31.9764, lng: 74.2224 },
  "Nowshera Virkan": { lat: 31.9593, lng: 73.9702 },
  "Jehlum": { lat: 32.9418, lng: 73.7253 },
  "Narowal": { lat: 32.1007, lng: 74.8809 },
  "Sheikhupura": { lat: 31.7167, lng: 73.9850 },
};

// ─── Haversine Distance Calculation ─────────────────────────────────────────

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Strictly validate geographic coordinates.
 * - Latitude must be between -90 and 90
 * - Longitude must be between -180 and 180
 * - Must be finite, non-NaN numbers
 * Returns `false` if any coordinate is invalid.
 */
export function isValidLatitude(lat: number): boolean {
  return typeof lat === "number" && Number.isFinite(lat) && !Number.isNaN(lat) && lat >= -90 && lat <= 90;
}

export function isValidLongitude(lng: number): boolean {
  return typeof lng === "number" && Number.isFinite(lng) && !Number.isNaN(lng) && lng >= -180 && lng <= 180;
}

export function isValidCoordinate(lat: number, lng: number): boolean {
  return isValidLatitude(lat) && isValidLongitude(lng);
}

/**
 * Sanitize a coordinate value to a safe finite number.
 * - Clamps latitude to [-90, 90]
 * - Clamps longitude to [-180, 180]
 * - Returns fallback for NaN, Infinity, or non-numeric inputs
 */
export function sanitizeLatitude(value: unknown, fallback: number = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) return fallback;
  return Math.max(-90, Math.min(90, value));
}

export function sanitizeLongitude(value: unknown, fallback: number = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) return fallback;
  return Math.max(-180, Math.min(180, value));
}

/**
 * Calculate the Haversine distance between two geographic coordinates.
 * Returns `null` if either coordinate pair is invalid (prevents NaN errors).
 * Distance is returned in kilometers.
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number | null {
  // ── Strict coordinate validation ──────────────────────────────────
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
    return null;
  }

  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  // Use Haversine formula with intermediate NaN guards
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const cosLat1 = Math.cos(toRadians(lat1));
  const cosLat2 = Math.cos(toRadians(lat2));

  // Guard: ensure all trigonometric results are finite
  if (!Number.isFinite(sinDLat) || !Number.isFinite(sinDLng) ||
      !Number.isFinite(cosLat1) || !Number.isFinite(cosLat2)) {
    return null;
  }

  const a = sinDLat * sinDLat + cosLat1 * cosLat2 * sinDLng * sinDLng;

  // Guard: a must be in [0, 1] range (floating-point edge case protection)
  if (!Number.isFinite(a) || a < 0 || a > 1) return null;

  const sqrtA = Math.sqrt(a);
  const sqrt1MinusA = Math.sqrt(Math.max(0, 1 - a));

  // Guard against division by zero
  if (sqrt1MinusA === 0 && sqrtA === 0) return 0;

  const c = 2 * Math.atan2(sqrtA, sqrt1MinusA);

  if (!Number.isFinite(c)) return null;

  const distance = R * c;
  return Number.isFinite(distance) ? Math.round(distance * 1000) / 1000 : null;
}

// ─── Browser Geolocation ────────────────────────────────────────────────────

export function requestUserLocation(
  options?: PositionOptions,
): Promise<GeoCoordinates | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => resolve(null), 8000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => {
        clearTimeout(timeout);
        resolve(null);
      },
      {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300_000,
        ...options,
      },
    );
  });
}

export async function getCachedUserLocation(): Promise<GeoCoordinates | null> {
  if (typeof window === "undefined") return null;

  const cached = sessionStorage.getItem("trendmart_user_location");
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as GeoCoordinates & { ts: number };
      if (Date.now() - parsed.ts < 600_000) {
        return { latitude: parsed.latitude, longitude: parsed.longitude };
      }
    } catch { /* invalid cache */ }
  }

  const coords = await requestUserLocation();
  if (coords) {
    sessionStorage.setItem(
      "trendmart_user_location",
      JSON.stringify({ ...coords, ts: Date.now() }),
    );
  }
  return coords;
}

export function storeUserLocation(coordinates: GeoCoordinates): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    "trendmart_user_location",
    JSON.stringify({ ...coordinates, ts: Date.now() }),
  );
}

// ─── Geo-Radius Filtering ───────────────────────────────────────────────────

export async function filterShopsByProximity(
  shops?: Shop[],
  opts?: GeoFilterOptions,
): Promise<GeoFilterResult> {
  const {
    coordinates = null,
    maxDistanceKm = DEFAULT_MAX_DISTANCE_KM,
    enforceServiceRadius = true,
    sortByProximity = true,
    deliveryZone,
  } = opts ?? {};

  let allShops: Shop[] = shops ?? [];
  const inputLength = shops?.length ?? 0;
  if (inputLength === 0 && !shops) {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .eq("is_live", true)
        .eq("verification_status", "approved")
        .order("name", { ascending: true });

      if (error) throw error;
      allShops = (data as Shop[]) ?? [];
    } catch (err) {
      logError(err, { module: "geoRadiusService.filterShopsByProximity" });
      return {
        shops: allShops,
        locationAvailable: false,
        userCoordinates: null,
        totalBeforeFilter: inputLength,
        totalAfterFilter: inputLength,
      };
    }
  }

  const totalBeforeFilter = allShops.length;
  const userCoords = coordinates ?? (await getCachedUserLocation());

  if (!userCoords) {
    return {
      shops: allShops.map((s) => ({ ...s })),
      locationAvailable: false,
      userCoordinates: null,
      totalBeforeFilter,
      totalAfterFilter: allShops.length,
    };
  }

  let enriched: ShopWithDistance[] = allShops.map((shop) => {
    const shopLat = shop.latitude ?? null;
    const shopLng = shop.longitude ?? null;
    const hasCoords =
      shopLat != null && shopLng != null && !isNaN(shopLat) && !isNaN(shopLng);

    let distance_km: number | undefined | null;

    if (hasCoords) {
      distance_km = haversineDistance(
        userCoords.latitude,
        userCoords.longitude,
        shopLat as number,
        shopLng as number,
      );
    }

    const serviceRadius = shop.service_radius_km ?? null;

    let within_radius = true;
    if (enforceServiceRadius && hasCoords && distance_km != null && serviceRadius != null) {
      within_radius = distance_km <= serviceRadius;
    }
    if (serviceRadius == null) {
      within_radius = true;
    }

    return {
      ...shop,
      distance_km: distance_km != null ? Math.round(distance_km * 10) / 10 : undefined,
      within_radius,
    };
  });

  if (enforceServiceRadius) {
    enriched = enriched.filter((s) => s.within_radius === true);
  }

  enriched = enriched.filter(
    (s) => s.distance_km == null || s.distance_km <= maxDistanceKm,
  );

  if (deliveryZone && deliveryZone.trim()) {
    const zone = deliveryZone.toLowerCase().trim();
    enriched = enriched.filter((s) => {
      const zones = s.delivery_zones ?? [];
      if (!zones || zones.length === 0) return true;
      return zones.some(
        (z) => z.toLowerCase().includes(zone) || zone.includes(z.toLowerCase()),
      );
    });
  }

  if (sortByProximity) {
    enriched.sort((a, b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  }

  return {
    shops: enriched,
    locationAvailable: true,
    userCoordinates: userCoords,
    totalBeforeFilter,
    totalAfterFilter: enriched.length,
  };
}

export function getDistanceToShop(
  shop: Shop,
  userLat: number,
  userLng: number,
): number | null {
  // Validate user coordinates first
  if (!isValidCoordinate(userLat, userLng)) return null;

  const shopLat = shop.latitude;
  const shopLng = shop.longitude;
  if (
    shopLat == null ||
    shopLng == null ||
    !Number.isFinite(shopLat) ||
    !Number.isFinite(shopLng)
  ) {
    return null;
  }
  return haversineDistance(userLat, userLng, shopLat, shopLng);
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "—";
  if (km < 1) return `${Math.round(km * 1000)}m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

// ─── User Location Persistence (localStorage) ───────────────────────────────

/**
 * Load the full UserLocation from localStorage.
 * Returns null if nothing is cached or the cache is corrupted.
 */
export function loadSavedLocation(): UserLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOCATION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    // Basic shape validation
    if (!parsed || typeof parsed.updatedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persist a UserLocation to localStorage.
 */
export function saveLocation(location: UserLocation): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(location));
  } catch { /* quota exceeded or storage disabled */ }
}

/**
 * Clear the saved location from localStorage.
 */
export function clearSavedLocation(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(LOCATION_CACHE_KEY);
  } catch { /* ignore */ }
}

/**
 * Return the currently valid saved location, respecting GPS cache age.
 * Manual/cached selections never expire. GPS-detected locations expire after
 * GPS_CACHE_MAX_AGE_MS (30 minutes).
 */
export function getValidSavedLocation(): UserLocation | null {
  const saved = loadSavedLocation();
  if (!saved) return null;

  // Manual or explicitly cached selections persist indefinitely
  if (saved.source === "manual" || saved.source === "cached") return saved;

  // GPS-based locations expire after the TTL
  if (saved.source === "gps") {
    if (Date.now() - saved.updatedAt < GPS_CACHE_MAX_AGE_MS) {
      return saved;
    }
    // Expired — remove from storage
    clearSavedLocation();
    return null;
  }

  return null;
}

// ─── Reverse Geocoding & City Resolver ──────────────────────────────────────

/**
 * Given coordinates, find the nearest supported city by comparing against
 * known city centroids. Returns the city name if within ~50 km of a centroid.
 */
export function findNearestCity(
  lat: number,
  lng: number,
  maxDistanceKm = 50,
): { city: string; distanceKm: number } | null {
  if (!isValidCoordinate(lat, lng)) return null;

  let bestCity: string | null = null;
  let bestDistance = Infinity;

  for (const [city, centroid] of Object.entries(CITY_CENTROIDS)) {
    const dist = haversineDistance(lat, lng, centroid.lat, centroid.lng);
    if (dist !== null && dist < bestDistance && dist <= maxDistanceKm) {
      bestDistance = dist;
      bestCity = city;
    }
  }

  return bestCity ? { city: bestCity, distanceKm: Math.round(bestDistance * 10) / 10 } : null;
}

/**
 * Try to reverse-geocode coordinates using the OpenStreetMap Nominatim API
 * (free, no API key required; rate-limited to 1 req/sec — we use a single
 * call on demand). Falls back to nearest-city centroid matching.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  // Attempt OSM Nominatim reverse geocoding
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "TrendMart/1.0 (local-shopping-platform)",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as {
        address?: {
          city?: string;
          town?: string;
          city_district?: string;
          county?: string;
          state?: string;
          village?: string;
          suburb?: string;
        };
        display_name?: string;
      };

      const addr = data.address ?? {};
      // Extract the best city-level match
      const cityCandidate =
        addr.city ||
        addr.town ||
        addr.city_district ||
        addr.county ||
        addr.village ||
        addr.suburb ||
        null;

      // Check if the resolved city matches a supported city (case-insensitive)
      let matchedCity: string | null = null;
      if (cityCandidate) {
        const lowerCandidate = cityCandidate.toLowerCase();
        for (const sc of SUPPORTED_CITIES) {
          if (lowerCandidate.includes(sc.toLowerCase()) || sc.toLowerCase().includes(lowerCandidate)) {
            matchedCity = sc;
            break;
          }
        }
      }

      const displayName = data.display_name ?? null;
      return {
        city: matchedCity ?? cityCandidate,
        deliveryZone: matchedCity,
        displayName,
        address: displayName, // full street-level address from OSM
      };
    }
  } catch {
    // Network error, timeout, or rate limit — fall through to centroid matching
  }

  // Fallback: nearest-city centroid matching
  const nearest = findNearestCity(lat, lng, 75); // wider radius for fallback
  if (nearest) {
    const fallbackDisplay = `${nearest.city} (approx. ${nearest.distanceKm} km away)`;
    return {
      city: nearest.city,
      deliveryZone: nearest.city,
      displayName: fallbackDisplay,
      address: fallbackDisplay,
    };
  }

  return { city: null, deliveryZone: null, displayName: null, address: null };
}

/**
 * Build a full UserLocation object from raw coordinates.
 * Performs reverse geocoding to determine the city and delivery zone.
 */
export async function buildLocationFromCoords(
  coords: GeoCoordinates,
  source: "gps" | "manual",
): Promise<UserLocation> {
  const geocode = await reverseGeocode(coords.latitude, coords.longitude);

  return {
    coordinates: {
      latitude: coords.latitude,
      longitude: coords.longitude,
    },
    city: geocode.city,
    deliveryZone: geocode.deliveryZone,
    address: geocode.address ?? geocode.displayName ?? null,
    updatedAt: Date.now(),
    source,
  };
}

/**
 * Build a UserLocation from a manually selected city (no GPS coordinates).
 * Uses the city centroid for distance calculations.
 */
export function buildLocationFromCity(city: SupportedCity): UserLocation {
  const centroid = CITY_CENTROIDS[city];
  return {
    coordinates: centroid
      ? { latitude: centroid.lat, longitude: centroid.lng }
      : null,
    city,
    deliveryZone: city,
    updatedAt: Date.now(),
    source: "manual",
  };
}

/**
 * Resolve coordinates for a given UserLocation, falling back to the city
 * centroid if GPS coordinates are unavailable.
 */
export function resolveCoordinates(
  location: UserLocation,
): GeoCoordinates | null {
  if (location.coordinates) return location.coordinates;

  // Try city centroid fallback
  if (location.city && CITY_CENTROIDS[location.city]) {
    const c = CITY_CENTROIDS[location.city];
    return { latitude: c.lat, longitude: c.lng };
  }

  return null;
}

/**
 * Fetch the user's GPS location, reverse-geocode it, build a full UserLocation,
 * and persist it to localStorage. Returns null if geolocation fails.
 */
export async function detectAndSaveLocation(): Promise<UserLocation | null> {
  const coords = await requestUserLocation();
  if (!coords) return null;

  const location = await buildLocationFromCoords(coords, "gps");
  saveLocation(location);
  return location;
}

/**
 * Re-export CITY_CENTROIDS for components that need to show a map/pin.
 */
export { CITY_CENTROIDS };
