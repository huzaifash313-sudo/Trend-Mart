/* -------------------------------------------------------------------------- */
/*  Place search API — Google Places (best) → Photon → Nominatim               */
/*  Local shops/hospitals/academies need Google for Google-Maps-level coverage */
/* -------------------------------------------------------------------------- */

import { NextRequest, NextResponse } from "next/server";
import { isValidCoordinate } from "@/lib/geoCoords";
import { getPublicAppUrl } from "@/lib/appUrl";

export const runtime = "edge";

export interface PlaceHit {
  id: string;
  label: string;
  secondary?: string;
  latitude: number;
  longitude: number;
  source: "google" | "photon" | "nominatim";
}

function googleKey(): string | null {
  // SECURITY: this is a SERVER-side, billable Google Places API key. It must
  // come from the server-only GOOGLE_MAPS_API_KEY. Never fall back to a
  // NEXT_PUBLIC_* key — that would leak a billable key into the client bundle.
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || "";
  return key.length > 8 ? key : null;
}

function dedupe(hits: PlaceHit[]): PlaceHit[] {
  const seen = new Set<string>();
  const out: PlaceHit[] = [];
  for (const h of hits) {
    const key = `${h.label.toLowerCase().slice(0, 40)}|${h.latitude.toFixed(4)}|${h.longitude.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function searchGoogle(
  q: string,
  lat: number | null,
  lng: number | null,
  limit: number,
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  const key = googleKey();
  if (!key) return [];

  // Prefer Places API (New) Text Search — much better POI coverage in Pakistan
  try {
    const body: Record<string, unknown> = {
      textQuery: q,
      regionCode: "PK",
      languageCode: "en",
      maxResultCount: limit,
    };
    if (lat != null && lng != null && isValidCoordinate(lat, lng)) {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 80_000,
        },
      };
    }

    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
        }>;
      };
      const hits: PlaceHit[] = [];
      for (const p of data.places ?? []) {
        const plat = p.location?.latitude;
        const plng = p.location?.longitude;
        if (plat == null || plng == null || !isValidCoordinate(plat, plng)) continue;
        hits.push({
          id: p.id ?? `g-${plat},${plng}`,
          label: p.displayName?.text || "Place",
          secondary: p.formattedAddress,
          latitude: plat,
          longitude: plng,
          source: "google",
        });
      }
      if (hits.length > 0) return hits;
    }
  } catch {
    /* try legacy below */
  }

  // Legacy Places Text Search fallback
  try {
    const params = new URLSearchParams({
      query: q,
      region: "pk",
      key,
    });
    if (lat != null && lng != null && isValidCoordinate(lat, lng)) {
      params.set("location", `${lat},${lng}`);
      params.set("radius", "80000");
    }
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?${params}`,
      { signal },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{
        place_id?: string;
        name?: string;
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
      }>;
      status?: string;
    };
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      return [];
    }
    const hits: PlaceHit[] = [];
    for (const r of data.results ?? []) {
      const plat = r.geometry?.location?.lat;
      const plng = r.geometry?.location?.lng;
      if (plat == null || plng == null || !isValidCoordinate(plat, plng)) continue;
      hits.push({
        id: r.place_id ?? `gl-${plat},${plng}`,
        label: r.name || "Place",
        secondary: r.formatted_address,
        latitude: plat,
        longitude: plng,
        source: "google",
      });
    }
    return hits.slice(0, limit);
  } catch {
    return [];
  }
}

async function searchPhoton(
  q: string,
  lat: number | null,
  lng: number | null,
  limit: number,
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      lang: "en",
    });
    if (lat != null && lng != null && isValidCoordinate(lat, lng)) {
      params.set("lat", String(lat));
      params.set("lon", String(lng));
    }
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          osm_id?: number | string;
          name?: string;
          street?: string;
          city?: string;
          state?: string;
          country?: string;
          countrycode?: string;
          type?: string;
        };
      }>;
    };

    const hits: PlaceHit[] = [];
    for (const f of data.features ?? []) {
      const coords = f.geometry?.coordinates;
      const props = f.properties ?? {};
      if (!coords || coords.length < 2) continue;
      const plng = coords[0];
      const plat = coords[1];
      if (!isValidCoordinate(plat, plng)) continue;
      // Prefer PK results when country is known
      const cc = (props.countrycode || "").toLowerCase();
      if (cc && cc !== "pk") continue;
      const label = props.name || props.street || "Place";
      const secondary = [props.street, props.city, props.state, props.country]
        .filter(Boolean)
        .filter((p) => p !== label)
        .join(", ");
      hits.push({
        id: `ph-${props.osm_id ?? `${plat},${plng}`}`,
        label,
        secondary: secondary || undefined,
        latitude: plat,
        longitude: plng,
        source: "photon",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

async function searchNominatim(
  q: string,
  lat: number | null,
  lng: number | null,
  limit: number,
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  try {
    const enriched = /pakistan|pk\b/i.test(q) ? q : `${q}, Pakistan`;
    const params = new URLSearchParams({
      format: "jsonv2",
      q: enriched,
      countrycodes: "pk",
      addressdetails: "1",
      namedetails: "1",
      limit: String(limit),
      "accept-language": "en",
    });
    if (lat != null && lng != null && isValidCoordinate(lat, lng)) {
      // Soft bias around current map pin (~1° box ≈ city region)
      const d = 0.45;
      params.set("viewbox", `${lng - d},${lat + d},${lng + d},${lat - d}`);
      params.set("bounded", "0");
    }
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        signal,
        headers: {
          Accept: "application/json",
          "User-Agent": `TrendsMart/1.0 (${getPublicAppUrl()})`,
        },
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id?: number | string;
      lat?: string;
      lon?: string;
      display_name?: string;
      name?: string;
      address?: Record<string, string | undefined>;
    }>;

    const hits: PlaceHit[] = [];
    for (const [idx, row] of (data ?? []).entries()) {
      const plat = Number(row.lat);
      const plng = Number(row.lon);
      if (!isValidCoordinate(plat, plng)) continue;
      const addr = row.address ?? {};
      const label =
        row.name ||
        addr.amenity ||
        addr.shop ||
        addr.road ||
        addr.suburb ||
        addr.neighbourhood ||
        addr.city ||
        addr.town ||
        row.display_name?.split(",")[0] ||
        "Place";
      const secondary =
        row.display_name && row.display_name !== label
          ? row.display_name
          : [addr.suburb || addr.neighbourhood, addr.city || addr.town]
              .filter(Boolean)
              .join(", ");
      hits.push({
        id: String(row.place_id ?? `nm-${plat},${plng},${idx}`),
        label,
        secondary: secondary || undefined,
        latitude: plat,
        longitude: plng,
        source: "nominatim",
      });
    }
    return hits;
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [], provider: null });
  }

  const latRaw = req.nextUrl.searchParams.get("lat");
  const lngRaw = req.nextUrl.searchParams.get("lng");
  const lat = latRaw != null ? Number(latRaw) : null;
  const lng = lngRaw != null ? Number(lngRaw) : null;
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit") || 8) || 8, 1),
    12,
  );

  const signal = req.signal;
  const hasGoogle = Boolean(googleKey());

  // Google first when configured (matches Google Maps POI coverage)
  if (hasGoogle) {
    const googleHits = await searchGoogle(q, lat, lng, limit, signal);
    if (googleHits.length > 0) {
      return NextResponse.json({
        results: googleHits,
        provider: "google",
        tip: null,
      });
    }
  }

  // Free fallbacks — better than Nominatim alone, still weaker than Google for shops
  const [photon, nominatim] = await Promise.all([
    searchPhoton(q, lat, lng, limit, signal),
    searchNominatim(q, lat, lng, limit, signal),
  ]);

  const merged = dedupe([...photon, ...nominatim]).slice(0, limit);

  return NextResponse.json({
    results: merged,
    provider: merged[0]?.source ?? null,
    tip: hasGoogle
      ? "No Google results for this query — try a fuller name or nearby landmark."
      : "Try a fuller name or nearby landmark.",
  });
}
