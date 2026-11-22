import { AppError } from "@/lib/errors";
import { isValidCoordinate } from "@/lib/geo/haversine";
import { logger } from "@/lib/logger";

/**
 * Address suggestions from Photon, a public search service built on
 * OpenStreetMap data. Requests go through this server so the reporter's
 * browser never contacts the service directly. Suggestions are a convenience
 * for finding the right spot on the map; the reporter still confirms the
 * marker position, and nothing here is treated as a verified address.
 */
const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";
const REQUEST_TIMEOUT_MS = 4_000;
const MAX_SUGGESTIONS = 5;
export const MIN_QUERY_LENGTH = 3;
export const MAX_QUERY_LENGTH = 120;

export interface AddressSuggestion {
  label: string;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Partial<Record<"name" | "housenumber" | "street" | "locality" | "city" | "state" | "country", string>>;
}

function buildLabel(properties: NonNullable<PhotonFeature["properties"]>): string {
  const street = [properties.housenumber, properties.street].filter(Boolean).join(" ");
  const parts = [properties.name, street, properties.locality, properties.city, properties.state, properties.country];
  // Drop empty parts and repeats such as a street whose name equals its street field.
  return parts.filter((part, index): part is string => Boolean(part) && parts.indexOf(part) === index).join(", ");
}

export async function suggestAddresses(
  query: string,
  near: { latitude: number; longitude: number },
): Promise<AddressSuggestion[]> {
  const url = new URL(PHOTON_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(MAX_SUGGESTIONS));
  url.searchParams.set("lang", "en");
  url.searchParams.set("lat", String(near.latitude));
  url.searchParams.set("lon", String(near.longitude));

  let features: PhotonFeature[];
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    features = ((await response.json()) as { features?: PhotonFeature[] }).features ?? [];
  } catch (error) {
    logger.warn("geocoding.unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    throw new AppError("unavailable", "Address suggestions are unavailable right now. Place the marker on the map instead.");
  }

  const suggestions: AddressSuggestion[] = [];
  for (const feature of features) {
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    const label = feature.properties ? buildLabel(feature.properties) : "";
    if (latitude === undefined || longitude === undefined || !isValidCoordinate(latitude, longitude) || !label) continue;
    if (suggestions.some((existing) => existing.label === label)) continue;
    suggestions.push({ label, latitude, longitude });
  }
  return suggestions;
}
