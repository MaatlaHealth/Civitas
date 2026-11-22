import { CATEGORY_DEFINITIONS, categoryLabel, type IncidentCategory } from "@/lib/domain/categories";
import {
  PRIORITY_LABELS,
  type AssetImportance,
  type ExposureLevel,
  type PriorityBand,
  type ReportedDuration,
  type SeverityLevel,
} from "@/lib/domain/types";
import { formatDistance } from "@/lib/geo/haversine";
import type { ScreeningResult } from "./screening";

/**
 * Deterministic priority engine: P = wH·H + wI·I + wE·E + wU·U + wV·V
 *
 * Each factor is normalised to [0, 1] or is *unknown* (null). Unknown factors
 * are excluded and the remaining weights are renormalised, so a missing input
 * is never silently treated as "no risk". Every unknown factor is reported as
 * a limitation. If hazard severity itself is unknown, no score is produced
 * and the incident is placed in "Awaiting review".
 *
 * The language model plays no part in this calculation.
 */
export interface PriorityConfig {
  weights: { hazard: number; impact: number; exposure: number; urgency: number; evidence: number };
  /** Minimum score for each band, checked from most to least severe. */
  bandThresholds: { critical: number; high: number; moderate: number };
  /** Maximum uplift a nearby verified asset can add to infrastructure impact. */
  assetImpactUplift: number;
  /** Hours unresolved at which the "time open" urgency component saturates. */
  openAgeSaturationHours: number;
}

export const DEFAULT_PRIORITY_CONFIG: PriorityConfig = {
  weights: { hazard: 0.3, impact: 0.25, exposure: 0.15, urgency: 0.15, evidence: 0.15 },
  bandThresholds: { critical: 0.75, high: 0.55, moderate: 0.35 },
  assetImpactUplift: 0.3,
  openAgeSaturationHours: 168,
};

const SEVERITY_VALUES: Record<SeverityLevel, number> = { low: 0.25, moderate: 0.5, high: 0.75, critical: 1 };
const EXPOSURE_VALUES: Record<ExposureLevel, number> = { low: 0.25, moderate: 0.55, high: 0.85 };
const IMPORTANCE_VALUES: Record<AssetImportance, number> = { standard: 0.4, important: 0.7, critical: 1 };
const REPORTED_DURATION_VALUES: Record<Exclude<ReportedDuration, "unknown">, number> = {
  today: 0.2,
  days: 0.5,
  weeks: 0.8,
  longer: 1,
};

/** Exposure assumed from the reporter's answer when no coordinator estimate exists. */
const REPORTER_OBSTRUCTION_EXPOSURE = { obstructs: 0.6, doesNotObstruct: 0.3 };

/** Urgency blends how fast the category worsens with how long the problem has existed. */
const URGENCY_COMPONENT_WEIGHTS = { timeSensitivity: 0.5, openAge: 0.25, reportedDuration: 0.25 };

/** Evidence contributions; the total is capped at 1. */
const EVIDENCE_VALUES = { coordinatorVerified: 0.5, photograph: 0.2, perConfirmedDuplicate: 0.1, maxDuplicatesCounted: 3 };

export interface PriorityInput {
  category: IncidentCategory;
  confirmedSeverity: SeverityLevel | null;
  exposureLevel: ExposureLevel | null;
  /** Reporter's answer to "does this block a road or walkway?"; null when not answered. */
  obstructsAccess: boolean | null;
  reportedDuration: ReportedDuration;
  hoursOpen: number;
  coordinatorVerified: boolean;
  hasPhotograph: boolean;
  confirmedDuplicateCount: number;
  screening: ScreeningResult;
}

export type PriorityFactorKey = "hazard" | "impact" | "exposure" | "urgency" | "evidence";

export interface PriorityFactor {
  key: PriorityFactorKey;
  label: string;
  weight: number;
  /** Normalised value in [0, 1], or null when the input is unknown. */
  value: number | null;
  basis: string;
}

export interface PriorityResult {
  /** Null when the band is "awaiting_review". */
  score: number | null;
  band: PriorityBand;
  /** True until a coordinator has verified the incident. */
  provisional: boolean;
  factors: PriorityFactor[];
  explanation: string;
  limitations: string[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
const round = (value: number): number => Math.round(value * 1000) / 1000;

function hazardFactor(input: PriorityInput): Pick<PriorityFactor, "value" | "basis"> {
  if (input.confirmedSeverity) {
    return {
      value: SEVERITY_VALUES[input.confirmedSeverity],
      basis: `Coordinator-confirmed severity: ${input.confirmedSeverity}.`,
    };
  }
  const base = CATEGORY_DEFINITIONS[input.category].baseHazard;
  if (base === null) {
    return { value: null, basis: "No baseline hazard can be assumed for this category and no severity has been confirmed." };
  }
  return { value: base, basis: `Category baseline for "${categoryLabel(input.category)}" (not yet confirmed by a coordinator).` };
}

function strongestVerifiedAsset(input: PriorityInput) {
  const { radiusMeters, findings } = input.screening;
  let best: { strength: number; description: string } | null = null;
  for (const finding of findings) {
    if (!finding.verified || finding.relevance === null) continue;
    const strength = IMPORTANCE_VALUES[finding.importance] * (1 - finding.distanceMeters / radiusMeters);
    if (!best || strength > best.strength) {
      best = {
        strength,
        description: `${finding.assetName} (${finding.importance} importance, ${formatDistance(finding.distanceMeters)} away)`,
      };
    }
  }
  return best;
}

function impactFactor(input: PriorityInput, config: PriorityConfig): Pick<PriorityFactor, "value" | "basis"> {
  const base = CATEGORY_DEFINITIONS[input.category].baseServiceImpact;
  if (base === null) {
    return { value: null, basis: "No baseline service impact can be assumed for this category." };
  }
  const asset = strongestVerifiedAsset(input);
  if (!asset) {
    return { value: base, basis: "Category baseline; no relevant verified registered asset within the screening radius." };
  }
  return {
    value: clamp01(base + config.assetImpactUplift * asset.strength),
    basis: `Category baseline raised for proximity to verified registered asset ${asset.description}. Proximity is not proof of impact.`,
  };
}

function exposureFactor(input: PriorityInput): Pick<PriorityFactor, "value" | "basis"> {
  if (input.exposureLevel) {
    return { value: EXPOSURE_VALUES[input.exposureLevel], basis: `Coordinator exposure estimate: ${input.exposureLevel}.` };
  }
  if (input.obstructsAccess === true) {
    return { value: REPORTER_OBSTRUCTION_EXPOSURE.obstructs, basis: "Reporter states that a road or walkway is obstructed (unverified)." };
  }
  if (input.obstructsAccess === false) {
    return { value: REPORTER_OBSTRUCTION_EXPOSURE.doesNotObstruct, basis: "Reporter states that access is not obstructed (unverified)." };
  }
  return { value: null, basis: "No exposure information: Civitas holds no population or traffic data for this location." };
}

function urgencyFactor(input: PriorityInput, config: PriorityConfig): Pick<PriorityFactor, "value" | "basis"> {
  const weights = URGENCY_COMPONENT_WEIGHTS;
  const sensitivity = CATEGORY_DEFINITIONS[input.category].timeSensitivity;
  const openAge = clamp01(input.hoursOpen / config.openAgeSaturationHours);
  let weighted = weights.timeSensitivity * sensitivity + weights.openAge * openAge;
  let totalWeight = weights.timeSensitivity + weights.openAge;
  let durationNote = "reported duration unknown";
  if (input.reportedDuration !== "unknown") {
    weighted += weights.reportedDuration * REPORTED_DURATION_VALUES[input.reportedDuration];
    totalWeight += weights.reportedDuration;
    durationNote = `reporter says the problem has existed for: ${input.reportedDuration}`;
  }
  return {
    value: weighted / totalWeight,
    basis: `Category time-sensitivity, ${Math.round(input.hoursOpen)} h since the report was received, ${durationNote}.`,
  };
}

function evidenceFactor(input: PriorityInput): Pick<PriorityFactor, "value" | "basis"> {
  const duplicatesCounted = Math.min(input.confirmedDuplicateCount, EVIDENCE_VALUES.maxDuplicatesCounted);
  const value =
    (input.coordinatorVerified ? EVIDENCE_VALUES.coordinatorVerified : 0) +
    (input.hasPhotograph ? EVIDENCE_VALUES.photograph : 0) +
    duplicatesCounted * EVIDENCE_VALUES.perConfirmedDuplicate;
  const parts = [
    input.coordinatorVerified ? "verified by a coordinator" : "not yet verified by a coordinator",
    input.hasPhotograph ? "photograph supplied" : "no photograph",
    `${input.confirmedDuplicateCount} confirmed matching report${input.confirmedDuplicateCount === 1 ? "" : "s"}`,
  ];
  return { value: clamp01(value), basis: `${parts.join("; ")}.` };
}

export function bandForScore(score: number, config: PriorityConfig = DEFAULT_PRIORITY_CONFIG): PriorityBand {
  const { critical, high, moderate } = config.bandThresholds;
  if (score >= critical) return "critical";
  if (score >= high) return "high";
  if (score >= moderate) return "moderate";
  return "low";
}

function buildExplanation(input: PriorityInput, band: PriorityBand, score: number | null): string {
  const label = categoryLabel(input.category).toLowerCase();
  if (band === "awaiting_review" || score === null) {
    return `Awaiting review: hazard severity for this ${label} report is unknown, so no score has been calculated. A coordinator must confirm the severity.`;
  }
  const clauses: string[] = [];
  if (input.confirmedSeverity) clauses.push(`severity confirmed as ${input.confirmedSeverity}`);
  if (input.confirmedDuplicateCount > 0) {
    clauses.push(`${input.confirmedDuplicateCount} confirmed matching report${input.confirmedDuplicateCount === 1 ? "" : "s"}`);
  }
  if (input.exposureLevel) clauses.push(`${input.exposureLevel} exposure estimated by a coordinator`);
  else if (input.obstructsAccess) clauses.push("reported to obstruct a road or walkway");
  if (input.reportedDuration === "weeks" || input.reportedDuration === "longer") {
    clauses.push("reported as a long-standing problem");
  }
  const asset = strongestVerifiedAsset(input);
  if (asset) clauses.push(`near verified registered asset ${asset.description}`);

  const verification = input.coordinatorVerified ? "a coordinator-verified" : "an unverified";
  const detail = clauses.length > 0 ? `, with ${clauses.join(", ")}` : "";
  return `${PRIORITY_LABELS[band]} priority (score ${score.toFixed(2)}): ${verification} ${label} report${detail}.`;
}

export function computePriority(input: PriorityInput, config: PriorityConfig = DEFAULT_PRIORITY_CONFIG): PriorityResult {
  const { weights } = config;
  const rawFactors: PriorityFactor[] = [
    { key: "hazard", label: "Hazard severity (H)", weight: weights.hazard, ...hazardFactor(input) },
    { key: "impact", label: "Infrastructure impact (I)", weight: weights.impact, ...impactFactor(input, config) },
    { key: "exposure", label: "Exposure (E)", weight: weights.exposure, ...exposureFactor(input) },
    { key: "urgency", label: "Urgency (U)", weight: weights.urgency, ...urgencyFactor(input, config) },
    { key: "evidence", label: "Verified evidence (V)", weight: weights.evidence, ...evidenceFactor(input) },
  ];
  const factors = rawFactors.map((factor) => ({ ...factor, value: factor.value === null ? null : round(factor.value) }));

  const limitations = factors
    .filter((factor) => factor.value === null)
    .map((factor) => `${factor.label} is unknown and was excluded from the score. ${factor.basis}`);
  if (input.screening.findings.length === 0) {
    limitations.push("No registered infrastructure assets were found within the screening radius; the asset registry may be incomplete.");
  }

  const hazard = factors.find((factor) => factor.key === "hazard");
  const provisional = !input.coordinatorVerified;
  if (!hazard || hazard.value === null) {
    return {
      score: null,
      band: "awaiting_review",
      provisional,
      factors,
      explanation: buildExplanation(input, "awaiting_review", null),
      limitations,
    };
  }

  let weightedSum = 0;
  let knownWeight = 0;
  for (const factor of factors) {
    if (factor.value === null) continue;
    weightedSum += factor.weight * factor.value;
    knownWeight += factor.weight;
  }
  const score = round(weightedSum / knownWeight);
  const band = bandForScore(score, config);
  return { score, band, provisional, factors, explanation: buildExplanation(input, band, score), limitations };
}
