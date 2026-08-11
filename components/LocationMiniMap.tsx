"use client";

/* -------------------------------------------------------------------------- */
/*  Full / compact Leaflet map — Daraz-style center pin or drag marker         */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface LocationMiniMapProps {
  latitude: number;
  longitude: number;
  onPick: (lat: number, lng: number) => void;
  className?: string;
  heightClassName?: string;
  /**
   * fullscreen = map fills parent, fixed center pin, pan to adjust (Daraz-style)
   * compact = small card with draggable pin
   */
  mode?: "fullscreen" | "compact";
  /** Live GPS fix — blue accuracy circle + dot (shows where you actually are). */
  gpsFix?: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
  } | null;
  /** Bump this after open / layout change so Leaflet recalculates size. */
  resizeKey?: string | number | boolean;
}

const STREET_ZOOM = 17;
const CITY_ZOOM = 14;

function makeDeliveryPinIcon() {
  return L.divIcon({
    className: "tm-map-pin",
    html: `<div style="
      width:36px;height:36px;margin-left:-18px;margin-top:-36px;
      display:flex;align-items:flex-end;justify-content:center;
      filter:drop-shadow(0 3px 6px rgba(0,0,0,.4));
      font-size:34px;line-height:1;pointer-events:none;
    ">📍</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
  });
}

function makeGpsDotIcon() {
  return L.divIcon({
    className: "tm-gps-dot",
    html: `<div style="
      width:18px;height:18px;margin-left:-9px;margin-top:-9px;
      border-radius:9999px;background:#2563eb;
      border:3px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,.35),0 2px 6px rgba(0,0,0,.25);
      pointer-events:none;
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function LocationMiniMap({
  latitude,
  longitude,
  onPick,
  className = "",
  heightClassName = "h-40",
  mode = "compact",
  gpsFix = null,
  resizeKey,
}: LocationMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsCircleRef = useRef<L.Circle | null>(null);
  const onPickRef = useRef(onPick);
  const suppressMoveEnd = useRef(false);

  const isFullscreen = mode === "fullscreen";

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: !isFullscreen,
      scrollWheelZoom: true,
      dragging: true,
      tapTolerance: 15,
    }).setView([latitude, longitude], STREET_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    if (isFullscreen) {
      // Daraz-style: pin is CSS-fixed in center; map pans underneath
      map.on("moveend", () => {
        if (suppressMoveEnd.current) return;
        const c = map.getCenter();
        onPickRef.current(c.lat, c.lng);
      });
    } else {
      const marker = L.marker([latitude, longitude], {
        draggable: true,
        icon: makeDeliveryPinIcon(),
        autoPan: true,
      }).addTo(map);

      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onPickRef.current(pos.lat, pos.lng);
      });

      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        onPickRef.current(e.latlng.lat, e.latlng.lng);
      });

      markerRef.current = marker;
    }

    mapRef.current = map;

    const t = window.setTimeout(() => map.invalidateSize(), 100);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      gpsMarkerRef.current = null;
      gpsCircleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, [isFullscreen]);

  // Sync delivery pin / map center from parent (GPS confirm, city pick, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    suppressMoveEnd.current = true;
    if (isFullscreen) {
      const center = map.getCenter();
      if (
        Math.abs(center.lat - latitude) > 0.00005 ||
        Math.abs(center.lng - longitude) > 0.00005
      ) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), STREET_ZOOM), {
          animate: true,
        });
      }
    } else if (markerRef.current) {
      const current = markerRef.current.getLatLng();
      if (
        Math.abs(current.lat - latitude) > 0.00001 ||
        Math.abs(current.lng - longitude) > 0.00001
      ) {
        markerRef.current.setLatLng([latitude, longitude]);
        map.setView([latitude, longitude], map.getZoom(), { animate: true });
      }
    }
    window.setTimeout(() => {
      suppressMoveEnd.current = false;
    }, 400);
  }, [latitude, longitude, isFullscreen]);

  // GPS blue accuracy ring + dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!gpsFix) {
      gpsMarkerRef.current?.remove();
      gpsCircleRef.current?.remove();
      gpsMarkerRef.current = null;
      gpsCircleRef.current = null;
      return;
    }

    const { latitude: glat, longitude: glng, accuracyMeters } = gpsFix;

    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.marker([glat, glng], {
        icon: makeGpsDotIcon(),
        interactive: false,
        zIndexOffset: 500,
      }).addTo(map);
    } else {
      gpsMarkerRef.current.setLatLng([glat, glng]);
    }

    const radius =
      typeof accuracyMeters === "number" && accuracyMeters > 0
        ? Math.min(Math.max(accuracyMeters, 12), 120)
        : 35;

    if (!gpsCircleRef.current) {
      gpsCircleRef.current = L.circle([glat, glng], {
        radius,
        color: "#2563eb",
        weight: 1,
        opacity: 0.45,
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(map);
    } else {
      gpsCircleRef.current.setLatLng([glat, glng]);
      gpsCircleRef.current.setRadius(radius);
    }
  }, [gpsFix]);

  // Recalc size when sheet opens / layout changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.invalidateSize(), 80);
    const t2 = window.setTimeout(() => map.invalidateSize(), 320);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [resizeKey, isFullscreen]);

  if (isFullscreen) {
    return (
      <div className={`relative h-full w-full ${className}`}>
        <div
          ref={containerRef}
          className="absolute inset-0 z-0 bg-zinc-200 dark:bg-zinc-800"
          role="application"
          aria-label="Move the map to place your delivery pin"
        />
        {/* Fixed center delivery pin (Daraz-style) */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[400] -translate-x-1/2 -translate-y-full"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center">
            <span className="text-[2.35rem] leading-none drop-shadow-md">📍</span>
            <span className="mt-[-2px] h-1.5 w-1.5 rounded-full bg-zinc-900/40" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 ${className}`}
    >
      <div
        ref={containerRef}
        className={`w-full ${heightClassName} z-0 bg-zinc-100 dark:bg-zinc-800`}
        role="application"
        aria-label="Tap the map to set your exact pin"
      />
      <p className="bg-zinc-50 px-2.5 py-1.5 text-[0.6rem] text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-400">
        Tap map or drag the pin · address updates automatically
      </p>
    </div>
  );
}

export { STREET_ZOOM, CITY_ZOOM };
