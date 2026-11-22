import { and, asc, eq, isNull, notExists } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { crewAssignments, incidents } from "@/lib/db/schema";
import { planCivitas, type PlanCrew, type PlanIncident } from "@/lib/engines/assignment";
import { createProposals, toPlanIncident } from "./assignments";
import { loadCrewsWithWorkload, toPlanCrew } from "./crews";

export interface LivePlanningInputs {
  incidents: Array<PlanIncident & { title: string }>;
  crews: PlanCrew[];
}

/**
 * Incidents ready for planning: verified (which implies no approved
 * assignment), not a confirmed duplicate, and without a pending proposal.
 */
export async function getLivePlanningInputs(actor: StaffActor | null): Promise<LivePlanningInputs> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const ready = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, coordinator.organizationId),
        eq(incidents.status, "verified"),
        isNull(incidents.duplicateOfId),
        notExists(
          db
            .select({ id: crewAssignments.id })
            .from(crewAssignments)
            .where(and(eq(crewAssignments.incidentId, incidents.id), eq(crewAssignments.status, "proposed"))),
        ),
      ),
    )
    .orderBy(asc(incidents.createdAt))
    .limit(200);
  const crews = await loadCrewsWithWorkload(db, coordinator.organizationId);
  return {
    incidents: ready.map((incident) => ({ ...toPlanIncident(incident), title: incident.title })),
    crews: crews.map(toPlanCrew),
  };
}

/**
 * Runs the Civitas planner on current persisted records and stores the
 * result as proposals. The plan is recomputed on the server; nothing sent
 * from the browser is trusted.
 */
export async function proposeLivePlan(actor: StaffActor | null): Promise<{ created: number; skipped: string[] }> {
  const inputs = await getLivePlanningInputs(actor);
  const plan = planCivitas(inputs.incidents, inputs.crews);
  return createProposals(
    actor,
    plan.assignments.map((assignment) => ({ incidentId: assignment.incidentId, crewId: assignment.crewId })),
  );
}
