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
import {
  normalizeAreaName,
  getCityAreas,
} from "@/lib/cityAreas";
import {
  isValidLatitude,
  isValidLongitude,
  isValidCoordinate,
} from "@/lib/geoCoords";

export { isValidLatitude, isValidLongitude, isValidCoordinate };

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  /** GPS accuracy in meters when available (browser Geolocation). */
  accuracyMeters?: number | null;
}

export interface ShopWithDistance extends Shop {
  distance_km?: number;
  within_radius?: boolean;
  /** True when the shop textually mentions the customer's selected area. */
  matches_area?: boolean;
}

export interface GeoFilterOptions {
  coordinates?: GeoCoordinates | null;
  /** Customer browse radius. `0` / negative / Infinity = no customer distance cap. */
  maxDistanceKm?: number;
  enforceServiceRadius?: boolean;
  sortByProximity?: boolean;
  deliveryZone?: string;
  /** Customer city (from GPS or manual picker) — used for merchant city-only coverage. */
  customerCity?: string;
  /**
   * Customer's selected area / mohalla / colony (e.g. "Peoples Colony").
   * Shops whose location / address / delivery_zones mention this area are kept
   * even when their pin is missing or outside the numeric radius.
   */
  customerArea?: string;
  /**
   * Browse scope:
   * - radius: within maxDistanceKm of pin
   * - city: shops in / serving the customer's city
   * - pakistan: all Pakistan (still nearest-first when coords exist)
   */
  scope?: "radius" | "city" | "pakistan";
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
  neighbourhood?: string | null;
  /** Nearest landmark / amenity / building name when OSM provides one. */
  landmark?: string | null;
}

export type LocationDetectErrorCode =
  | "unsupported"
  | "denied"
  | "unavailable"
  | "timeout"
  | null;

export interface LocationDetectResult {
  coordinates: GeoCoordinates | null;
  error: LocationDetectErrorCode;
  /** Horizontal accuracy from the device GPS, when provided. */
  accuracyMeters?: number | null;
}

/** Merchant delivery coverage: pin radius, one city, or all of Pakistan. */
export type ServiceCoverageMode = "radius" | "city" | "nationwide";

const COVERAGE_NATIONWIDE = "__pk_nationwide__";
const COVERAGE_CITY_PREFIX = "__pk_city__:";

export function encodeDeliveryZones(
  mode: ServiceCoverageMode,
  city?: string | null,
): string[] {
  if (mode === "nationwide") return [COVERAGE_NATIONWIDE];
  if (mode === "city") {
    const c = (city ?? "").trim();
    return c ? [`${COVERAGE_CITY_PREFIX}${c}`] : [];
  }
  return [];
}

export function parseCoverageFromZones(
  zones?: string[] | null,
): { mode: ServiceCoverageMode; city: string | null } {
  const list = zones ?? [];
  for (const z of list) {
    if (z === COVERAGE_NATIONWIDE || z.toLowerCase() === "pakistan") {
      return { mode: "nationwide", city: null };
    }
    if (z.startsWith(COVERAGE_CITY_PREFIX)) {
      const city = z.slice(COVERAGE_CITY_PREFIX.length).trim();
      return { mode: "city", city: city || null };
    }
  }
  return { mode: "radius", city: null };
}

export function cityNamesMatch(a: string, b: string): boolean {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_DISTANCE_KM = 50;
const LOCATION_CACHE_KEY = "trendmart_user_location_v2";
/** Re-detect location after 30 minutes (GPS). Manual/cached persists indefinitely. */
const GPS_CACHE_MAX_AGE_MS = 1_800_000; // 30 min

// ─── Known city coordinate centroids (for fallback matching) ─────────────────
export const CITY_CENTROIDS: Record<string, { lat: number; lng: number }> = {
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
  "Peshawar": { lat: 34.0151, lng: 71.5249 },
  "Quetta": { lat: 30.1798, lng: 66.975 },
  "Hyderabad": { lat: 25.396, lng: 68.3578 },
  "Bahawalpur": { lat: 29.3956, lng: 71.6836 },
  "Sargodha": { lat: 32.0836, lng: 72.6711 },
  "Sukkur": { lat: 27.7052, lng: 68.8574 },
  "Abbottabad": { lat: 34.1688, lng: 73.2215 },
  "Mardan": { lat: 34.1989, lng: 72.0231 },
};

// ─── Haversine Distance Calculation ─────────────────────────────────────────

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
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
  return requestUserLocationDetailed(options).then((r) => r.coordinates);
}

/**
 * High-accuracy GPS request with typed error codes for UI messaging.
 */
export function requestUserLocationDetailed(
  options?: PositionOptions,
): Promise<LocationDetectResult> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      resolve({ coordinates: null, error: "unsupported" });
      return;
    }

    const timeoutMs = options?.timeout ?? 15_000;
    const hardTimeout = setTimeout(
      () => resolve({ coordinates: null, error: "timeout" }),
      timeoutMs + 1500,
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(hardTimeout);
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        if (!isValidCoordinate(latitude, longitude)) {
          resolve({ coordinates: null, error: "unavailable", accuracyMeters: null });
          return;
        }
        const accuracy =
          typeof position.coords.accuracy === "number" &&
          Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null;
        resolve({
          coordinates: { latitude, longitude, accuracyMeters: accuracy },
          error: null,
          accuracyMeters: accuracy,
        });
      },
      (err) => {
        clearTimeout(hardTimeout);
        if (err.code === 1)
          resolve({ coordinates: null, error: "denied", accuracyMeters: null });
        else if (err.code === 3)
          resolve({ coordinates: null, error: "timeout", accuracyMeters: null });
        else
          resolve({ coordinates: null, error: "unavailable", accuracyMeters: null });
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 30_000,
        ...options,
      },
    );
  });
}

export function locationErrorMessage(code: LocationDetectErrorCode): string {
  switch (code) {
    case "denied":
      return "Browser blocked location. Allow location for this site (lock icon → Location → Allow), then try again. Or pick your city below.";
    case "timeout":
      return "GPS timed out. Move near a window, turn on Location Services, and try again — or pick your city.";
    case "unsupported":
      return "This browser cannot share GPS. Please select your city manually.";
    case "unavailable":
      return "GPS is temporarily unavailable. Try again or select your city / area manually.";
    default:
      return "Could not detect location. Please try again or select a city.";
  }
}

const LEGACY_SESSION_LOCATION_KEY = "trendmart_user_location";

/**
 * Read cached coordinates only (no GPS prompt).
 * Prefers LocationContext localStorage payload, then legacy sessionStorage.
 * Kept as a local binding so proximity filtering never depends on a
 * cross-chunk export that Turbopack may tree-shake.
 */
function readCachedCoordinates(): GeoCoordinates | null {
  if (typeof window === "undefined") return null;

  try {
    const saved = getValidSavedLocation();
    if (
      saved?.coordinates &&
      isValidCoordinate(
        saved.coordinates.latitude,
        saved.coordinates.longitude,
      )
    ) {
      return saved.coordinates;
    }
  } catch {
    /* ignore */
  }

  try {
    const cached = sessionStorage.getItem(LEGACY_SESSION_LOCATION_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as GeoCoordinates & { ts?: number };
    if (
      typeof parsed.ts === "number" &&
      Date.now() - parsed.ts >= 600_000
    ) {
      return null;
    }
    if (isValidCoordinate(parsed.latitude, parsed.longitude)) {
      return { latitude: parsed.latitude, longitude: parsed.longitude };
    }
  } catch {
    /* invalid cache */
  }

  return null;
}

/** @deprecated Prefer LocationContext / getValidSavedLocation — kept for callers. */
export async function getCachedUserLocation(): Promise<GeoCoordinates | null> {
  const cached = readCachedCoordinates();
  if (cached) return cached;

  const coords = await requestUserLocation();
  if (coords) storeUserLocation(coords);
  return coords;
}

export function storeUserLocation(coordinates: GeoCoordinates): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    LEGACY_SESSION_LOCATION_KEY,
    JSON.stringify({ ...coordinates, ts: Date.now() }),
  );
}

// ─── Geo-Radius Filtering ───────────────────────────────────────────────────

/**
 * Does a shop's location text (location / address / service_area / zones)
 * mention the given area (mohalla / colony)? Normalized so "Peoples Colony"
 * matches "People's Colony, Gujranwala" in a shop's address.
 */
export function shopMentionsArea(
  shop: Pick<
    Shop,
    "location" | "address_display" | "service_area" | "delivery_zones"
  >,
  area: string,
): boolean {
  const target = normalizeAreaName(area);
  if (!target) return false;

  const haystack = [
    shop.location,
    shop.address_display,
    shop.service_area,
    ...(shop.delivery_zones ?? []),
  ]
    .filter(Boolean)
    .map((s) => normalizeAreaName(String(s)))
    .join(" | ");

  if (!haystack) return false;
  return haystack.includes(target);
}

/**
 * Extract the customer's selected area (mohalla/colony) from their location.
 * Returns undefined when only a city is selected — the city-level match already
 * runs via `customerCity`, so text-matching the whole city would weaken the
 * numeric radius cap.
 */
export function getCustomerArea(
  location?: Pick<UserLocation, "city" | "deliveryZone"> | null,
): string | undefined {
  const city = location?.city?.trim();
  const zone = location?.deliveryZone?.trim();
  if (!zone || !city) return undefined;
  if (zone === city) return undefined;
  // The zone is a real curated area only if it exists in the city's area list.
  if (getCityAreas(city).some((a) => a.name === zone)) return zone;
  return undefined;
}

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
    customerCity,
    customerArea,
    scope = "radius",
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
  // Local helper only — never import/call getCachedUserLocation via live binding
  // (Turbopack has dropped that export from the public surface before).
  const userCoords = coordinates ?? readCachedCoordinates();
  const resolvedCustomerCity = (customerCity || deliveryZone || "").trim();
  const browseScope = scope === "city" || scope === "pakistan" ? scope : "radius";
  const unlimitedBrowse =
    browseScope === "pakistan" ||
    !Number.isFinite(maxDistanceKm) ||
    maxDistanceKm <= 0;

  if (!userCoords) {
    // No GPS pin. If the customer's city is known, still honor merchant coverage
    // (nationwide + matching city). Radius-only shops can't be distance-checked
    // without coordinates, so keep those that textually mention the city.
    if (resolvedCustomerCity) {
      const cityFiltered = allShops.filter((shop) => {
        const coverage = parseCoverageFromZones(shop.delivery_zones);
        if (coverage.mode === "nationwide") return true;
        if (coverage.mode === "city") {
          const target = coverage.city || shop.location || "";
          return cityNamesMatch(target, resolvedCustomerCity);
        }
        // Radius shops: match free-text shop.location / zones to city name.
        if (shop.location && cityNamesMatch(shop.location, resolvedCustomerCity)) return true;
        const zones = shop.delivery_zones ?? [];
        return zones.some((z) => cityNamesMatch(z, resolvedCustomerCity));
      });
      return {
        shops: cityFiltered.map((s) => ({ ...s, within_radius: true })),
        locationAvailable: false,
        userCoordinates: null,
        totalBeforeFilter,
        totalAfterFilter: cityFiltered.length,
      };
    }
    // No location at all — return everything; caller shows a "pick location" prompt.
    return {
      shops: allShops.map((s) => ({ ...s, within_radius: true })),
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
    const coverage = parseCoverageFromZones(shop.delivery_zones);

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

    if (coverage.mode === "nationwide") {
      within_radius = true;
    } else if (coverage.mode === "city") {
      const target = coverage.city || shop.location || "";
      if (resolvedCustomerCity) {
        within_radius = cityNamesMatch(target, resolvedCustomerCity);
      } else if (hasCoords && distance_km != null) {
        // No explicit city — approximate with ~35 km of city/store pin.
        within_radius = distance_km <= 35;
      } else {
        within_radius = true;
      }
    } else if (hasCoords && distance_km != null && serviceRadius != null) {
      // radius coverage: enforce the merchant's own delivery radius.
      within_radius = distance_km <= serviceRadius;
    } else if (serviceRadius == null) {
      within_radius = true;
    }

    // Textual area match: shop's location / address / zones name the area the
    // customer picked. This keeps pin-less shops visible for their ilaqa.
    const matchesAreaText =
      !!customerArea && shopMentionsArea(shop, customerArea);

    return {
      ...shop,
      distance_km: distance_km != null ? Math.round(distance_km * 10) / 10 : undefined,
      within_radius,
      matches_area: matchesAreaText || undefined,
    };
  });

  // Merchant coverage enforcement:
  //  - "All Pakistan" browse = explicit show-everything → never hide by radius.
  //  - No explicit km chosen ("Any" / default 0) → show everything sorted by
  //    distance, don't hide far stores (this is why a stale/far GPS pin used
  //    to make the whole marketplace look empty).
  //  - Explicit radius (5/10/15 km) or "This city" → enforce merchant coverage.
  const hasExplicitRadius =
    browseScope === "radius" && Number.isFinite(maxDistanceKm) && maxDistanceKm > 0;
  const enforceRadiusFilter =
    enforceServiceRadius && (browseScope === "city" || hasExplicitRadius);
  if (enforceRadiusFilter) {
    enriched = enriched.filter((s) => s.within_radius === true || s.matches_area === true);
  }

  // City scope: keep shops that serve / sit in the customer's city
  if (browseScope === "city" && resolvedCustomerCity) {
    enriched = enriched.filter((s) => {
      const coverage = parseCoverageFromZones(s.delivery_zones);
      if (coverage.mode === "nationwide") return true;
      if (coverage.mode === "city") {
        const target = coverage.city || s.location || "";
        return cityNamesMatch(target, resolvedCustomerCity);
      }
      if (s.location && cityNamesMatch(s.location, resolvedCustomerCity)) return true;
      const zones = (s.delivery_zones ?? []).filter(
        (z) => z !== COVERAGE_NATIONWIDE && !z.startsWith(COVERAGE_CITY_PREFIX),
      );
      if (zones.some((z) => cityNamesMatch(z, resolvedCustomerCity))) return true;
      // With pin: within ~40 km of customer still counts as same metro area
      if (s.distance_km != null && s.distance_km <= 40) return true;
      return false;
    });
  }

  // Near me + explicit km (5/10/20/50): HARD cut — only shops with a pin inside range.
  // "Any" (maxDistanceKm <= 0) keeps sorting by proximity without cutting the list.
  // City / All Pakistan browse ignore this km cap (they use city/nationwide rules above).
  // Shops that textually name the selected area are kept even if their pin is far.
  if (browseScope === "radius" && !unlimitedBrowse) {
    enriched = enriched.filter(
      (s) =>
        (s.distance_km != null && s.distance_km <= maxDistanceKm) ||
        s.matches_area === true,
    );
  } else if (browseScope === "radius") {
    // "Any" — still drop shops that fail merchant service-radius when enforced
    // (already filtered above); keep the rest sorted by distance.
  }
  // city / pakistan: no customer km-cap here

  // Soft zone match for legacy free-text delivery_zones (ignore our coverage markers).
  // In "All Pakistan" browse this must NOT hide shops — the whole point of that
  // scope is to show every store in the country regardless of the pin's zone.
  if (browseScope !== "pakistan" && deliveryZone && deliveryZone.trim()) {
    const zone = deliveryZone.toLowerCase().trim();
    enriched = enriched.filter((s) => {
      const coverage = parseCoverageFromZones(s.delivery_zones);
      if (coverage.mode !== "radius") return true;
      const zones = (s.delivery_zones ?? []).filter(
        (z) => z !== COVERAGE_NATIONWIDE && !z.startsWith(COVERAGE_CITY_PREFIX),
      );
      if (!zones.length) return true;
      return zones.some(
        (z) => z.toLowerCase().includes(zone) || zone.includes(z.toLowerCase()),
      );
    });
  }

  if (sortByProximity) {
    enriched.sort((a, b) => {
      const aCov = parseCoverageFromZones(a.delivery_zones);
      const bCov = parseCoverageFromZones(b.delivery_zones);
      if (a.distance_km == null && b.distance_km == null) {
        if (aCov.mode === bCov.mode) return 0;
        if (aCov.mode === "radius") return -1;
        if (bCov.mode === "radius") return 1;
        return 0;
      }
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

/**
 * Whether a customer at the given coordinates / city falls inside a shop's
 * delivery coverage. This is the single source of truth for the checkout gate
 * and any UI that needs to decide "can this customer order from this shop?".
 *
 * Coverage modes come from `parseCoverageFromZones`:
 *   - nationwide  → always within
 *   - city        → within when the customer's city matches the shop's city
 *                   (falls back to a ~35 km proximity check when no city known)
 *   - radius      → within when distance <= service_radius_km (or when radius unset)
 */
export function isCustomerWithinCoverage(
  shop: {
    latitude?: number | null;
    longitude?: number | null;
    service_radius_km?: number | null;
    delivery_zones?: string[] | null;
    location?: string | null;
  },
  customerLat: number,
  customerLng: number,
  customerCity?: string | null,
): { within: boolean; distanceKm: number | null; coverageMode: ServiceCoverageMode } {
  const coverage = parseCoverageFromZones(shop.delivery_zones);

  if (coverage.mode === "nationwide") {
    return { within: true, distanceKm: null, coverageMode: "nationwide" };
  }

  const hasShopCoords =
    shop.latitude != null &&
    shop.longitude != null &&
    isValidCoordinate(shop.latitude, shop.longitude);
  const distanceKm = hasShopCoords
    ? haversineDistance(
        shop.latitude as number,
        shop.longitude as number,
        customerLat,
        customerLng,
      )
    : null;

  if (coverage.mode === "city") {
    const target = coverage.city || shop.location || "";
    if (customerCity && target) {
      return {
        within: cityNamesMatch(target, customerCity),
        distanceKm,
        coverageMode: "city",
      };
    }
    // No explicit city resolved — approximate with ~35 km of the shop pin.
    return {
      within: distanceKm != null ? distanceKm <= 35 : true,
      distanceKm,
      coverageMode: "city",
    };
  }

  // radius
  const radiusKm = shop.service_radius_km ?? 0;
  if (radiusKm > 0 && distanceKm != null) {
    return { within: distanceKm <= radiusKm, distanceKm, coverageMode: "radius" };
  }
  return { within: true, distanceKm, coverageMode: "radius" };
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

/** Extra PK city names OSM sometimes returns that aren't in SUPPORTED_CITIES. */
const PK_CITY_ALIASES = [
  "Peshawar",
  "Quetta",
  "Hyderabad",
  "Abbottabad",
  "Mardan",
  "Bahawalpur",
  "Sargodha",
  "Sukkur",
  "Larkana",
  "Mingora",
  "Islamabad Capital Territory",
  "Rawalpindi District",
] as const;

function normalizeCityToken(raw: string): string {
  return raw
    .replace(/\b(district|division|tehsil|capital territory|province)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the whole token is a Pakistani city name (not "Peshawar Highway"). */
function looksLikeCityName(text: string): boolean {
  const t = normalizeCityToken(text).toLowerCase();
  if (t.length < 3) return false;
  for (const sc of SUPPORTED_CITIES) {
    if (t === sc.toLowerCase()) return true;
  }
  for (const alias of PK_CITY_ALIASES) {
    const a = alias.toLowerCase();
    if (t === a) return true;
    // Allow "Islamabad Capital Territory" style aliases only
    if (a.includes(" ") && t === a) return true;
  }
  return false;
}

/**
 * Match a supported city from free text — whole-name match only.
 * Avoids false hits like `sc.includes("abad")` → Islamabad.
 */
function matchSupportedCityFromText(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  const lower = normalizeCityToken(text).toLowerCase();
  if (lower.length < 3) return null;

  // Prefer longer city names first (Sheikhupura before ... etc.)
  const ranked = [...SUPPORTED_CITIES].sort((a, b) => b.length - a.length);
  for (const sc of ranked) {
    const scLower = sc.toLowerCase();
    if (lower === scLower) return sc;
    // Word-boundary style: "…, Islamabad" / "Islamabad, …"
    const re = new RegExp(`(?:^|[,\\s])${scLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[,\\s])`, "i");
    if (re.test(lower) || lower.includes(scLower)) return sc;
  }
  return null;
}

/**
 * Build a human street / colony / landmark label from Nominatim address parts.
 * City is resolved separately from GPS — local parts only here.
 */
function formatOsmStreetAddress(addr: {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  path?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  residential?: string;
  hamlet?: string;
  city_district?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  state_district?: string;
  postcode?: string;
  country?: string;
  amenity?: string;
  building?: string;
  shop?: string;
  tourism?: string;
  leisure?: string;
  office?: string;
  school?: string;
  college?: string;
  university?: string;
}): {
  shortAddress: string;
  neighbourhood: string | null;
  cityCandidate: string | null;
  landmark: string | null;
} {
  const landmarkRaw =
    addr.amenity ||
    addr.building ||
    addr.shop ||
    addr.tourism ||
    addr.leisure ||
    addr.office ||
    addr.school ||
    addr.college ||
    addr.university ||
    null;

  // Don't treat another city name as a "landmark" (causes "Peshawar, E-8, Islamabad")
  const landmark =
    landmarkRaw && !looksLikeCityName(landmarkRaw) ? landmarkRaw : null;

  const street = [addr.house_number, addr.road || addr.pedestrian || addr.path]
    .filter(Boolean)
    .join(" ")
    .trim();

  const neighbourhood =
    addr.neighbourhood ||
    addr.suburb ||
    addr.residential ||
    addr.quarter ||
    addr.hamlet ||
    addr.city_district ||
    null;

  // Never fall back to county/state — those mix wrong cities in Pakistan OSM data
  const cityCandidate =
    addr.city || addr.town || addr.municipality || addr.village || null;

  // Local line only — city appended later from GPS-authoritative match
  const parts = [landmark, street, neighbourhood]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .filter((part) => !looksLikeCityName(part))
    .filter(
      (part, idx, arr) =>
        arr.findIndex((x) => x.toLowerCase() === part.toLowerCase()) === idx,
    );

  const shortAddress = parts.length > 0 ? parts.join(", ") : "";
  return { shortAddress, neighbourhood, cityCandidate, landmark };
}

/** Remove other-city tokens so we never show "Peshawar, E-8, Islamabad". */
function scrubConflictingCities(label: string, resolvedCity: string | null): string {
  if (!label.trim()) return "";
  const keep = resolvedCity ? normalizeCityToken(resolvedCity).toLowerCase() : "";
  return label
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((part) => {
      const lower = normalizeCityToken(part).toLowerCase();
      if (lower === "pakistan") return false;
      if (keep && lower === keep) return true;
      if (looksLikeCityName(part) && lower !== keep) return false;
      return true;
    })
    .join(", ");
}

export interface PlaceSearchResult {
  id: string;
  label: string;
  secondary?: string;
  latitude: number;
  longitude: number;
  source?: "google" | "photon" | "nominatim";
}

/**
 * Forward-geocode an area / street / landmark / business.
 * Uses `/api/places/search` (Google Places when keyed, else Photon + Nominatim).
 */
export async function searchPlaces(
  query: string,
  opts?: {
    limit?: number;
    signal?: AbortSignal;
    latitude?: number | null;
    longitude?: number | null;
  },
): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const limit = Math.min(Math.max(opts?.limit ?? 8, 1), 12);
  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
    });
    if (
      opts?.latitude != null &&
      opts?.longitude != null &&
      isValidCoordinate(opts.latitude, opts.longitude)
    ) {
      params.set("lat", String(opts.latitude));
      params.set("lng", String(opts.longitude));
    }

    // Prefer same-origin API (server can use Google key safely)
    const base =
      typeof window !== "undefined"
        ? ""
        : process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXT_PUBLIC_SITE_URL ||
          "http://localhost:3000";
    const res = await fetch(`${base}/api/places/search?${params}`, {
      signal: opts?.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: PlaceSearchResult[];
    };
    return (data.results ?? []).filter(
      (r) =>
        r &&
        typeof r.label === "string" &&
        isValidCoordinate(r.latitude, r.longitude),
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return [];
    logError(err, { module: "geoRadiusService.searchPlaces", meta: { q } });
    return [];
  }
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult> {
  // Attempt OSM Nominatim reverse geocoding (zoom 18 = building/street detail)
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${encodeURIComponent(String(lat))}` +
      `&lon=${encodeURIComponent(String(lng))}` +
      `&zoom=18&addressdetails=1&namedetails=1&extratags=1&accept-language=en`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "TrendMart/1.0 (https://trend-marts.vercel.app)",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as {
        address?: Record<string, string | undefined>;
        display_name?: string;
        name?: string;
        namedetails?: { name?: string; "name:en"?: string };
      };

      const addr = data.address ?? {};
      const { shortAddress, neighbourhood, cityCandidate, landmark } =
        formatOsmStreetAddress(addr);

      // GPS nearest city is authoritative (prevents OSM mixing distant cities)
      const nearest = findNearestCity(lat, lng, 45);
      let matchedCity: string | null = nearest?.city ?? null;

      if (!matchedCity) {
        matchedCity =
          matchSupportedCityFromText(cityCandidate) ||
          matchSupportedCityFromText(neighbourhood) ||
          matchSupportedCityFromText(data.display_name) ||
          null;
      }

      // If OSM city conflicts with GPS nearest city, trust GPS
      const osmCity = matchSupportedCityFromText(cityCandidate);
      if (nearest && osmCity && osmCity !== nearest.city) {
        matchedCity = nearest.city;
      }

      const namedPlaceRaw =
        data.name ||
        data.namedetails?.["name:en"] ||
        data.namedetails?.name ||
        landmark ||
        null;
      const namedPlace =
        namedPlaceRaw && !looksLikeCityName(namedPlaceRaw)
          ? namedPlaceRaw
          : landmark;

      let localLine = shortAddress;
      if (
        namedPlace &&
        localLine &&
        !localLine.toLowerCase().includes(namedPlace.toLowerCase())
      ) {
        localLine = `${namedPlace}, ${localLine}`;
      } else if (namedPlace && !localLine) {
        localLine = namedPlace;
      }

      // Strip roads like "Peshawar Highway" city-token false positives carefully:
      // only drop parts that ARE a city name, not roads containing a city word.
      localLine = scrubConflictingCities(localLine, matchedCity);

      // Final: "E-8, Islamabad" — one city only
      const merged = [localLine, matchedCity].filter(Boolean).join(", ");
      const address =
        scrubConflictingCities(merged, matchedCity) ||
        (matchedCity ? `${matchedCity}, Pakistan` : null);

      return {
        city: matchedCity ?? (osmCity || cityCandidate),
        deliveryZone: matchedCity ?? neighbourhood ?? cityCandidate,
        displayName: address,
        address,
        neighbourhood,
        landmark: namedPlace,
      };
    }
  } catch {
    // Network error, timeout, or rate limit — fall through to centroid matching
  }

  // Fallback: nearest-city centroid matching
  const nearest = findNearestCity(lat, lng, 75);
  if (nearest) {
    const nearLabel =
      nearest.distanceKm < 2
        ? `${nearest.city}, Pakistan`
        : `Near ${nearest.city} (approx. ${nearest.distanceKm} km), Pakistan`;
    return {
      city: nearest.city,
      deliveryZone: nearest.city,
      displayName: nearLabel,
      address: nearLabel,
      neighbourhood: null,
      landmark: null,
    };
  }

  return {
    city: null,
    deliveryZone: null,
    displayName: null,
    address: null,
    neighbourhood: null,
    landmark: null,
  };
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
      ...(coords.accuracyMeters != null
        ? { accuracyMeters: coords.accuracyMeters }
        : {}),
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
 * Build a UserLocation from a manually selected area (colony / town) inside a
 * city. The area pin becomes the customer location so the proximity engine
 * filters shops, products, and deals around that exact ilaqa.
 */
export function buildLocationFromArea(
  city: SupportedCity,
  area: { name: string; lat: number; lng: number },
): UserLocation {
  return {
    coordinates: { latitude: area.lat, longitude: area.lng },
    city,
    deliveryZone: area.name,
    address: `${area.name}, ${city}`,
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
  const { coordinates, error } = await requestUserLocationDetailed({
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 60_000,
  });
  if (!coordinates) {
    if (error) {
      logError(`GPS detect failed: ${error}`, {
        module: "geoRadiusService.detectAndSaveLocation",
        meta: { error },
      });
    }
    return null;
  }

  const location = await buildLocationFromCoords(coordinates, "gps");
  saveLocation(location);
  storeUserLocation(coordinates);
  return location;
}

/**
 * Same as detectAndSaveLocation but also returns the typed GPS error for UI copy.
 */
export async function detectAndSaveLocationDetailed(): Promise<{
  location: UserLocation | null;
  error: LocationDetectErrorCode;
}> {
  const { coordinates, error } = await requestUserLocationDetailed({
    enableHighAccuracy: true,
    timeout: 15_000,
    maximumAge: 60_000,
  });
  if (!coordinates) return { location: null, error };

  const location = await buildLocationFromCoords(coordinates, "gps");
  saveLocation(location);
  storeUserLocation(coordinates);
  return { location, error: null };
}
