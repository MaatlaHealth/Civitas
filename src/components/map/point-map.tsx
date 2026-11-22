"use client";

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";
import { MAP_CONFIG } from "./map-config";
import { useMap } from "./use-map";

interface PointMapProps {
  latitude: number;
  longitude: number;
  label: string;
}

/** A small map showing one location. The coordinates are always shown as text beneath it. */
export function PointMap({ latitude, longitude, label }: PointMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, status } = useMap(containerRef, { center: { latitude, longitude }, zoom: MAP_CONFIG.detailZoom });

  useEffect(() => {
    if (!map) return;
    const marker = new maplibregl.Marker({ color: "#f59a13" }).setLngLat([longitude, latitude]).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, latitude, longitude]);

  return (
    <figure>
      <div className="relative overflow-hidden rounded-md border border-line bg-navy-50">
        <div ref={containerRef} className="h-56 w-full" role="img" aria-label={`Map showing ${label}`} />
        {status === "error" ? (
          <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-ink-muted">
            The map could not be loaded. Use the coordinates below.
          </p>
        ) : null}
      </div>
      <figcaption className="mt-1.5 text-xs text-ink-muted">
        {latitude.toFixed(6)}, {longitude.toFixed(6)}{" "}
        <a
          className="font-medium text-teal-700 underline underline-offset-2"
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in OpenStreetMap
        </a>
      </figcaption>
    </figure>
  );
}
