/* -------------------------------------------------------------------------- */
/*  Reverse geocoding proxy — coordinates → street address                     */
/*                                                                            */
/*  Why a proxy instead of calling Nominatim from the browser:                 */
/*   • Browsers silently drop a custom User-Agent, so every request looked     */
/*     anonymous to Nominatim and got throttled — that is why addresses        */
/*     sometimes came back empty and the app fell back to a city centroid.     */
/*   • A shared cache means the same street is geocoded once, not once per     */
/*     customer, which keeps us comfortably inside the free usage policy.      */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { isValidCoordinate } from "@/lib/geoCoords";
import { getPublicAppUrl } from "@/lib/appUrl";
import { checkRateLimit, RATE_LIMITS, buildRateLimitResponse } from "@/lib/rateLimiter";

export const runtime = "edge";

/** ~11 m of precision — finer than any address needs, coarse enough to reuse. */
const CACHE_PRECISION = 4;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

type CacheEntry = { body: unknown; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function readCache(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // Refresh insertion order so hot streets survive eviction.
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function writeCache(key: string, body: unknown): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { body, expiresAt: Date.now() + CACHE_TTL_MS });
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, { ...RATE_LIMITS.PLACES, name: "places-reverse" });
  if (!limited.allowed) {
    const res = buildRateLimitResponse(limited);
    return NextResponse.json(res.body, { status: res.status, headers: res.headers });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!isValidCoordinate(lat, lng)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  const key = cacheKey(lat, lng);
  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  }

  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${encodeURIComponent(String(lat))}` +
    `&lon=${encodeURIComponent(String(lng))}` +
    `&zoom=18&addressdetails=1&namedetails=1&extratags=1&accept-language=en`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        // Nominatim's usage policy requires an identifiable agent.
        "User-Agent": `TrendsMart/1.0 (${getPublicAppUrl()})`,
        Referer: getPublicAppUrl(),
      },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });
    }

    const body = (await res.json()) as unknown;
    writeCache(key, body);

    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Geocoder unavailable." }, { status: 502 });
  }
}
