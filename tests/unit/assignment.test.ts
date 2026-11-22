import { describe, expect, it } from "vitest";
import type { CrewSpecialization, IncidentCategory } from "@/lib/domain/categories";
import type { CrewStatus, PriorityBand } from "@/lib/domain/types";
import {
  buildPlan,
  crewIneligibility,
  DEFAULT_ASSIGNMENT_CONFIG,
  isQualified,
  planCivitas,
  planFifo,
  rankCrewsForIncident,
  straightLineKm,
  type Plan,
  type PlanCrew,
  type PlanIncident,
} from "@/lib/engines/assignment";
import { haversineMeters } from "@/lib/geo/haversine";
import { createPrng, type Prng } from "./helpers/prng";

const BASE_TIME = new Date("2026-03-01T08:00:00Z").getTime();
const MINUTE = 60_000;

// Documented cost-model assumptions, restated independently of the implementation.
const WEIGHTS: Record<PriorityBand, number> = { critical: 8, high: 4, moderate: 2, low: 1, awaiting_review: 1 };
const SPEED_KMH = 30;
const SERVICE_MINUTES = 90;
const UNASSIGNED_PENALTY_MINUTES = 7 * 24 * 60;

// Hand-written qualification table (which specialisations may respond to which category).
const QUALIFIED: Record<IncidentCategory, readonly CrewSpecialization[]> = {
  pothole: ["road_maintenance", "general_maintenance"],
  water_leak: ["water_infrastructure"],
  blocked_drain: ["drainage"],
  flooding: ["drainage", "water_infrastructure"],
  structural: ["structural_inspection"],
  streetlight: ["electrical"],
  exposed_electrical: ["electrical"],
  sidewalk: ["road_maintenance", "general_maintenance"],
  illegal_dumping: ["general_maintenance"],
  other: ["general_maintenance"],
};
const ALL_CATEGORIES = Object.keys(QUALIFIED) as IncidentCategory[];
const ALL_SPECIALIZATIONS: CrewSpecialization[] = [
  "road_maintenance",
  "water_infrastructure",
  "drainage",
  "electrical",
  "general_maintenance",
  "structural_inspection",
];

function incident(id: string, overrides: Partial<PlanIncident> = {}): PlanIncident {
  return {
    id,
    label: `Incident ${id}`,
    category: "pothole",
    priorityBand: "moderate",
    reportedAt: new Date(BASE_TIME),
    latitude: 0,
    longitude: 0,
    ...overrides,
  };
}

function crew(id: string, overrides: Partial<PlanCrew> = {}): PlanCrew {
  return {
    id,
    name: `Crew ${id}`,
    specialization: "road_maintenance",
    status: "available",
    baseLatitude: 0,
    baseLongitude: 0,
    capacity: 1,
    activeWorkload: 0,
    ...overrides,
  };
}

function crewById(crews: readonly PlanCrew[], id: string): PlanCrew {
  const found = crews.find((item) => item.id === id);
  if (!found) throw new Error(`unknown crew ${id}`);
  return found;
}

function incidentById(incidents: readonly PlanIncident[], id: string): PlanIncident {
  const found = incidents.find((item) => item.id === id);
  if (!found) throw new Error(`unknown incident ${id}`);
  return found;
}

/** wait(i, s) = travel + queuePosition · serviceMinutes, exactly as documented. */
function waitMinutes(target: PlanIncident, responder: PlanCrew, queuePosition: number): number {
  const km = haversineMeters(target, { latitude: responder.baseLatitude, longitude: responder.baseLongitude }) / 1000;
  return (km / SPEED_KMH) * 60 + queuePosition * SERVICE_MINUTES;
}

/** Objective the Civitas strategy claims to minimise, including the penalty for unassigned incidents. */
function objective(plan: Plan, incidents: readonly PlanIncident[], crews: readonly PlanCrew[]): number {
  let total = 0;
  const assigned = new Set<string>();
  for (const assignment of plan.assignments) {
    const target = incidentById(incidents, assignment.incidentId);
    assigned.add(target.id);
    total += WEIGHTS[target.priorityBand] * waitMinutes(target, crewById(crews, assignment.crewId), assignment.queuePosition);
  }
  for (const target of incidents) {
    if (!assigned.has(target.id)) total += WEIGHTS[target.priorityBand] * UNASSIGNED_PENALTY_MINUTES;
  }
  return total;
}

/** Exhaustive search: every incident takes a distinct free slot of a qualified, available crew, or stays unassigned. */
function bruteForceObjective(incidents: readonly PlanIncident[], crews: readonly PlanCrew[]): number {
  const slots: Array<{ crew: PlanCrew; position: number }> = [];
  for (const responder of crews) {
    if (responder.status !== "available") continue;
    for (let position = responder.activeWorkload; position < responder.capacity; position += 1) {
      slots.push({ crew: responder, position });
    }
  }
  const used = new Array<boolean>(slots.length).fill(false);
  let best = Infinity;
  const visit = (index: number, running: number): void => {
    if (running >= best) return;
    const target = incidents[index];
    if (target === undefined) {
      best = running;
      return;
    }
    const weight = WEIGHTS[target.priorityBand];
    visit(index + 1, running + weight * UNASSIGNED_PENALTY_MINUTES);
    slots.forEach((slot, slotIndex) => {
      if (used[slotIndex]) return;
      if (!QUALIFIED[target.category].includes(slot.crew.specialization)) return;
      used[slotIndex] = true;
      visit(index + 1, running + weight * waitMinutes(target, slot.crew, slot.position));
      used[slotIndex] = false;
    });
  };
  visit(0, 0);
  return best;
}

/** Structural rules every plan must obey, whatever the strategy. */
function expectFeasible(plan: Plan, incidents: readonly PlanIncident[], crews: readonly PlanCrew[]): void {
  const seenIncidents = new Set<string>();
  const positionsByCrew = new Map<string, number[]>();
  for (const assignment of plan.assignments) {
    const target = incidentById(incidents, assignment.incidentId);
    const responder = crewById(crews, assignment.crewId);
    expect(seenIncidents.has(target.id), "incident assigned twice").toBe(false);
    seenIncidents.add(target.id);
    expect(QUALIFIED[target.category], `${responder.specialization} crew given a ${target.category}`).toContain(
      responder.specialization,
    );
    expect(responder.status).toBe("available");
    expect(assignment.queuePosition).toBeGreaterThanOrEqual(responder.activeWorkload);
    expect(assignment.queuePosition).toBeLessThan(responder.capacity);
    positionsByCrew.set(responder.id, [...(positionsByCrew.get(responder.id) ?? []), assignment.queuePosition]);
  }
  for (const [crewId, positions] of positionsByCrew) {
    const responder = crewById(crews, crewId);
    expect(new Set(positions).size, "two incidents share a queue slot").toBe(positions.length);
    expect(responder.activeWorkload + positions.length).toBeLessThanOrEqual(responder.capacity);
  }
  const unassignedIds = plan.unassigned.map((item) => item.incidentId).sort();
  const expectedUnassigned = incidents.filter((item) => !seenIncidents.has(item.id)).map((item) => item.id).sort();
  expect(unassignedIds).toEqual(expectedUnassigned);
}

function randomScenario(prng: Prng, maxIncidents: number, maxCrews: number): { incidents: PlanIncident[]; crews: PlanCrew[] } {
  const bands: PriorityBand[] = ["critical", "high", "moderate", "low", "awaiting_review"];
  const statuses: CrewStatus[] = ["available", "available", "available", "unavailable", "off_shift"];
  // City-scale coordinates around Johannesburg (roughly ±11 km).
  const latitude = (): number => -26.2 + prng.float(-0.1, 0.1);
  const longitude = (): number => 28.04 + prng.float(-0.1, 0.1);
  const incidents = Array.from({ length: prng.int(1, maxIncidents) }, (_, index) =>
    incident(`i${index}`, {
      category: prng.pick(ALL_CATEGORIES),
      priorityBand: prng.pick(bands),
      reportedAt: new Date(BASE_TIME + prng.int(0, 600) * MINUTE),
      latitude: latitude(),
      longitude: longitude(),
    }),
  );
  const crews = Array.from({ length: prng.int(1, maxCrews) }, (_, index) => {
    const capacity = prng.int(1, 3);
    return crew(`c${index}`, {
      specialization: prng.pick(ALL_SPECIALIZATIONS),
      status: prng.pick(statuses),
      baseLatitude: latitude(),
      baseLongitude: longitude(),
      capacity,
      activeWorkload: prng.int(0, capacity),
    });
  });
  return { incidents, crews };
}

describe("default configuration", () => {
  it("matches the documented assumptions", () => {
    expect(DEFAULT_ASSIGNMENT_CONFIG.priorityWeights).toEqual(WEIGHTS);
    expect(DEFAULT_ASSIGNMENT_CONFIG.averageSpeedKmh).toBe(SPEED_KMH);
    expect(DEFAULT_ASSIGNMENT_CONFIG.serviceMinutes).toBe(SERVICE_MINUTES);
    expect(DEFAULT_ASSIGNMENT_CONFIG.unassignedPenaltyMinutes).toBe(UNASSIGNED_PENALTY_MINUTES);
  });
});

describe("isQualified", () => {
  it("matches the qualification table for every category/specialisation pair", () => {
    for (const category of ALL_CATEGORIES) {
      for (const specialization of ALL_SPECIALIZATIONS) {
        expect(isQualified(category, specialization), `${category} / ${specialization}`).toBe(
          QUALIFIED[category].includes(specialization),
        );
      }
    }
  });

  it("never qualifies a water crew for electrical work, or an electrical crew for water work", () => {
    expect(isQualified("exposed_electrical", "water_infrastructure")).toBe(false);
    expect(isQualified("streetlight", "water_infrastructure")).toBe(false);
    expect(isQualified("water_leak", "electrical")).toBe(false);
    expect(isQualified("flooding", "electrical")).toBe(false);
    expect(isQualified("exposed_electrical", "electrical")).toBe(true);
  });
});

describe("crewIneligibility", () => {
  it("returns null for a qualified, available crew with spare capacity", () => {
    expect(crewIneligibility("pothole", crew("a", { capacity: 2, activeWorkload: 1 }))).toBeNull();
  });

  it("reports a wrong specialisation", () => {
    expect(crewIneligibility("exposed_electrical", crew("a", { specialization: "water_infrastructure" }))).toBe("specialization");
  });

  it("reports unavailable and off-shift crews", () => {
    expect(crewIneligibility("pothole", crew("a", { status: "unavailable" }))).toBe("unavailable");
    expect(crewIneligibility("pothole", crew("a", { status: "off_shift" }))).toBe("unavailable");
  });

  it("reports a crew at or over capacity", () => {
    expect(crewIneligibility("pothole", crew("a", { capacity: 2, activeWorkload: 2 }))).toBe("at_capacity");
    expect(crewIneligibility("pothole", crew("a", { capacity: 2, activeWorkload: 5 }))).toBe("at_capacity");
  });

  it("reports specialisation first, then availability, then capacity", () => {
    const unqualifiedOffShiftFull = crew("a", { specialization: "electrical", status: "off_shift", capacity: 1, activeWorkload: 1 });
    expect(crewIneligibility("pothole", unqualifiedOffShiftFull)).toBe("specialization");
    const offShiftFull = crew("a", { status: "off_shift", capacity: 1, activeWorkload: 1 });
    expect(crewIneligibility("pothole", offShiftFull)).toBe("unavailable");
  });
});

describe("straightLineKm", () => {
  it("measures from the crew base to the incident", () => {
    // 0.1° of longitude on the equator = 11.1195 km
    expect(straightLineKm({ latitude: 0, longitude: 0.1 }, crew("a"))).toBeCloseTo(11.1195, 3);
  });
});

describe("rankCrewsForIncident", () => {
  // Incident 11.1195 km from a base at the origin → 22.239 min at 30 km/h.
  const target = incident("i", { priorityBand: "critical", longitude: 0.1 });

  it("computes travel, queue and weighted wait from the documented cost model", () => {
    const [ranking] = rankCrewsForIncident(target, [crew("a")]);
    expect(ranking?.eligible).toBe(true);
    expect(ranking?.ineligibility).toBeNull();
    expect(ranking?.ineligibilityReason).toBeNull();
    expect(ranking?.assignment).toMatchObject({
      incidentId: "i",
      crewId: "a",
      queuePosition: 0,
      straightLineKm: 11.12,
      travelMinutes: 22.2,
      queueMinutes: 0,
      waitMinutes: 22.2,
      priorityWeight: 8,
      weightedWaitMinutes: 177.9,
    });
  });

  it("queues the incident behind the crew's existing workload", () => {
    const [ranking] = rankCrewsForIncident(target, [crew("a", { capacity: 3, activeWorkload: 2 })]);
    expect(ranking?.assignment).toMatchObject({
      queuePosition: 2,
      queueMinutes: 180,
      waitMinutes: 202.2,
      weightedWaitMinutes: 1617.9, // 8 × 202.239
    });
    expect(ranking?.assignment?.reasons.join(" ")).toContain("2 jobs ahead");
  });

  it("puts eligible crews first, cheapest first, then ineligible crews by name with a reason", () => {
    const crews = [
      crew("water", { name: "Zulu Water", specialization: "water_infrastructure" }),
      crew("busy-near", { name: "Busy Near", baseLongitude: 0.1, capacity: 2, activeWorkload: 1 }), // 0 + 90 min
      crew("off", { name: "Alpha Off", status: "off_shift" }),
      crew("free-far", { name: "Free Far", baseLongitude: 0.3 }), // 22.2 km → 44.5 min
      crew("full", { name: "Mike Full", capacity: 1, activeWorkload: 1 }),
      crew("free-near", { name: "Free Near", baseLongitude: 0.11 }), // 1.1 km → 2.2 min
    ];
    const rankings = rankCrewsForIncident(target, crews);
    expect(rankings.map((ranking) => ranking.crewId)).toEqual(["free-near", "free-far", "busy-near", "off", "full", "water"]);
    expect(rankings.map((ranking) => ranking.eligible)).toEqual([true, true, true, false, false, false]);
    expect(rankings.slice(3).map((ranking) => ranking.ineligibility)).toEqual(["unavailable", "at_capacity", "specialization"]);
    expect(rankings.slice(3).map((ranking) => ranking.ineligibilityReason)).toEqual([
      "Crew is not currently available.",
      "Crew is at its operational capacity.",
      "Not qualified for this incident category.",
    ]);
    expect(rankings.slice(3).every((ranking) => ranking.assignment === null)).toBe(true);
  });

  it("returns an empty list when there are no crews", () => {
    expect(rankCrewsForIncident(target, [])).toEqual([]);
  });
});

describe.each([
  ["fifo", planFifo],
  ["civitas", planCivitas],
] as const)("hard constraints (%s)", (strategy, plan) => {
  it("labels the plan with its strategy", () => {
    expect(plan([], []).strategy).toBe(strategy);
  });

  it("returns an empty plan when there are no incidents", () => {
    const result = plan([], [crew("a")]);
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([]);
    expect(result.metrics.feasibleAssignments).toBe(0);
    expect(result.metrics.unassignedIncidents).toBe(0);
    expect(result.metrics.weightedWaitMinutes).toBe(0);
  });

  it("never sends an electrical incident to a water crew, even when it is the only crew", () => {
    const incidents = [incident("e", { category: "exposed_electrical", priorityBand: "critical" })];
    const crews = [crew("water", { specialization: "water_infrastructure", capacity: 5 })];
    const result = plan(incidents, crews);
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([
      { incidentId: "e", reason: "No crew has a qualifying specialisation for this category." },
    ]);
  });

  it("sends an electrical incident to the electrical crew even when a water crew is much closer", () => {
    const incidents = [incident("e", { category: "exposed_electrical", priorityBand: "critical" })];
    const crews = [
      crew("water", { specialization: "water_infrastructure" }),
      crew("electrical", { specialization: "electrical", baseLongitude: 0.5 }),
    ];
    const result = plan(incidents, crews);
    expect(result.assignments.map((assignment) => assignment.crewId)).toEqual(["electrical"]);
  });

  it("excludes unavailable and off-shift crews", () => {
    const incidents = [incident("p")];
    const crews = [crew("unavailable", { status: "unavailable" }), crew("off", { status: "off_shift" })];
    const result = plan(incidents, crews);
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([{ incidentId: "p", reason: "Every qualified crew is currently unavailable." }]);
  });

  it("excludes crews that are already at capacity", () => {
    const incidents = [incident("p")];
    const crews = [crew("full", { capacity: 2, activeWorkload: 2 })];
    const result = plan(incidents, crews);
    expect(result.assignments).toEqual([]);
    expect(result.unassigned).toEqual([
      { incidentId: "p", reason: "Every available qualified crew is at capacity or was allocated to higher-cost incidents." },
    ]);
  });

  it("never exceeds a crew's capacity", () => {
    const incidents = ["a", "b", "c", "d", "e"].map((id, index) =>
      incident(id, { reportedAt: new Date(BASE_TIME + index * MINUTE) }),
    );
    const crews = [crew("one", { capacity: 3, activeWorkload: 1 })];
    const result = plan(incidents, crews);
    expect(result.assignments).toHaveLength(2);
    expect(result.assignments.map((assignment) => assignment.queuePosition).sort()).toEqual([1, 2]);
    expect(result.unassigned).toHaveLength(3);
    expect(result.metrics.workloadByCrew).toEqual({ one: 3 });
    expectFeasible(result, incidents, crews);
  });

  it("uses a free qualified crew rather than leaving an incident unassigned", () => {
    const incidents = [incident("a"), incident("b", { reportedAt: new Date(BASE_TIME + MINUTE) })];
    const crews = [crew("one"), crew("two", { specialization: "general_maintenance", baseLongitude: 0.2 })];
    const result = plan(incidents, crews);
    expect(result.assignments).toHaveLength(2);
    expect(new Set(result.assignments.map((assignment) => assignment.crewId))).toEqual(new Set(["one", "two"]));
  });

  it("produces metrics that add up", () => {
    const incidents = [
      incident("c1", { priorityBand: "critical", category: "exposed_electrical", longitude: 0.05 }),
      incident("h1", { priorityBand: "high", category: "water_leak", longitude: 0.02 }),
      incident("m1", { priorityBand: "moderate", longitude: 0.01 }),
      incident("m2", { priorityBand: "moderate", longitude: 0.03, reportedAt: new Date(BASE_TIME + MINUTE) }),
      incident("l1", { priorityBand: "low", category: "structural" }),
      incident("r1", { priorityBand: "awaiting_review", category: "other" }),
    ];
    const crews = [
      crew("road", { capacity: 1 }),
      crew("elec", { specialization: "electrical", capacity: 2, activeWorkload: 1 }),
      crew("water", { specialization: "water_infrastructure", status: "off_shift" }),
      crew("general", { specialization: "general_maintenance", capacity: 4, activeWorkload: 1 }),
    ];
    const result = plan(incidents, crews);
    expectFeasible(result, incidents, crews);
    const { metrics } = result;

    // c1 → elec; h1 → nobody (water crew off shift); m1, m2, r1 → road/general; l1 → nobody (no structural crew).
    expect(metrics.feasibleAssignments).toBe(4);
    expect(metrics.unassignedIncidents).toBe(2);
    expect(metrics.feasibleAssignments).toBe(result.assignments.length);
    expect(metrics.unassignedIncidents).toBe(result.unassigned.length);
    expect(metrics.feasibleAssignments + metrics.unassignedIncidents).toBe(incidents.length);

    expect(metrics.coverageByPriority).toEqual({
      critical: { assigned: 1, total: 1 },
      high: { assigned: 0, total: 1 },
      moderate: { assigned: 2, total: 2 },
      low: { assigned: 0, total: 1 },
      awaiting_review: { assigned: 1, total: 1 },
    });

    const sumWeighted = result.assignments.reduce((sum, assignment) => sum + assignment.weightedWaitMinutes, 0);
    const sumKm = result.assignments.reduce((sum, assignment) => sum + assignment.straightLineKm, 0);
    expect(metrics.weightedWaitMinutes).toBeCloseTo(sumWeighted, 1);
    expect(metrics.totalStraightLineKm).toBeCloseTo(sumKm, 2);

    // Workload = existing workload + newly planned jobs, for every crew including idle ones.
    expect(Object.keys(metrics.workloadByCrew).sort()).toEqual(["elec", "general", "road", "water"]);
    expect(metrics.workloadByCrew.elec).toBe(2);
    expect(metrics.workloadByCrew.water).toBe(0);
    const existing = crews.reduce((sum, item) => sum + item.activeWorkload, 0);
    const planned = Object.values(metrics.workloadByCrew).reduce((sum, value) => sum + value, 0);
    expect(planned).toBe(existing + result.assignments.length);

    const reasons = Object.fromEntries(result.unassigned.map((item) => [item.incidentId, item.reason]));
    expect(reasons).toEqual({
      h1: "Every qualified crew is currently unavailable.",
      l1: "No crew has a qualifying specialisation for this category.",
    });
  });

  it("reports per-assignment figures consistent with the cost model", () => {
    const incidents = [incident("a", { priorityBand: "high", longitude: 0.1 })];
    const crews = [crew("one", { capacity: 2, activeWorkload: 1 })];
    const [assignment] = plan(incidents, crews).assignments;
    // travel 22.239 min + 1 job ahead (90 min) = 112.239 min; × 4 = 448.96
    expect(assignment).toMatchObject({
      queuePosition: 1,
      travelMinutes: 22.2,
      queueMinutes: 90,
      waitMinutes: 112.2,
      priorityWeight: 4,
      weightedWaitMinutes: 449,
    });
    expect(assignment?.reasons).toHaveLength(3);
  });

  it("satisfies every hard constraint on 200 seeded random scenarios", () => {
    const prng = createPrng(strategy === "fifo" ? 1001 : 2002);
    for (let trial = 0; trial < 200; trial += 1) {
      const { incidents, crews } = randomScenario(prng, 8, 5);
      const result = plan(incidents, crews);
      expectFeasible(result, incidents, crews);
      expect(result.metrics.feasibleAssignments + result.metrics.unassignedIncidents).toBe(incidents.length);
    }
  });
});

describe("planFifo", () => {
  it("serves incidents strictly in reported order, ignoring priority", () => {
    const incidents = [
      incident("critical-late", { priorityBand: "critical", reportedAt: new Date(BASE_TIME + 10 * MINUTE) }),
      incident("low-early", { priorityBand: "low", reportedAt: new Date(BASE_TIME) }),
    ];
    const result = planFifo(incidents, [crew("one", { capacity: 2 })]);
    const byIncident = Object.fromEntries(result.assignments.map((assignment) => [assignment.incidentId, assignment.queuePosition]));
    expect(byIncident).toEqual({ "low-early": 0, "critical-late": 1 });
  });

  it("gives the only slot to the earliest report and leaves the later one unassigned", () => {
    const incidents = [
      incident("critical-late", { priorityBand: "critical", reportedAt: new Date(BASE_TIME + 10 * MINUTE) }),
      incident("low-early", { priorityBand: "low", reportedAt: new Date(BASE_TIME) }),
    ];
    const result = planFifo(incidents, [crew("one")]);
    expect(result.assignments.map((assignment) => assignment.incidentId)).toEqual(["low-early"]);
    expect(result.unassigned.map((item) => item.incidentId)).toEqual(["critical-late"]);
  });

  it("chooses the crew with the shortest queue, ignoring distance, with ties broken by roster order", () => {
    const target = incident("a");
    const near = crew("near-busy", { capacity: 3, activeWorkload: 1 });
    const far = crew("far-idle", { baseLongitude: 1, capacity: 3 });
    expect(planFifo([target], [near, far]).assignments[0]?.crewId).toBe("far-idle");

    const first = crew("first", { baseLongitude: 1 });
    const second = crew("second");
    expect(planFifo([target], [first, second]).assignments[0]?.crewId).toBe("first");
  });

  it("spreads work across crews as queues grow", () => {
    const incidents = ["a", "b", "c", "d"].map((id, index) => incident(id, { reportedAt: new Date(BASE_TIME + index * MINUTE) }));
    const crews = [crew("one", { capacity: 2 }), crew("two", { capacity: 2 })];
    const result = planFifo(incidents, crews);
    expect(result.assignments.map((assignment) => [assignment.incidentId, assignment.crewId, assignment.queuePosition])).toEqual([
      ["a", "one", 0],
      ["b", "two", 0],
      ["c", "one", 1],
      ["d", "two", 1],
    ]);
  });

  it("breaks ties in report time by incident id", () => {
    const incidents = [incident("b"), incident("a")];
    const result = planFifo(incidents, [crew("one")]);
    expect(result.assignments.map((assignment) => assignment.incidentId)).toEqual(["a"]);
  });
});

describe("planCivitas", () => {
  it("gives the critical incident the front of the queue even though it was reported later", () => {
    const incidents = [
      incident("low-early", { priorityBand: "low", reportedAt: new Date(BASE_TIME) }),
      incident("critical-late", { priorityBand: "critical", reportedAt: new Date(BASE_TIME + 10 * MINUTE) }),
    ];
    const crews = [crew("one", { capacity: 2 })];
    const civitas = planCivitas(incidents, crews);
    const byIncident = Object.fromEntries(civitas.assignments.map((assignment) => [assignment.incidentId, assignment.queuePosition]));
    expect(byIncident).toEqual({ "critical-late": 0, "low-early": 1 });

    // Both at the crew base: FIFO = 1·0 + 8·90 = 720; Civitas = 8·0 + 1·90 = 90.
    expect(planFifo(incidents, crews).metrics.weightedWaitMinutes).toBe(720);
    expect(civitas.metrics.weightedWaitMinutes).toBe(90);
  });

  it("keeps the only slot for the critical incident and leaves the low one unassigned", () => {
    const incidents = [
      incident("low-early", { priorityBand: "low" }),
      incident("critical-late", { priorityBand: "critical", reportedAt: new Date(BASE_TIME + 10 * MINUTE) }),
    ];
    const result = planCivitas(incidents, [crew("one")]);
    expect(result.assignments.map((assignment) => assignment.incidentId)).toEqual(["critical-late"]);
    expect(result.unassigned).toEqual([
      {
        incidentId: "low-early",
        reason: "Every available qualified crew is at capacity or was allocated to higher-cost incidents.",
      },
    ]);
  });

  it("matches each incident with its nearer crew when that minimises total weighted wait", () => {
    const incidents = [incident("west", { longitude: 0 }), incident("east", { longitude: 0.2 })];
    const crews = [crew("east-crew", { baseLongitude: 0.21 }), crew("west-crew", { baseLongitude: 0.01 })];
    const result = planCivitas(incidents, crews);
    const byIncident = Object.fromEntries(result.assignments.map((assignment) => [assignment.incidentId, assignment.crewId]));
    expect(byIncident).toEqual({ west: "west-crew", east: "east-crew" });
  });

  it("prefers a farther idle crew when queueing behind a nearer crew's job would take longer", () => {
    // Near crew: 0 min travel + 90 min queue. Far crew: 22.2 km → 44.5 min travel, no queue.
    const target = incident("a", { priorityBand: "high" });
    const crews = [crew("near-busy", { capacity: 2, activeWorkload: 1 }), crew("far-idle", { baseLongitude: 0.2 })];
    expect(planCivitas([target], crews).assignments[0]?.crewId).toBe("far-idle");
  });

  it("lists assignments by descending priority weight, then shortest wait", () => {
    const incidents = [
      incident("low", { priorityBand: "low", longitude: 0.01 }),
      incident("crit-far", { priorityBand: "critical", longitude: 0.3 }),
      incident("high", { priorityBand: "high", longitude: 0.02 }),
      incident("crit-near", { priorityBand: "critical", longitude: 0.01 }),
    ];
    const crews = [crew("a", { capacity: 4 }), crew("b", { capacity: 4, baseLongitude: 0.3 })];
    const result = planCivitas(incidents, crews);
    expect(result.assignments.map((assignment) => assignment.priorityWeight)).toEqual([8, 8, 4, 1]);
    const [first, second] = result.assignments;
    expect(first?.waitMinutes ?? 0).toBeLessThanOrEqual(second?.waitMinutes ?? 0);
  });

  it("fills a crew's queue contiguously from its current workload", () => {
    const incidents = ["a", "b", "c"].map((id) => incident(id));
    const result = planCivitas(incidents, [crew("one", { capacity: 6, activeWorkload: 2 })]);
    expect(result.assignments.map((assignment) => assignment.queuePosition).sort()).toEqual([2, 3, 4]);
  });

  it("is optimal for the documented cost model on 300 seeded random small scenarios (vs brute force)", () => {
    const prng = createPrng(31337);
    for (let trial = 0; trial < 300; trial += 1) {
      const { incidents, crews } = randomScenario(prng, 5, 4);
      const plan = planCivitas(incidents, crews);
      expectFeasible(plan, incidents, crews);
      const achieved = objective(plan, incidents, crews);
      const optimal = bruteForceObjective(incidents, crews);
      expect(Math.abs(achieved - optimal), `trial ${trial}: achieved ${achieved}, optimal ${optimal}`).toBeLessThan(1e-3);
    }
  });

  it("is optimal when most incidents compete for the same crews (road-only scenarios vs brute force)", () => {
    const prng = createPrng(555);
    const bands: PriorityBand[] = ["critical", "high", "moderate", "low"];
    for (let trial = 0; trial < 150; trial += 1) {
      const incidents = Array.from({ length: prng.int(2, 6) }, (_, index) =>
        incident(`i${index}`, {
          priorityBand: prng.pick(bands),
          latitude: prng.float(-0.1, 0.1),
          longitude: prng.float(-0.1, 0.1),
        }),
      );
      const crews = Array.from({ length: prng.int(1, 3) }, (_, index) => {
        const capacity = prng.int(1, 3);
        return crew(`c${index}`, {
          specialization: prng.pick(["road_maintenance", "general_maintenance"] as const),
          baseLatitude: prng.float(-0.1, 0.1),
          baseLongitude: prng.float(-0.1, 0.1),
          capacity,
          activeWorkload: prng.int(0, capacity - 1),
        });
      });
      const plan = planCivitas(incidents, crews);
      expectFeasible(plan, incidents, crews);
      const achieved = objective(plan, incidents, crews);
      const optimal = bruteForceObjective(incidents, crews);
      expect(Math.abs(achieved - optimal), `trial ${trial}: achieved ${achieved}, optimal ${optimal}`).toBeLessThan(1e-3);
    }
  });

  it("assigns as many incidents as FIFO does or more", () => {
    const prng = createPrng(8080);
    for (let trial = 0; trial < 200; trial += 1) {
      const { incidents, crews } = randomScenario(prng, 8, 5);
      expect(planCivitas(incidents, crews).metrics.feasibleAssignments).toBeGreaterThanOrEqual(
        planFifo(incidents, crews).metrics.feasibleAssignments,
      );
    }
  });

  it("has a weighted wait no greater than FIFO's whenever both assign the same set of incidents", () => {
    const prng = createPrng(606);
    let compared = 0;
    let strictlyBetter = 0;
    for (let trial = 0; trial < 400; trial += 1) {
      const { incidents, crews } = randomScenario(prng, 7, 4);
      const fifo = planFifo(incidents, crews);
      const civitas = planCivitas(incidents, crews);
      const fifoSet = fifo.assignments.map((assignment) => assignment.incidentId).sort();
      const civitasSet = civitas.assignments.map((assignment) => assignment.incidentId).sort();
      if (fifoSet.join("|") !== civitasSet.join("|") || fifoSet.length === 0) continue;
      compared += 1;
      // Reported figures are rounded per assignment to 0.1, so allow for that.
      const tolerance = 0.05 * fifoSet.length * 2 + 0.1;
      expect(civitas.metrics.weightedWaitMinutes, `trial ${trial}`).toBeLessThanOrEqual(fifo.metrics.weightedWaitMinutes + tolerance);
      if (civitas.metrics.weightedWaitMinutes < fifo.metrics.weightedWaitMinutes - tolerance) strictlyBetter += 1;
    }
    // Guard against a vacuous test: the comparison must actually have happened, and Civitas must sometimes win.
    expect(compared).toBeGreaterThan(100);
    expect(strictlyBetter).toBeGreaterThan(10);
  });
});

describe("buildPlan", () => {
  it("dispatches to the requested strategy", () => {
    const incidents = [
      incident("low-early", { priorityBand: "low" }),
      incident("critical-late", { priorityBand: "critical", reportedAt: new Date(BASE_TIME + 10 * MINUTE) }),
    ];
    const crews = [crew("one", { capacity: 2 })];
    expect(buildPlan("fifo", incidents, crews)).toEqual(planFifo(incidents, crews));
    expect(buildPlan("civitas", incidents, crews)).toEqual(planCivitas(incidents, crews));
    expect(buildPlan("fifo", incidents, crews).strategy).toBe("fifo");
    expect(buildPlan("civitas", incidents, crews).strategy).toBe("civitas");
  });

  it("passes a custom configuration through", () => {
    const config = { ...DEFAULT_ASSIGNMENT_CONFIG, averageSpeedKmh: 60, serviceMinutes: 30 };
    const incidents = [incident("a", { longitude: 0.1 })];
    const crews = [crew("one", { capacity: 2, activeWorkload: 1 })];
    for (const strategy of ["fifo", "civitas"] as const) {
      const [assignment] = buildPlan(strategy, incidents, crews, config).assignments;
      // 11.1195 km at 60 km/h = 11.1 min; one job ahead = 30 min
      expect(assignment).toMatchObject({ travelMinutes: 11.1, queueMinutes: 30, waitMinutes: 41.1 });
    }
  });
});
