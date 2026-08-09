"use client";

/* -------------------------------------------------------------------------- */
/*  Compact Leaflet pin map — click or drag to set exact customer location     */
/* -------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface LocationMiniMapProps {
  latitude: number;
  longitude: number;
  onPick: (lat: number, lng: number) => void;
  className?: string;
  /** Compact height for dropdown panels */
  heightClassName?: string;
}

const DEFAULT_ZOOM = 16;

function makePinIcon() {
  return L.divIcon({
    className: "tm-map-pin",
    html: `<div style="
      width:28px;height:28px;margin-left:-14px;margin-top:-28px;
      display:flex;align-items:flex-end;justify-content:center;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.35));
      font-size:26px;line-height:1;pointer-events:none;
    ">📍</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export default function LocationMiniMap({
  latitude,
  longitude,
  onPick,
  className = "",
  heightClassName = "h-40",
}: LocationMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView([latitude, longitude], DEFAULT_ZOOM);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const marker = L.marker([latitude, longitude], {
      draggable: true,
      icon: makePinIcon(),
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

    mapRef.current = map;
    markerRef.current = marker;

    // Leaflet needs a tick after mount in animated panels
    const t = window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once
  }, []);

  // Sync external coordinate changes (e.g. GPS refresh)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const current = marker.getLatLng();
    if (
      Math.abs(current.lat - latitude) < 0.00001 &&
      Math.abs(current.lng - longitude) < 0.00001
    ) {
      return;
    }
    marker.setLatLng([latitude, longitude]);
    map.setView([latitude, longitude], map.getZoom(), { animate: true });
  }, [latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700 ${className}`}>
      <div
        ref={containerRef}
        className={`w-full ${heightClassName} z-0 bg-zinc-100 dark:bg-zinc-800`}
        role="application"
        aria-label="Tap the map to set your exact pin"
      />
      <p className="bg-zinc-50 px-2.5 py-1.5 text-[0.6rem] text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-400">
        Tap map or drag the pin · then address updates automatically
      </p>
    </div>
  );
}
