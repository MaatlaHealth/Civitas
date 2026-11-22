/**
 * Incident categories and the engineering assumptions attached to each one.
 *
 * Every numeric value here is an initial configuration assumption made for
 * this project. None of them is a verified municipal standard. They are kept
 * in one place so an operating organisation can review and change them.
 */

export const INCIDENT_CATEGORIES = [
  "pothole",
  "water_leak",
  "blocked_drain",
  "flooding",
  "structural",
  "streetlight",
  "exposed_electrical",
  "sidewalk",
  "illegal_dumping",
  "other",
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const CREW_SPECIALIZATIONS = [
  "road_maintenance",
  "water_infrastructure",
  "drainage",
  "electrical",
  "general_maintenance",
  "structural_inspection",
] as const;

export type CrewSpecialization = (typeof CREW_SPECIALIZATIONS)[number];

export const SPECIALIZATION_LABELS: Record<CrewSpecialization, string> = {
  road_maintenance: "Road maintenance",
  water_infrastructure: "Water infrastructure",
  drainage: "Drainage",
  electrical: "Electrical maintenance",
  general_maintenance: "General maintenance",
  structural_inspection: "Structural inspection",
};

export interface CategoryDefinition {
  label: string;
  description: string;
  severityGuidance: string;
  /** Shown to citizens when the category can involve immediate danger. */
  urgentAdvice: boolean;
  /** Baseline hazard severity in [0, 1]; null when it cannot be assumed. */
  baseHazard: number | null;
  /** Baseline potential for service disruption in [0, 1]; null when unknown. */
  baseServiceImpact: number | null;
  /** How quickly the condition tends to worsen, in [0, 1]. */
  timeSensitivity: number;
  /** Search radius in metres for possible duplicate reports. */
  duplicateRadiusMeters: number;
  /** Crew specialisations qualified to respond. */
  qualifiedSpecializations: readonly CrewSpecialization[];
}

export const CATEGORY_DEFINITIONS: Record<IncidentCategory, CategoryDefinition> = {
  pothole: {
    label: "Pothole or road surface damage",
    description: "Holes, cracks or collapsed sections in a road surface.",
    severityGuidance: "More serious when deep, on a busy road, or forcing vehicles to swerve.",
    urgentAdvice: false,
    baseHazard: 0.45,
    baseServiceImpact: 0.35,
    timeSensitivity: 0.4,
    duplicateRadiusMeters: 35,
    qualifiedSpecializations: ["road_maintenance", "general_maintenance"],
  },
  water_leak: {
    label: "Water leak or burst pipe",
    description: "Water escaping from a pipe, meter, hydrant or valve.",
    severityGuidance: "More serious when water is flowing strongly, undermining a road or entering property.",
    urgentAdvice: true,
    baseHazard: 0.5,
    baseServiceImpact: 0.7,
    timeSensitivity: 0.7,
    duplicateRadiusMeters: 75,
    qualifiedSpecializations: ["water_infrastructure"],
  },
  blocked_drain: {
    label: "Blocked drain",
    description: "A stormwater drain or inlet that is blocked or overflowing.",
    severityGuidance: "More serious before or during rain, or when sewage is involved.",
    urgentAdvice: false,
    baseHazard: 0.35,
    baseServiceImpact: 0.45,
    timeSensitivity: 0.45,
    duplicateRadiusMeters: 50,
    qualifiedSpecializations: ["drainage"],
  },
  flooding: {
    label: "Localised flooding",
    description: "Standing or flowing water covering a road, walkway or public space.",
    severityGuidance: "More serious when water is deep, moving, or blocking the only access route.",
    urgentAdvice: true,
    baseHazard: 0.7,
    baseServiceImpact: 0.65,
    timeSensitivity: 0.85,
    duplicateRadiusMeters: 150,
    qualifiedSpecializations: ["drainage", "water_infrastructure"],
  },
  structural: {
    label: "Damaged bridge or structure",
    description: "Visible damage to a bridge, culvert, retaining wall or similar structure.",
    severityGuidance: "Any visible cracking, movement or fallen material should be inspected by a qualified person.",
    urgentAdvice: true,
    baseHazard: 0.85,
    baseServiceImpact: 0.8,
    timeSensitivity: 0.7,
    duplicateRadiusMeters: 60,
    qualifiedSpecializations: ["structural_inspection"],
  },
  streetlight: {
    label: "Streetlight failure",
    description: "A streetlight that is off, flickering or damaged.",
    severityGuidance: "More serious when several lights are out or at a crossing.",
    urgentAdvice: false,
    baseHazard: 0.3,
    baseServiceImpact: 0.25,
    timeSensitivity: 0.3,
    duplicateRadiusMeters: 25,
    qualifiedSpecializations: ["electrical"],
  },
  exposed_electrical: {
    label: "Exposed electrical infrastructure",
    description: "Exposed cables, open electrical boxes or fallen power lines.",
    severityGuidance: "Always treat as dangerous. Keep well away and do not touch anything.",
    urgentAdvice: true,
    baseHazard: 1,
    baseServiceImpact: 0.6,
    timeSensitivity: 1,
    duplicateRadiusMeters: 30,
    qualifiedSpecializations: ["electrical"],
  },
  sidewalk: {
    label: "Damaged sidewalk",
    description: "Broken paving, missing covers or obstructions on a walkway.",
    severityGuidance: "More serious where it forces pedestrians into the road or blocks wheelchair access.",
    urgentAdvice: false,
    baseHazard: 0.35,
    baseServiceImpact: 0.2,
    timeSensitivity: 0.25,
    duplicateRadiusMeters: 30,
    qualifiedSpecializations: ["road_maintenance", "general_maintenance"],
  },
  illegal_dumping: {
    label: "Illegal dumping affecting infrastructure",
    description: "Dumped waste blocking roads, drains, walkways or other infrastructure.",
    severityGuidance: "More serious when it blocks drainage or contains hazardous material.",
    urgentAdvice: false,
    baseHazard: 0.25,
    baseServiceImpact: 0.2,
    timeSensitivity: 0.3,
    duplicateRadiusMeters: 60,
    qualifiedSpecializations: ["general_maintenance"],
  },
  other: {
    label: "Other infrastructure concern",
    description: "An infrastructure problem that does not fit the other categories.",
    severityGuidance: "Describe what you see as precisely as you can so a coordinator can classify it.",
    urgentAdvice: false,
    baseHazard: null,
    baseServiceImpact: null,
    timeSensitivity: 0.4,
    duplicateRadiusMeters: 50,
    qualifiedSpecializations: ["general_maintenance"],
  },
};

export function categoryLabel(category: IncidentCategory): string {
  return CATEGORY_DEFINITIONS[category].label;
}

export function isIncidentCategory(value: unknown): value is IncidentCategory {
  return typeof value === "string" && (INCIDENT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * Civitas is not an emergency service. This advice is shown wherever a
 * citizen selects a category that can involve immediate danger.
 */
export const URGENT_HAZARD_ADVICE =
  "Civitas is not an emergency service and reports are not monitored in real time. " +
  "If anyone is in immediate danger, keep away from the hazard and call your local emergency number " +
  "(in South Africa, 112 from a mobile phone or 10177).";
