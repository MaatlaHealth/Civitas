"use client";

import dynamic from "next/dynamic";

/**
 * MapLibre is large and needs the browser, so every map is loaded on demand
 * and never rendered on the server.
 */
function MapPlaceholder() {
  return (
    <p className="flex h-56 items-center justify-center rounded-md border border-line bg-navy-50 text-sm text-ink-muted" role="status">
      Loading map
    </p>
  );
}

export const LazyPointMap = dynamic(() => import("./point-map").then((module) => module.PointMap), {
  ssr: false,
  loading: MapPlaceholder,
});

export const LazyOperationsMap = dynamic(() => import("./operations-map").then((module) => module.OperationsMap), {
  ssr: false,
  loading: MapPlaceholder,
});
