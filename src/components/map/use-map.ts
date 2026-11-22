"use client";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import { MAP_CONFIG } from "./map-config";

export type MapStatus = "loading" | "ready" | "error";

interface UseMapOptions {
  center?: { latitude: number; longitude: number };
  zoom?: number;
  interactive?: boolean;
}

/**
 * Creates a MapLibre map in the given container and reports whether the
 * basemap loaded. If the style or tiles cannot be fetched the status becomes
 * "error" so callers can show a fallback; every map in Civitas has a
 * non-map alternative.
 */
export function useMap(containerRef: RefObject<HTMLDivElement | null>, options: UseMapOptions = {}) {
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<MapStatus>("loading");
  // Initial view only; later changes are applied by the caller through the map instance.
  const initialOptions = useRef(options);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { center = MAP_CONFIG.center, zoom = MAP_CONFIG.zoom, interactive = true } = initialOptions.current;

    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container,
        style: MAP_CONFIG.styleUrl,
        center: [center.longitude, center.latitude],
        zoom,
        interactive,
        attributionControl: { compact: true },
      });
    } catch {
      // WebGL unavailable or blocked. Reported after the effect so the fallback renders on the next pass.
      queueMicrotask(() => setStatus("error"));
      return;
    }

    if (interactive) instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    let loaded = false;
    instance.on("load", () => {
      loaded = true;
      setStatus("ready");
      setMap(instance);
    });
    instance.on("error", () => {
      // Individual tile failures after load are tolerated; a failure before
      // the style has loaded means there is no usable map.
      if (!loaded) setStatus("error");
    });

    return () => {
      setMap(null);
      instance.remove();
    };
  }, [containerRef]);

  return { map, status };
}
