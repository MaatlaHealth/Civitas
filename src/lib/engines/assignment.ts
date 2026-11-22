import { CATEGORY_DEFINITIONS, SPECIALIZATION_LABELS, type CrewSpecialization, type IncidentCategory } from "@/lib/domain/categories";
import { PRIORITY_BANDS, type CrewStatus, type GeoPoint, type PriorityBand } from "@/lib/domain/types";
import { haversineMeters } from "@/lib/geo/haversine";
import { solveAssignment } from "./hungarian";

/**
 * Resource-aware crew assignment.
 *
 * Cost model. Each crew offers one "slot" per unit of free capacity. Taking
 * slot k of a crew means waiting behind the crew's current workload and the
 * k earlier slots. For incident i in slot s:
 *
 *   wait(i, s) = travelMinutes(crew base → incident) + queuePosition(s) · serviceMinutes
 *   cost(i, s) = priorityWeight(i) · wait(i, s)
 *
 * The "Civitas" strategy minimises the sum of these costs with the Hungarian
 * algorithm, so the result is optimal *for this cost model*. It is not a
 * vehicle-routing solution: travel is straight-line distance from the crew's
 * base at an assumed average speed, each job takes the same assumed time and
 * jobs are not chained into routes. Those assumptions are surfaced in the UI.
 */
export interface AssignmentConfig {
  priorityWeights: Record<PriorityBand, number>;
  /** Assumed average travel speed used to convert straight-line distance to time. */
  averageSpeedKmh: number;
  /** Assumed time a crew spends on one job. */
  serviceMinutes: number;
  /** Waiting time charged for leaving an incident unassigned. Must exceed any real wait. */
  unassignedPenaltyMinutes: number;
}

export const DEFAULT_ASSIGNMENT_CONFIG: AssignmentConfig = {
  priorityWeights: { critical: 8, high: 4, moderate: 2, low: 1, awaiting_review: 1 },
  averageSpeedKmh: 30,
  serviceMinutes: 90,
  unassignedPenaltyMinutes: 7 * 24 * 60,
};

export interface PlanIncident extends GeoPoint {
  id: string;
  label: string;
  category: IncidentCategory;
  priorityBand: PriorityBand;
  reportedAt: Date;
}

export interface PlanCrew {
  id: string;
  name: string;
  specialization: CrewSpecialization;
  status: CrewStatus;
  baseLatitude: number;
  baseLongitude: number;
  /** Maximum number of concurrent jobs. */
  capacity: number;
  /** Jobs already occupying capacity. */
  activeWorkload: number;
}

export type Ineligibility = "specialization" | "unavailable" | "at_capacity";

export function isQualified(category: IncidentCategory, specialization: CrewSpecialization): boolean {
  return CATEGORY_DEFINITIONS[category].qualifiedSpecializations.includes(specialization);
}

/** Returns null when the crew may take the incident, otherwise the reason it may not. */
export function crewIneligibility(category: IncidentCategory, crew: PlanCrew): Ineligibility | null {
  if (!isQualified(category, crew.specialization)) return "specialization";
  if (crew.status !== "available") return "unavailable";
  if (crew.activeWorkload >= crew.capacity) return "at_capacity";
  return null;
}

export function straightLineKm(incident: GeoPoint, crew: PlanCrew): number {
  return haversineMeters(incident, { latitude: crew.baseLatitude, longitude: crew.baseLongitude }) / 1000;
}

function travelMinutes(distanceKm: number, config: AssignmentConfig): number {
  return (distanceKm / config.averageSpeedKmh) * 60;
}

export interface PlannedAssignment {
  incidentId: string;
  crewId: string;
  /** 0 = the crew's next job. */
  queuePosition: number;
  straightLineKm: number;
  travelMinutes: number;
  queueMinutes: number;
  waitMinutes: number;
  priorityWeight: number;
  weightedWaitMinutes: number;
  reasons: string[];
}

export interface UnassignedIncident {
  incidentId: string;
  reason: string;
}

export type PlanningStrategy = "fifo" | "civitas";

export interface PlanMetrics {
  feasibleAssignments: number;
  unassignedIncidents: number;
  /** Σ priorityWeight × estimated wait, over assigned incidents only. */
  weightedWaitMinutes: number;
  totalStraightLineKm: number;
  coverageByPriority: Record<PriorityBand, { assigned: number; total: number }>;
  workloadByCrew: Record<string, number>;
}

export interface Plan {
  strategy: PlanningStrategy;
  assignments: PlannedAssignment[];
  unassigned: UnassignedIncident[];
  metrics: PlanMetrics;
}

const round = (value: number, places = 2): number => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

function buildAssignment(
  incident: PlanIncident,
  crew: PlanCrew,
  queuePosition: number,
  config: AssignmentConfig,
): PlannedAssignment {
  const distanceKm = straightLineKm(incident, crew);
  const travel = travelMinutes(distanceKm, config);
  const queue = queuePosition * config.serviceMinutes;
  const priorityWeight = config.priorityWeights[incident.priorityBand];
  const wait = travel + queue;
  return {
    incidentId: incident.id,
    crewId: crew.id,
    queuePosition,
    straightLineKm: round(distanceKm),
    travelMinutes: round(travel, 1),
    queueMinutes: round(queue, 1),
    waitMinutes: round(wait, 1),
    priorityWeight,
    weightedWaitMinutes: round(priorityWeight * wait, 1),
    reasons: [
      `${crew.name} is qualified: ${SPECIALIZATION_LABELS[crew.specialization]} crews handle this category.`,
      `Straight-line distance from the crew base is ${round(distanceKm)} km (about ${Math.round(travel)} min at an assumed ${config.averageSpeedKmh} km/h).`,
      queuePosition === 0
        ? "The crew can take this as its next job."
        : `The crew has ${queuePosition} job${queuePosition === 1 ? "" : "s"} ahead of this one (about ${Math.round(queue)} min at an assumed ${config.serviceMinutes} min per job).`,
    ],
  };
}

function explainUnassigned(incident: PlanIncident, crews: readonly PlanCrew[]): string {
  const qualified = crews.filter((crew) => isQualified(incident.category, crew.specialization));
  if (qualified.length === 0) return "No crew has a qualifying specialisation for this category.";
  if (qualified.every((crew) => crew.status !== "available")) return "Every qualified crew is currently unavailable.";
  return "Every available qualified crew is at capacity or was allocated to higher-cost incidents.";
}

function computeMetrics(
  incidents: readonly PlanIncident[],
  crews: readonly PlanCrew[],
  assignments: readonly PlannedAssignment[],
): PlanMetrics {
  const coverage = Object.fromEntries(PRIORITY_BANDS.map((band) => [band, { assigned: 0, total: 0 }])) as Record<
    PriorityBand,
    { assigned: number; total: number }
  >;
  const assignedIds = new Set(assignments.map((assignment) => assignment.incidentId));
  for (const incident of incidents) {
    coverage[incident.priorityBand].total += 1;
    if (assignedIds.has(incident.id)) coverage[incident.priorityBand].assigned += 1;
  }
  const workloadByCrew = Object.fromEntries(crews.map((crew) => [crew.id, crew.activeWorkload]));
  for (const assignment of assignments) {
    workloadByCrew[assignment.crewId] = (workloadByCrew[assignment.crewId] ?? 0) + 1;
  }
  return {
    feasibleAssignments: assignments.length,
    unassignedIncidents: incidents.length - assignments.length,
    weightedWaitMinutes: round(assignments.reduce((sum, a) => sum + a.weightedWaitMinutes, 0), 1),
    totalStraightLineKm: round(assignments.reduce((sum, a) => sum + a.straightLineKm, 0)),
    coverageByPriority: coverage,
    workloadByCrew,
  };
}

function finishPlan(
  strategy: PlanningStrategy,
  incidents: readonly PlanIncident[],
  crews: readonly PlanCrew[],
  assignments: PlannedAssignment[],
): Plan {
  const assignedIds = new Set(assignments.map((assignment) => assignment.incidentId));
  const unassigned = incidents
    .filter((incident) => !assignedIds.has(incident.id))
    .map((incident) => ({ incidentId: incident.id, reason: explainUnassigned(incident, crews) }));
  return { strategy, assignments, unassigned, metrics: computeMetrics(incidents, crews, assignments) };
}

/**
 * Baseline: incidents are handled strictly in the order they were reported.
 * Each takes the qualified, available crew with the shortest queue (ties are
 * broken by roster order). Priority and distance are ignored.
 */
export function planFifo(
  incidents: readonly PlanIncident[],
  crews: readonly PlanCrew[],
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
): Plan {
  const queueLength = new Map(crews.map((crew) => [crew.id, crew.activeWorkload]));
  const assignments: PlannedAssignment[] = [];
  const ordered = [...incidents].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime() || a.id.localeCompare(b.id));

  for (const incident of ordered) {
    let chosen: PlanCrew | null = null;
    for (const crew of crews) {
      const queued = queueLength.get(crew.id) ?? 0;
      if (crewIneligibility(incident.category, { ...crew, activeWorkload: queued }) !== null) continue;
      if (chosen === null || queued < (queueLength.get(chosen.id) ?? 0)) chosen = crew;
    }
    if (!chosen) continue;
    const queued = queueLength.get(chosen.id) ?? 0;
    assignments.push(buildAssignment(incident, chosen, queued, config));
    queueLength.set(chosen.id, queued + 1);
  }
  return finishPlan("fifo", incidents, crews, assignments);
}

/** Cost large enough that the solver never prefers a forbidden pairing over leaving an incident unassigned. */
const FORBIDDEN_COST = 1e15;

/**
 * Civitas strategy: minimum total priority-weighted waiting time, solved
 * exactly as an assignment problem over crew capacity slots.
 */
export function planCivitas(
  incidents: readonly PlanIncident[],
  crews: readonly PlanCrew[],
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
): Plan {
  const slots: Array<{ crew: PlanCrew; queuePosition: number }> = [];
  for (const crew of crews) {
    if (crew.status !== "available") continue;
    for (let position = crew.activeWorkload; position < crew.capacity; position += 1) {
      slots.push({ crew, queuePosition: position });
    }
  }
  if (incidents.length === 0) return finishPlan("civitas", incidents, crews, []);

  // One "leave unassigned" column per incident guarantees a feasible solution
  // and makes the matrix at least as wide as it is tall.
  const costMatrix = incidents.map((incident, incidentIndex) => {
    const weight = config.priorityWeights[incident.priorityBand];
    const slotCosts = slots.map(({ crew, queuePosition }) => {
      if (!isQualified(incident.category, crew.specialization)) return FORBIDDEN_COST;
      const wait = travelMinutes(straightLineKm(incident, crew), config) + queuePosition * config.serviceMinutes;
      return weight * wait;
    });
    const unassignedCosts = incidents.map((_, column) =>
      column === incidentIndex ? weight * config.unassignedPenaltyMinutes : FORBIDDEN_COST,
    );
    return [...slotCosts, ...unassignedCosts];
  });

  const solution = solveAssignment(costMatrix);
  const assignments: PlannedAssignment[] = [];
  incidents.forEach((incident, incidentIndex) => {
    const column = solution[incidentIndex];
    if (column === undefined || column < 0 || column >= slots.length) return;
    if (costMatrix[incidentIndex]![column]! >= FORBIDDEN_COST) return;
    const slot = slots[column]!;
    assignments.push(buildAssignment(incident, slot.crew, slot.queuePosition, config));
  });
  assignments.sort((a, b) => b.priorityWeight - a.priorityWeight || a.waitMinutes - b.waitMinutes);
  return finishPlan("civitas", incidents, crews, assignments);
}

export function buildPlan(
  strategy: PlanningStrategy,
  incidents: readonly PlanIncident[],
  crews: readonly PlanCrew[],
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
): Plan {
  return strategy === "fifo" ? planFifo(incidents, crews, config) : planCivitas(incidents, crews, config);
}

export interface CrewRanking {
  crewId: string;
  crewName: string;
  eligible: boolean;
  ineligibility: Ineligibility | null;
  ineligibilityReason: string | null;
  assignment: PlannedAssignment | null;
}

const INELIGIBILITY_REASONS: Record<Ineligibility, string> = {
  specialization: "Not qualified for this incident category.",
  unavailable: "Crew is not currently available.",
  at_capacity: "Crew is at its operational capacity.",
};

/**
 * Ranks every crew for a single incident using the same cost function as the
 * batch planner. Eligible crews come first, cheapest first; ineligible crews
 * are kept in the list with the reason so the coordinator can see why.
 */
export function rankCrewsForIncident(
  incident: PlanIncident,
  crews: readonly PlanCrew[],
  config: AssignmentConfig = DEFAULT_ASSIGNMENT_CONFIG,
): CrewRanking[] {
  const rankings = crews.map((crew): CrewRanking => {
    const ineligibility = crewIneligibility(incident.category, crew);
    return {
      crewId: crew.id,
      crewName: crew.name,
      eligible: ineligibility === null,
      ineligibility,
      ineligibilityReason: ineligibility ? INELIGIBILITY_REASONS[ineligibility] : null,
      assignment: ineligibility === null ? buildAssignment(incident, crew, crew.activeWorkload, config) : null,
    };
  });
  return rankings.sort((a, b) => {
    if (a.assignment && b.assignment) return a.assignment.weightedWaitMinutes - b.assignment.weightedWaitMinutes;
    if (a.assignment) return -1;
    if (b.assignment) return 1;
    return a.crewName.localeCompare(b.crewName);
  });
}
