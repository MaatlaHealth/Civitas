const numberFromEnv = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Public map settings. The default basemap is OpenFreeMap's hosted
 * OpenStreetMap style, which needs no API key. The default centre is
 * Johannesburg and can be changed per deployment.
 */
export const MAP_CONFIG = {
  styleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/positron",
  center: {
    latitude: numberFromEnv(process.env.NEXT_PUBLIC_MAP_CENTER_LAT, -26.2041),
    longitude: numberFromEnv(process.env.NEXT_PUBLIC_MAP_CENTER_LNG, 28.0473),
  },
  zoom: numberFromEnv(process.env.NEXT_PUBLIC_MAP_ZOOM, 11),
  /** Zoom used when focusing on a single point. */
  detailZoom: 16,
  /** Font available in the default style, used for cluster counts. */
  labelFont: ["Noto Sans Bold"],
};
