/**
 * Independent geometry helpers for tests. One degree of latitude on a sphere
 * of the IUGG mean radius (6 371 008.8 m) is R·π/180 ≈ 111 195.08 m.
 */
export const METERS_PER_DEGREE = (6_371_008.8 * Math.PI) / 180;

export interface Point {
  latitude: number;
  longitude: number;
}

/** Central Johannesburg; used as an arbitrary city-scale origin. */
export const ORIGIN: Point = { latitude: -26.2041, longitude: 28.0473 };

/** The point `meters` due north of `from` (negative for south). */
export function northOf(from: Point, meters: number): Point {
  return { latitude: from.latitude + meters / METERS_PER_DEGREE, longitude: from.longitude };
}

/** The point approximately `meters` due east of `from` (exact on the equator). */
export function eastOf(from: Point, meters: number): Point {
  const cos = Math.cos((from.latitude * Math.PI) / 180);
  return { latitude: from.latitude, longitude: from.longitude + meters / (METERS_PER_DEGREE * cos) };
}
