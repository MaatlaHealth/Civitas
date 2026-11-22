import type { CrewSpecialization, IncidentCategory } from "@/lib/domain/categories";
import type { AssetImportance, AssetType, CrewStatus, ExposureLevel, ReportedDuration, SeverityLevel } from "@/lib/domain/types";

/**
 * TRAINING SCENARIO: SYNTHETIC DATA.
 *
 * Everything in this file is invented for training and evaluation. It is
 * never written to the operational database. The coordinates are placed in
 * the open South Atlantic Ocean (around 33°S, 5°E) on purpose, so no point
 * can be mistaken for a real street, asset or municipality. The scenario is
 * drawn on a plain schematic grid rather than a street map for the same
 * reason.
 *
 * The scenario supplies only raw inputs. Duplicate candidates, priority
 * scores, consequence screening and crew plans are all computed at run time
 * by the same engines the live application uses.
 */
export const SCENARIO_ORIGIN = { latitude: -33.0, longitude: 5.0 };

/** The fixed "current time" of the scenario, so results never drift. */
export const SCENARIO_EVALUATED_AT = "2026-03-16T08:00:00.000Z";

const KM_PER_DEGREE_LATITUDE = 111.32;
const KM_PER_DEGREE_LONGITUDE = KM_PER_DEGREE_LATITUDE * Math.cos((SCENARIO_ORIGIN.latitude * Math.PI) / 180);

/** Converts a position on the scenario grid (km east and north of the origin) to coordinates. */
function gridPosition(eastKm: number, northKm: number) {
  return {
    eastKm,
    northKm,
    latitude: SCENARIO_ORIGIN.latitude + northKm / KM_PER_DEGREE_LATITUDE,
    longitude: SCENARIO_ORIGIN.longitude + eastKm / KM_PER_DEGREE_LONGITUDE,
  };
}

export interface ScenarioReport {
  id: string;
  category: IncidentCategory;
  title: string;
  description: string;
  eastKm: number;
  northKm: number;
  latitude: number;
  longitude: number;
  reportedAt: string;
  obstructsAccess: boolean | null;
  reportedDuration: ReportedDuration;
  hasPhotograph: boolean;
  /** Scenario assumption: the coordinator has verified this report. */
  coordinatorVerified: boolean;
  confirmedSeverity: SeverityLevel | null;
  exposureLevel: ExposureLevel | null;
}

function report(
  id: string,
  category: IncidentCategory,
  position: [number, number],
  reportedAt: string,
  title: string,
  description: string,
  details: Partial<Pick<ScenarioReport, "obstructsAccess" | "reportedDuration" | "hasPhotograph" | "confirmedSeverity" | "exposureLevel">> = {},
): ScenarioReport {
  return {
    id,
    category,
    title,
    description,
    ...gridPosition(position[0], position[1]),
    reportedAt,
    obstructsAccess: details.obstructsAccess ?? null,
    reportedDuration: details.reportedDuration ?? "unknown",
    hasPhotograph: details.hasPhotograph ?? false,
    coordinatorVerified: true,
    confirmedSeverity: details.confirmedSeverity ?? null,
    exposureLevel: details.exposureLevel ?? null,
  };
}

export const SCENARIO_REPORTS: readonly ScenarioReport[] = [
  report("T-01", "water_leak", [0.5, 0.8], "2026-03-16T06:10:00.000Z",
    "Burst water pipe flooding the road",
    "A pipe has burst under the road and water is gushing out strongly across both lanes. The road surface is starting to lift.",
    { obstructsAccess: true, reportedDuration: "today", hasPhotograph: true, confirmedSeverity: "high" }),
  report("T-02", "water_leak", [0.53, 0.82], "2026-03-16T06:40:00.000Z",
    "Water gushing out of the road",
    "Water is gushing strongly from a burst pipe in the road and running across both lanes towards the corner.",
    { obstructsAccess: true, reportedDuration: "today" }),
  report("T-03", "pothole", [-2.0, 1.5], "2026-03-15T15:00:00.000Z",
    "Deep pothole in the left lane",
    "A deep pothole has opened in the left lane. Cars are swerving into the oncoming lane to avoid it.",
    { obstructsAccess: false, reportedDuration: "days", hasPhotograph: true }),
  report("T-04", "blocked_drain", [1.8, -1.2], "2026-03-15T09:00:00.000Z",
    "Stormwater drain blocked with debris",
    "The stormwater drain at the corner is completely blocked with sand and debris and water is ponding around it.",
    { obstructsAccess: false, reportedDuration: "weeks" }),
  report("T-05", "streetlight", [-0.8, -2.2], "2026-03-14T18:30:00.000Z",
    "Streetlight out at the crossing",
    "The streetlight above the pedestrian crossing has been out for several nights and the crossing is very dark.",
    { reportedDuration: "days" }),
  report("T-06", "flooding", [1.87, -1.15], "2026-03-16T07:15:00.000Z",
    "Road flooded after overnight rain",
    "The road is covered in standing water after the rain and small cars cannot get through. The water is not draining away.",
    { obstructsAccess: true, reportedDuration: "today", hasPhotograph: true, confirmedSeverity: "high" }),
  report("T-07", "exposed_electrical", [-1.5, -0.5], "2026-03-16T07:40:00.000Z",
    "Exposed cables at open electrical box",
    "An electrical box on the pavement has been broken open and live-looking cables are exposed at child height.",
    { hasPhotograph: true, confirmedSeverity: "critical", exposureLevel: "high" }),
  report("T-08", "sidewalk", [0.2, 2.4], "2026-03-13T10:00:00.000Z",
    "Broken paving on the sidewalk",
    "Several paving slabs are broken and lifted on the sidewalk, making it hard to pass with a wheelchair or pram.",
    { obstructsAccess: true, reportedDuration: "longer" }),
  report("T-09", "pothole", [3.0, 2.0], "2026-03-15T11:00:00.000Z",
    "Pothole forming near the bus stop",
    "A pothole is forming in the road surface near the bus stop and is getting bigger each day.",
    { obstructsAccess: false, reportedDuration: "weeks" }),
];

export interface ScenarioAsset {
  id: string;
  name: string;
  assetType: AssetType;
  importance: AssetImportance;
  verified: boolean;
  source: string;
  eastKm: number;
  northKm: number;
  latitude: number;
  longitude: number;
}

const SYNTHETIC_SOURCE = "Synthetic training record (not a real asset)";

export const SCENARIO_ASSETS: readonly ScenarioAsset[] = [
  { id: "A-01", name: "Training Pumping Station", assetType: "water_pumping_station", importance: "critical", verified: true, source: SYNTHETIC_SOURCE, ...gridPosition(0.55, 0.9) },
  { id: "A-02", name: "Training Primary School", assetType: "school", importance: "important", verified: true, source: SYNTHETIC_SOURCE, ...gridPosition(-1.4, -0.45) },
  { id: "A-03", name: "Training Substation", assetType: "substation", importance: "critical", verified: false, source: SYNTHETIC_SOURCE, ...gridPosition(2.0, -1.1) },
];

export interface ScenarioCrew {
  id: string;
  name: string;
  specialization: CrewSpecialization;
  status: CrewStatus;
  capacity: number;
  activeWorkload: number;
  eastKm: number;
  northKm: number;
  baseLatitude: number;
  baseLongitude: number;
}

function crew(id: string, name: string, specialization: CrewSpecialization, position: [number, number], capacity: number): ScenarioCrew {
  const base = gridPosition(position[0], position[1]);
  return {
    id,
    name,
    specialization,
    status: "available",
    capacity,
    activeWorkload: 0,
    eastKm: base.eastKm,
    northKm: base.northKm,
    baseLatitude: base.latitude,
    baseLongitude: base.longitude,
  };
}

export const SCENARIO_CREWS: readonly ScenarioCrew[] = [
  crew("C-01", "Water Team", "water_infrastructure", [0, 0], 2),
  crew("C-02", "Roads Team North", "road_maintenance", [-1.0, 1.0], 2),
  crew("C-03", "Roads Team East", "road_maintenance", [2.5, 1.5], 1),
  crew("C-04", "Drainage Team", "drainage", [1.5, -2.0], 2),
  crew("C-05", "Electrical Team", "electrical", [-2.5, -2.5], 2),
  crew("C-06", "General Maintenance Team", "general_maintenance", [0.5, 2.0], 1),
];

export const SCENARIO_NAME = "Training scenario: one morning, nine reports, six crews";
