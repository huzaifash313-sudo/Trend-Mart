/* -------------------------------------------------------------------------- */
/*  Server-side reverse geocode (Nominatim) for coverage verification           */
/*  Used by order placement — never trust client-only city strings.            */
/* -------------------------------------------------------------------------- */

import { isValidCoordinate } from "@/lib/geoCoords";
import { getPublicAppUrl } from "@/lib/appUrl";

export interface ReverseGeocodeResult {
  city: string | null;
  town: string | null;
  suburb: string | null;
  neighbourhood: string | null;
  road: string | null;
  displayName: string | null;
  rawCityCandidates: string[];
}

const CACHE_PRECISION = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 400;
const cache = new Map<string, { value: ReverseGeocodeResult; expiresAt: number }>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function pushUnique(list: string[], value: string | null | undefined): void {
  const v = (value ?? "").trim();
  if (!v) return;
  const lower = v.toLowerCase();
  if (list.some((x) => x.toLowerCase() === lower)) return;
  list.push(v);
}

/**
 * Reverse-geocode a pin on the server. Returns null when coords are invalid
 * or the upstream provider is unavailable (caller decides soft vs hard fail).
 */
export async function reverseGeocodeServer(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> {
  if (!isValidCoordinate(lat, lng)) return null;

  const key = cacheKey(lat, lng);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}` +
    `&zoom=18&addressdetails=1&accept-language=en`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `TrendsMart/1.0 (${getPublicAppUrl()})`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const addr = data.address ?? {};
    const candidates: string[] = [];
    pushUnique(candidates, addr.city);
    pushUnique(candidates, addr.town);
    pushUnique(candidates, addr.municipality);
    pushUnique(candidates, addr.county);
    pushUnique(candidates, addr.state_district);
    pushUnique(candidates, addr.suburb);
    pushUnique(candidates, addr.village);

    const result: ReverseGeocodeResult = {
      city: addr.city?.trim() || addr.town?.trim() || null,
      town: addr.town?.trim() || null,
      suburb: addr.suburb?.trim() || null,
      neighbourhood: addr.neighbourhood?.trim() || addr.quarter?.trim() || null,
      road: addr.road?.trim() || null,
      displayName: data.display_name?.trim() || null,
      rawCityCandidates: candidates,
    };

    if (cache.size >= CACHE_MAX) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  }
}

/** Loose city match: substring either way, case-insensitive. */
export function citiesMatchLoose(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * True when any reverse-geocode candidate matches the shop's target city.
 */
export function pinMatchesCity(
  geo: ReverseGeocodeResult,
  targetCity: string,
): boolean {
  const target = targetCity.trim();
  if (!target) return false;
  if (geo.rawCityCandidates.some((c) => citiesMatchLoose(c, target))) return true;
  if (geo.displayName && citiesMatchLoose(geo.displayName, target)) return true;
  return false;
}
