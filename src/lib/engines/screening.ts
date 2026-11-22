import type { IncidentCategory } from "@/lib/domain/categories";
import { ASSET_TYPE_LABELS, type AssetImportance, type AssetType, type GeoPoint } from "@/lib/domain/types";
import { formatDistance, haversineMeters } from "@/lib/geo/haversine";

/**
 * Infrastructure consequence screening.
 *
 * This is a proximity screen against assets that an organisation has
 * explicitly registered. It does not simulate networks, flows or structures,
 * and it never concludes that an asset is affected. Every finding is a
 * prompt for a coordinator to verify.
 */
export interface ScreeningConfig {
  /** Assets further than this from an incident are not listed. */
  radiusMeters: number;
}

export const DEFAULT_SCREENING_CONFIG: ScreeningConfig = { radiusMeters: 300 };

/**
 * Why a category of incident may be relevant to a type of asset. The absence
 * of a rule means Civitas has no stated reason to connect the two; the asset
 * is still listed as nearby, without a relevance note.
 */
const SCREENING_RULES: Partial<Record<IncidentCategory, Partial<Record<AssetType, string>>>> = {
  water_leak: {
    water_pumping_station: "A leak near a pumping station may relate to the water supply network it serves.",
    substation: "Escaping water near electrical equipment may create an electrical hazard.",
    hospital: "Health facilities depend on a continuous water supply.",
    major_intersection: "Water on or under a major intersection may affect traffic and the road base.",
  },
  flooding: {
    substation: "Flood water near electrical equipment may create an electrical hazard.",
    hospital: "Flooding may restrict access to a health facility.",
    emergency_facility: "Flooding may restrict emergency vehicle access.",
    major_intersection: "Flooding at a major intersection may disrupt traffic.",
    school: "Flooding may affect safe access for children.",
    bridge: "Flooding near a bridge may warrant inspection of its approaches.",
  },
  pothole: {
    hospital: "Road damage may affect an access route to a health facility.",
    emergency_facility: "Road damage may affect an emergency vehicle route.",
    major_intersection: "Road damage at a major intersection affects more road users.",
    school: "Road damage near a school affects child pedestrians and transport.",
  },
  blocked_drain: {
    major_intersection: "A blocked drain may cause water to pond at a major intersection.",
    substation: "Ponding water near electrical equipment may create an electrical hazard.",
    school: "Ponding water may affect safe access for children.",
  },
  structural: {
    bridge: "The report may concern this registered bridge or a structure near it.",
    major_intersection: "Structural damage near a major intersection affects more road users.",
    emergency_facility: "A structural restriction may affect an emergency vehicle route.",
    hospital: "A structural restriction may affect an access route to a health facility.",
  },
  streetlight: {
    school: "Poor lighting near a school affects pedestrian safety.",
    major_intersection: "Poor lighting at a major intersection affects road safety.",
    hospital: "Poor lighting affects night-time access to a health facility.",
  },
  exposed_electrical: {
    school: "Exposed electrical equipment near a school is a particular risk to children.",
    hospital: "Exposed electrical equipment near a health facility affects many visitors.",
    substation: "The report may concern equipment associated with this substation.",
  },
  sidewalk: {
    school: "Walkway damage near a school affects child pedestrians.",
    hospital: "Walkway damage near a health facility affects people with limited mobility.",
  },
  illegal_dumping: {
    water_pumping_station: "Dumped material may obstruct access to water infrastructure.",
    school: "Dumped material near a school may be a health concern.",
  },
};

export interface ScreeningAsset extends GeoPoint {
  id: string;
  name: string;
  assetType: AssetType;
  importance: AssetImportance;
  verified: boolean;
  source: string;
}

export interface ScreeningFinding {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  importance: AssetImportance;
  verified: boolean;
  source: string;
  distanceMeters: number;
  /** Null when no screening rule connects this category to this asset type. */
  relevance: string | null;
  statement: string;
}

export interface ScreeningResult {
  radiusMeters: number;
  findings: ScreeningFinding[];
}

export const SCREENING_CAVEAT =
  "Proximity alone does not establish a service impact. Coordinator verification required.";

export function screenConsequences(
  incident: GeoPoint & { category: IncidentCategory },
  assets: readonly ScreeningAsset[],
  config: ScreeningConfig = DEFAULT_SCREENING_CONFIG,
): ScreeningResult {
  const rules = SCREENING_RULES[incident.category] ?? {};
  const findings = assets
    .map((asset) => ({ asset, distanceMeters: haversineMeters(incident, asset) }))
    .filter(({ distanceMeters }) => distanceMeters <= config.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .map(({ asset, distanceMeters }): ScreeningFinding => {
      const relevance = rules[asset.assetType] ?? null;
      const registryStatus = asset.verified ? "verified registry entry" : "unverified registry entry";
      return {
        assetId: asset.id,
        assetName: asset.name,
        assetType: asset.assetType,
        importance: asset.importance,
        verified: asset.verified,
        source: asset.source,
        distanceMeters: Math.round(distanceMeters * 10) / 10,
        relevance,
        statement:
          `The incident is ${formatDistance(distanceMeters)} (straight line) from ${asset.name} ` +
          `(${ASSET_TYPE_LABELS[asset.assetType].toLowerCase()}, ${registryStatus}). ` +
          `${relevance ?? "No screening rule connects this incident category to this asset type."} ` +
          SCREENING_CAVEAT,
      };
    });
  return { radiusMeters: config.radiusMeters, findings };
}
