import type { GeoPoint } from "@/lib/domain/types";

const EARTH_RADIUS_METERS = 6_371_008.8; // IUGG mean Earth radius
// Derived from the same radius as the distance formula so the two always agree.
const METERS_PER_DEGREE_LATITUDE = (EARTH_RADIUS_METERS * Math.PI) / 180;
/** Slight enlargement so rounding can never push an in-radius point outside the box. */
const BOUNDING_BOX_MARGIN = 1.001;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/** Great-circle (straight-line over the surface) distance in metres. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const deltaLat = toRadians(b.latitude - a.latitude);
  const deltaLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/**
 * A latitude/longitude box that fully contains the circle of the given
 * radius. Used as a cheap, index-friendly prefilter before exact Haversine
 * distances are computed. It does not handle the antimeridian or the poles,
 * which is acceptable for city-scale radii.
 */
export function boundingBox(center: GeoPoint, radiusMeters: number): BoundingBox {
  const paddedRadius = radiusMeters * BOUNDING_BOX_MARGIN;
  const latitudeDelta = paddedRadius / METERS_PER_DEGREE_LATITUDE;
  // Use the latitude of the box edge furthest from the equator, where a degree of longitude is shortest.
  const widestLatitude = Math.min(89.9, Math.abs(center.latitude) + latitudeDelta);
  const cosLatitude = Math.max(Math.cos(toRadians(widestLatitude)), 0.01);
  const longitudeDelta = paddedRadius / (METERS_PER_DEGREE_LATITUDE * cosLatitude);
  return {
    minLatitude: center.latitude - latitudeDelta,
    maxLatitude: center.latitude + latitudeDelta,
    minLongitude: center.longitude - longitudeDelta,
    maxLongitude: center.longitude + longitudeDelta,
  };
}

export function formatDistance(meters: number): string {
  const wholeMeters = Math.round(meters);
  if (wholeMeters < 1000) return `${wholeMeters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
