import { CATEGORY_DEFINITIONS, categoryLabel, type IncidentCategory } from "@/lib/domain/categories";
import type { GeoPoint } from "@/lib/domain/types";
import { formatDistance, haversineMeters } from "@/lib/geo/haversine";
import { descriptionSimilarity } from "./text-similarity";

/**
 * Duplicate detection: S = wG·G + wC·C + wT·T + wD·D
 *
 *   G  geographic proximity   1 at the same point, falling linearly to 0 at the search radius
 *   C  category compatibility 1 for the same category, a configured value for related ones
 *   T  temporal proximity     halves for every `temporalHalfLifeHours` between submissions
 *   D  description similarity Jaccard index of the reports' vocabularies
 *
 * All four components are in [0, 1], so S is in [0, 1]. Pairs outside the
 * search radius or with incompatible categories are never candidates,
 * whatever their other components. The weights and threshold are initial
 * engineering assumptions, not validated against municipal data.
 */
export interface DuplicateConfig {
  weights: { geographic: number; category: number; temporal: number; description: number };
  /** Minimum composite score for a pair to be raised for coordinator review. */
  candidateThreshold: number;
  temporalHalfLifeHours: number;
}

export const DEFAULT_DUPLICATE_CONFIG: DuplicateConfig = {
  weights: { geographic: 0.4, category: 0.25, temporal: 0.2, description: 0.15 },
  candidateThreshold: 0.55,
  temporalHalfLifeHours: 72,
};

/**
 * Compatibility of different categories that can describe one physical
 * problem (for example a burst pipe reported by one person as a leak and by
 * another as flooding). Pairs not listed are incompatible.
 */
const RELATED_CATEGORY_COMPATIBILITY: ReadonlyArray<readonly [IncidentCategory, IncidentCategory, number]> = [
  ["water_leak", "flooding", 0.6],
  ["blocked_drain", "flooding", 0.7],
  ["pothole", "sidewalk", 0.3],
  ["streetlight", "exposed_electrical", 0.4],
  ["illegal_dumping", "blocked_drain", 0.4],
];

export function categoryCompatibility(a: IncidentCategory, b: IncidentCategory): number {
  if (a === b) return a === "other" ? 0.5 : 1;
  const related = RELATED_CATEGORY_COMPATIBILITY.find(
    ([first, second]) => (first === a && second === b) || (first === b && second === a),
  );
  return related ? related[2] : 0;
}

/** The pair's search radius is the larger of the two categories' radii. */
export function searchRadiusMeters(a: IncidentCategory, b: IncidentCategory): number {
  return Math.max(CATEGORY_DEFINITIONS[a].duplicateRadiusMeters, CATEGORY_DEFINITIONS[b].duplicateRadiusMeters);
}

export function maxSearchRadiusMeters(): number {
  return Math.max(...Object.values(CATEGORY_DEFINITIONS).map((definition) => definition.duplicateRadiusMeters));
}

export interface DuplicateSubject extends GeoPoint {
  id: string;
  category: IncidentCategory;
  title: string;
  description: string;
  reportedAt: Date;
}

export interface DuplicateComponents {
  geographic: number;
  category: number;
  temporal: number;
  description: number;
}

export interface DuplicateMatch {
  incidentId: string;
  otherIncidentId: string;
  score: number;
  distanceMeters: number;
  hoursApart: number;
  radiusMeters: number;
  components: DuplicateComponents;
  explanation: string;
}

const round = (value: number, places = 3): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function describeTimeGap(hours: number): string {
  if (hours < 1) return "less than an hour apart";
  if (hours < 48) return `about ${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"} apart`;
  return `about ${Math.round(hours / 24)} days apart`;
}

function describeVocabulary(similarity: number): string {
  if (similarity >= 0.4) return "use similar wording";
  if (similarity >= 0.15) return "share some wording";
  return "are worded differently";
}

/**
 * Scores one pair. Returns null when the pair cannot be a duplicate
 * (incompatible categories or outside the search radius).
 */
export function scorePair(
  a: DuplicateSubject,
  b: DuplicateSubject,
  config: DuplicateConfig = DEFAULT_DUPLICATE_CONFIG,
): DuplicateMatch | null {
  const category = categoryCompatibility(a.category, b.category);
  if (category === 0) return null;

  const radiusMeters = searchRadiusMeters(a.category, b.category);
  const distanceMeters = haversineMeters(a, b);
  if (distanceMeters > radiusMeters) return null;

  const hoursApart = Math.abs(a.reportedAt.getTime() - b.reportedAt.getTime()) / 3_600_000;
  const components: DuplicateComponents = {
    geographic: 1 - distanceMeters / radiusMeters,
    category,
    temporal: Math.pow(0.5, hoursApart / config.temporalHalfLifeHours),
    description: descriptionSimilarity(`${a.title} ${a.description}`, `${b.title} ${b.description}`),
  };
  const { weights } = config;
  const score =
    weights.geographic * components.geographic +
    weights.category * components.category +
    weights.temporal * components.temporal +
    weights.description * components.description;

  const categoryPhrase =
    a.category === b.category
      ? `Both reports are categorised as "${categoryLabel(a.category)}"`
      : `The reports have related categories ("${categoryLabel(a.category)}" and "${categoryLabel(b.category)}")`;

  return {
    incidentId: a.id,
    otherIncidentId: b.id,
    score: round(score),
    distanceMeters: round(distanceMeters, 1),
    hoursApart: round(hoursApart, 1),
    radiusMeters,
    components: {
      geographic: round(components.geographic),
      category: round(components.category),
      temporal: round(components.temporal),
      description: round(components.description),
    },
    explanation:
      `${categoryPhrase}, were located ${formatDistance(distanceMeters)} apart (straight line), ` +
      `were submitted ${describeTimeGap(hoursApart)} and ${describeVocabulary(components.description)}.`,
  };
}

/** Scores the target against every other report and keeps pairs at or above the threshold. */
export function findDuplicateCandidates(
  target: DuplicateSubject,
  others: readonly DuplicateSubject[],
  config: DuplicateConfig = DEFAULT_DUPLICATE_CONFIG,
): DuplicateMatch[] {
  return others
    .filter((other) => other.id !== target.id)
    .map((other) => scorePair(target, other, config))
    .filter((match): match is DuplicateMatch => match !== null && match.score >= config.candidateThreshold)
    .sort((first, second) => second.score - first.score);
}
