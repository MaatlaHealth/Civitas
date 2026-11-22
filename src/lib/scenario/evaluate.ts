import type { PlanCrew, PlanIncident } from "@/lib/engines/assignment";
import { findDuplicateCandidates, type DuplicateMatch, type DuplicateSubject } from "@/lib/engines/duplicates";
import { computePriority, type PriorityResult } from "@/lib/engines/priority";
import { screenConsequences, type ScreeningResult } from "@/lib/engines/screening";
import {
  SCENARIO_ASSETS,
  SCENARIO_CREWS,
  SCENARIO_EVALUATED_AT,
  SCENARIO_REPORTS,
  type ScenarioReport,
} from "./training-scenario";

export interface EvaluatedReport {
  report: ScenarioReport;
  /** Set when the duplicate engine matched this report to an earlier one. */
  duplicateOf: string | null;
  duplicateMatch: DuplicateMatch | null;
  screening: ScreeningResult;
  priority: PriorityResult;
}

export interface EvaluatedScenario {
  reports: EvaluatedReport[];
  planIncidents: Array<PlanIncident & { title: string; eastKm: number; northKm: number }>;
  planCrews: Array<PlanCrew & { eastKm: number; northKm: number }>;
}

const toSubject = (report: ScenarioReport): DuplicateSubject => ({
  id: report.id,
  category: report.category,
  title: report.title,
  description: report.description,
  latitude: report.latitude,
  longitude: report.longitude,
  reportedAt: new Date(report.reportedAt),
});

/**
 * Runs the scenario's raw reports through the live duplicate, screening and
 * priority engines. The scenario assumes the coordinator confirms every
 * candidate the duplicate engine raises; confirmed duplicates count as
 * corroboration for the earlier report and are not planned separately.
 */
export function evaluateScenario(): EvaluatedScenario {
  const evaluatedAt = new Date(SCENARIO_EVALUATED_AT).getTime();
  const ordered = [...SCENARIO_REPORTS].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));

  const duplicateOf = new Map<string, DuplicateMatch>();
  ordered.forEach((report, index) => {
    const earlier = ordered.slice(0, index).filter((candidate) => !duplicateOf.has(candidate.id));
    const [best] = findDuplicateCandidates(toSubject(report), earlier.map(toSubject));
    if (best) duplicateOf.set(report.id, best);
  });

  const assets = SCENARIO_ASSETS.map((asset) => ({ ...asset }));
  const reports = ordered.map((report): EvaluatedReport => {
    const screening = screenConsequences(report, assets);
    const match = duplicateOf.get(report.id) ?? null;
    const confirmedDuplicateCount = [...duplicateOf.values()].filter((entry) => entry.otherIncidentId === report.id).length;
    return {
      report,
      duplicateOf: match?.otherIncidentId ?? null,
      duplicateMatch: match,
      screening,
      priority: computePriority({
        category: report.category,
        confirmedSeverity: report.confirmedSeverity,
        exposureLevel: report.exposureLevel,
        obstructsAccess: report.obstructsAccess,
        reportedDuration: report.reportedDuration,
        hoursOpen: (evaluatedAt - new Date(report.reportedAt).getTime()) / 3_600_000,
        coordinatorVerified: report.coordinatorVerified,
        hasPhotograph: report.hasPhotograph,
        confirmedDuplicateCount,
        screening,
      }),
    };
  });

  return {
    reports,
    planIncidents: reports
      .filter((entry) => entry.duplicateOf === null)
      .map(({ report, priority }) => ({
        id: report.id,
        label: report.id,
        title: report.title,
        category: report.category,
        priorityBand: priority.band,
        latitude: report.latitude,
        longitude: report.longitude,
        reportedAt: new Date(report.reportedAt),
        eastKm: report.eastKm,
        northKm: report.northKm,
      })),
    planCrews: SCENARIO_CREWS.map((crew) => ({ ...crew })),
  };
}
