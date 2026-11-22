import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { requireCoordinator, requireCrew, requireCrewMembership, type StaffActor } from "@/lib/auth/actor";
import { getDb, type Database } from "@/lib/db/client";
import {
  crewAssignments,
  incidentImages,
  incidentObservations,
  incidents,
  maintenanceCrews,
  type AssignmentRationale,
  type CrewAssignment,
  type Incident,
} from "@/lib/db/schema";
import { ACTIVE_ASSIGNMENT_STATUSES, type AssignmentStatus, type UserRole } from "@/lib/domain/types";
import { canTransitionAssignment } from "@/lib/domain/workflow";
import { rankCrewsForIncident, type CrewRanking, type PlanIncident } from "@/lib/engines/assignment";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { processUploadedImage } from "@/lib/storage/image-processing";
import { getImageStore } from "@/lib/storage/image-store";
import { loadCrewsWithWorkload, toPlanCrew } from "./crews";
import { loadIncident, recordAudit, transitionIncident } from "./core";

export function toPlanIncident(incident: Incident): PlanIncident {
  return {
    id: incident.id,
    label: incident.reference,
    category: incident.category,
    priorityBand: incident.priorityBand,
    latitude: incident.latitude,
    longitude: incident.longitude,
    reportedAt: incident.createdAt,
  };
}

/** Ranks every crew for one incident with the same cost function as the batch planner. */
export async function recommendCrews(actor: StaffActor | null, incidentId: string): Promise<CrewRanking[]> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);
  const crews = await loadCrewsWithWorkload(db, coordinator.organizationId);
  return rankCrewsForIncident(toPlanIncident(incident), crews.map(toPlanCrew));
}

async function loadAssignment(db: Database, assignmentId: string): Promise<CrewAssignment> {
  const [assignment] = await db.select().from(crewAssignments).where(eq(crewAssignments.id, assignmentId)).limit(1);
  if (!assignment) throw new AppError("not_found", "Assignment not found.");
  return assignment;
}

/**
 * Moves an assignment to a new state. The update is conditional on the
 * current state, so two people acting on the same assignment at once cannot
 * both succeed.
 */
async function moveAssignment(
  db: Database,
  assignment: CrewAssignment,
  toStatus: AssignmentStatus,
  role: UserRole,
  patch: Partial<typeof crewAssignments.$inferInsert> = {},
): Promise<void> {
  if (!canTransitionAssignment(assignment.status, toStatus, role)) {
    throw new AppError("conflict", `An assignment that is "${assignment.status}" cannot be changed to "${toStatus}" by a ${role}.`);
  }
  const updated = await db
    .update(crewAssignments)
    .set({ ...patch, status: toStatus, updatedAt: new Date() })
    .where(and(eq(crewAssignments.id, assignment.id), eq(crewAssignments.status, assignment.status)))
    .returning({ id: crewAssignments.id });
  if (updated.length === 0) {
    throw new AppError("conflict", "This assignment was changed by someone else. Reload the page and try again.");
  }
}

async function auditAssignment(
  db: Database,
  incident: Incident,
  assignment: { id: string; crewId: string },
  action: string,
  actorKind: "coordinator" | "crew",
  actorUserId: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind,
    actorUserId,
    action,
    entityType: "crew_assignment",
    entityId: assignment.id,
    incidentId: incident.id,
    detail: { crewId: assignment.crewId, ...detail },
  });
}

export interface CreateAssignmentInput {
  incidentId: string;
  crewId: string;
  origin: AssignmentRationale["origin"];
  /** Proposals need a separate approval step; direct assignments are approved on creation. */
  asProposal: boolean;
}

async function createAssignmentIn(db: Database, coordinatorId: string, organizationId: string, input: CreateAssignmentInput): Promise<string> {
  const incident = await loadIncident(db, input.incidentId);
  if (incident.status !== "verified") {
    throw new AppError("conflict", "Only verified incidents without a current assignment can be assigned to a crew.");
  }
  if (incident.duplicateOfId) {
    throw new AppError("conflict", "This report is a confirmed duplicate. Assign the original incident instead.");
  }
  const crews = await loadCrewsWithWorkload(db, organizationId);
  const ranking = rankCrewsForIncident(toPlanIncident(incident), crews.map(toPlanCrew)).find((entry) => entry.crewId === input.crewId);
  if (!ranking) throw new AppError("not_found", "Crew not found.");
  // Eligibility is enforced here, not only in the interface: an unqualified,
  // unavailable or full crew can never be given the job.
  if (!ranking.assignment) {
    throw new AppError("conflict", `${ranking.crewName} cannot take this incident. ${ranking.ineligibilityReason ?? ""}`.trim());
  }

  const rationale: AssignmentRationale = {
    reasons: ranking.assignment.reasons,
    straightLineKm: ranking.assignment.straightLineKm,
    travelMinutes: ranking.assignment.travelMinutes,
    queuePosition: ranking.assignment.queuePosition,
    origin: input.origin,
  };
  let assignmentId: string;
  try {
    const [created] = await db
      .insert(crewAssignments)
      .values({
        incidentId: incident.id,
        crewId: input.crewId,
        status: input.asProposal ? "proposed" : "assigned",
        rationale,
        createdByUserId: coordinatorId,
      })
      .returning({ id: crewAssignments.id });
    if (!created) throw new AppError("unavailable", "The assignment could not be saved.");
    assignmentId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "This incident already has a current assignment.");
    throw error;
  }
  if (!input.asProposal) {
    await transitionIncident(db, incident, "assigned", { actorKind: "coordinator", actorUserId: coordinatorId, manual: false });
  }
  await auditAssignment(db, incident, { id: assignmentId, crewId: input.crewId }, input.asProposal ? "assignment.proposed" : "assignment.assigned", "coordinator", coordinatorId, {
    crewName: ranking.crewName,
    origin: input.origin,
    straightLineKm: rationale.straightLineKm,
  });
  return assignmentId;
}

export async function createAssignment(actor: StaffActor | null, input: CreateAssignmentInput): Promise<string> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  return db.transaction((tx) => createAssignmentIn(tx, coordinator.userId, coordinator.organizationId, input));
}

/** Stores a batch of planner output as proposals. Each proposal still needs approval. */
export async function createProposals(
  actor: StaffActor | null,
  pairs: ReadonlyArray<{ incidentId: string; crewId: string }>,
): Promise<{ created: number; skipped: string[] }> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  let created = 0;
  const skipped: string[] = [];
  for (const pair of pairs) {
    try {
      await db.transaction((tx) =>
        createAssignmentIn(tx, coordinator.userId, coordinator.organizationId, { ...pair, origin: "plan", asProposal: true }),
      );
      created += 1;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      skipped.push(error.message);
    }
  }
  return { created, skipped };
}

export async function approveProposal(actor: StaffActor | null, assignmentId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const assignment = await loadAssignment(tx, assignmentId);
    const incident = await loadIncident(tx, assignment.incidentId);
    await moveAssignment(tx, assignment, "assigned", "coordinator");
    await transitionIncident(tx, incident, "assigned", { actorKind: "coordinator", actorUserId: coordinator.userId, manual: false });
    await auditAssignment(tx, incident, assignment, "assignment.approved", "coordinator", coordinator.userId);
  });
}

async function releaseIncident(db: Database, incident: Incident, actorKind: "coordinator" | "crew", actorUserId: string, reason: string): Promise<void> {
  if (incident.status === "assigned" || incident.status === "in_progress") {
    await transitionIncident(db, incident, "verified", { actorKind, actorUserId, reason, manual: false });
  }
}

export async function cancelAssignment(actor: StaffActor | null, assignmentId: string, reason: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const assignment = await loadAssignment(tx, assignmentId);
    const incident = await loadIncident(tx, assignment.incidentId);
    await moveAssignment(tx, assignment, "cancelled", "coordinator");
    await releaseIncident(tx, incident, "coordinator", coordinator.userId, `Assignment cancelled: ${reason}`);
    await auditAssignment(tx, incident, assignment, "assignment.cancelled", "coordinator", coordinator.userId, { reason });
  });
}

/** Cancels the current assignment and assigns a different crew in one transaction. */
export async function reassign(actor: StaffActor | null, assignmentId: string, newCrewId: string, reason: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const assignment = await loadAssignment(tx, assignmentId);
    if (assignment.crewId === newCrewId) throw new AppError("validation", "Choose a different crew to reassign to.");
    const incident = await loadIncident(tx, assignment.incidentId);
    await moveAssignment(tx, assignment, "cancelled", "coordinator");
    await releaseIncident(tx, incident, "coordinator", coordinator.userId, `Reassigned: ${reason}`);
    await auditAssignment(tx, incident, assignment, "assignment.cancelled", "coordinator", coordinator.userId, { reason, reassigned: true });
    await createAssignmentIn(tx, coordinator.userId, coordinator.organizationId, {
      incidentId: incident.id,
      crewId: newCrewId,
      origin: "manual",
      asProposal: false,
    });
  });
}

export async function verifyCompletion(actor: StaffActor | null, assignmentId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const assignment = await loadAssignment(tx, assignmentId);
    const incident = await loadIncident(tx, assignment.incidentId);
    await moveAssignment(tx, assignment, "verified", "coordinator", { assistanceRequested: false });
    await transitionIncident(tx, incident, "resolved", { actorKind: "coordinator", actorUserId: coordinator.userId, manual: false });
    await auditAssignment(tx, incident, assignment, "assignment.completion_verified", "coordinator", coordinator.userId);
  });
}

export async function returnForRework(actor: StaffActor | null, assignmentId: string, reason: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const assignment = await loadAssignment(tx, assignmentId);
    const incident = await loadIncident(tx, assignment.incidentId);
    await moveAssignment(tx, assignment, "in_progress", "coordinator");
    await tx.insert(incidentObservations).values({
      incidentId: incident.id,
      source: "coordinator",
      body: `Completion not accepted; returned to the crew. ${reason}`,
      authorUserId: coordinator.userId,
    });
    await auditAssignment(tx, incident, assignment, "assignment.returned_for_rework", "coordinator", coordinator.userId, { reason });
  });
}

export async function resolveAssistance(actor: StaffActor | null, assignmentId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const assignment = await loadAssignment(db, assignmentId);
  const incident = await loadIncident(db, assignment.incidentId);
  await db.update(crewAssignments).set({ assistanceRequested: false, updatedAt: new Date() }).where(eq(crewAssignments.id, assignmentId));
  await auditAssignment(db, incident, assignment, "assignment.assistance_resolved", "coordinator", coordinator.userId);
}

// ---------------------------------------------------------------------------
// Crew-side operations. Every one checks that the user belongs to the crew
// that holds the assignment.
// ---------------------------------------------------------------------------

/** Assignment states a crew member can see: approved work only, never proposals. */
const CREW_VISIBLE_STATUSES: AssignmentStatus[] = ["assigned", "accepted", "in_progress", "completed", "verified", "declined"];

async function loadForCrew(db: Database, actor: StaffActor | null, assignmentId: string) {
  const crew = requireCrew(actor);
  const assignment = await loadAssignment(db, assignmentId);
  requireCrewMembership(crew, assignment.crewId);
  if (!CREW_VISIBLE_STATUSES.includes(assignment.status)) throw new AppError("not_found", "Assignment not found.");
  return { crew, assignment, incident: await loadIncident(db, assignment.incidentId) };
}

export async function listCrewAssignments(actor: StaffActor | null) {
  const crew = requireCrew(actor);
  if (crew.crewIds.length === 0) return [];
  const db = await getDb();
  return db
    .select({
      id: crewAssignments.id,
      status: crewAssignments.status,
      updatedAt: crewAssignments.updatedAt,
      assistanceRequested: crewAssignments.assistanceRequested,
      crewName: maintenanceCrews.name,
      reference: incidents.reference,
      title: incidents.title,
      category: incidents.category,
      priorityBand: incidents.priorityBand,
      address: incidents.address,
      latitude: incidents.latitude,
      longitude: incidents.longitude,
    })
    .from(crewAssignments)
    .innerJoin(incidents, eq(crewAssignments.incidentId, incidents.id))
    .innerJoin(maintenanceCrews, eq(crewAssignments.crewId, maintenanceCrews.id))
    .where(and(inArray(crewAssignments.crewId, [...crew.crewIds]), inArray(crewAssignments.status, CREW_VISIBLE_STATUSES)))
    .orderBy(desc(crewAssignments.updatedAt));
}

/** Job details for a crew member. Reporter contact details and internal notes are not included. */
export async function getCrewAssignment(actor: StaffActor | null, assignmentId: string) {
  const db = await getDb();
  const { assignment, incident } = await loadForCrew(db, actor, assignmentId);
  const [crewRow] = await db.select({ name: maintenanceCrews.name }).from(maintenanceCrews).where(eq(maintenanceCrews.id, assignment.crewId)).limit(1);
  const images = await db
    .select({ id: incidentImages.id, kind: incidentImages.kind, createdAt: incidentImages.createdAt })
    .from(incidentImages)
    .where(eq(incidentImages.incidentId, incident.id))
    .orderBy(asc(incidentImages.createdAt));
  const fieldNotes = await db
    .select({ id: incidentObservations.id, body: incidentObservations.body, createdAt: incidentObservations.createdAt })
    .from(incidentObservations)
    .where(and(eq(incidentObservations.incidentId, incident.id), eq(incidentObservations.source, "crew")))
    .orderBy(desc(incidentObservations.createdAt));
  return {
    assignment,
    crewName: crewRow?.name ?? "",
    incident: {
      id: incident.id,
      reference: incident.reference,
      title: incident.title,
      description: incident.description,
      category: incident.category,
      priorityBand: incident.priorityBand,
      address: incident.address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      createdAt: incident.createdAt,
    },
    images,
    fieldNotes,
  };
}

export async function respondToAssignment(
  actor: StaffActor | null,
  assignmentId: string,
  response: "accepted" | "declined",
  reason: string | null,
): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const { crew, assignment, incident } = await loadForCrew(tx, actor, assignmentId);
    if (response === "declined") {
      if (!reason) throw new AppError("validation", "Give a reason for declining this assignment.", { reason: "Enter a reason." });
      await moveAssignment(tx, assignment, "declined", "crew", { declineReason: reason });
      await releaseIncident(tx, incident, "crew", crew.userId, `Crew declined the assignment: ${reason}`);
    } else {
      await moveAssignment(tx, assignment, "accepted", "crew");
    }
    await auditAssignment(tx, incident, assignment, `assignment.${response}`, "crew", crew.userId, { reason });
  });
}

export async function startWork(actor: StaffActor | null, assignmentId: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const { crew, assignment, incident } = await loadForCrew(tx, actor, assignmentId);
    await moveAssignment(tx, assignment, "in_progress", "crew");
    await transitionIncident(tx, incident, "in_progress", { actorKind: "crew", actorUserId: crew.userId, manual: false });
    await auditAssignment(tx, incident, assignment, "assignment.work_started", "crew", crew.userId);
  });
}

export async function addFieldNote(actor: StaffActor | null, assignmentId: string, body: string): Promise<void> {
  const db = await getDb();
  const { crew, assignment, incident } = await loadForCrew(db, actor, assignmentId);
  await db.insert(incidentObservations).values({ incidentId: incident.id, source: "crew", body, authorUserId: crew.userId });
  await auditAssignment(db, incident, assignment, "assignment.field_note_added", "crew", crew.userId);
}

export async function requestAssistance(actor: StaffActor | null, assignmentId: string, note: string): Promise<void> {
  const db = await getDb();
  const { crew, assignment, incident } = await loadForCrew(db, actor, assignmentId);
  if (!ACTIVE_ASSIGNMENT_STATUSES.includes(assignment.status)) {
    throw new AppError("conflict", "Assistance can only be requested on a current assignment.");
  }
  await db
    .update(crewAssignments)
    .set({ assistanceRequested: true, assistanceNote: note, updatedAt: new Date() })
    .where(eq(crewAssignments.id, assignmentId));
  await auditAssignment(db, incident, assignment, "assignment.assistance_requested", "crew", crew.userId, { note });
}

/**
 * Marks work complete. The incident is not resolved until a coordinator
 * verifies the completion. Evidence photographs are optional.
 */
export async function completeWork(
  actor: StaffActor | null,
  assignmentId: string,
  completionNotes: string,
  evidence: Uint8Array | null,
): Promise<void> {
  const image = evidence ? await processUploadedImage(evidence) : null;
  const db = await getDb();
  const { crew, assignment, incident } = await loadForCrew(db, actor, assignmentId);
  if (!canTransitionAssignment(assignment.status, "completed", "crew")) {
    throw new AppError("conflict", "Only work that is in progress can be marked complete.");
  }

  let storageKey: string | null = null;
  if (image) {
    storageKey = `completion/${incident.id}/${randomUUID()}.jpg`;
    await getImageStore().put(storageKey, image.bytes, image.contentType);
  }
  await db.transaction(async (tx) => {
    await moveAssignment(tx, assignment, "completed", "crew", { completionNotes });
    if (image && storageKey) {
      await tx.insert(incidentImages).values({
        incidentId: incident.id,
        kind: "completion",
        storageKey,
        contentType: image.contentType,
        byteSize: image.bytes.byteLength,
        width: image.width,
        height: image.height,
        uploadedByUserId: crew.userId,
      });
    }
    await auditAssignment(tx, incident, assignment, "assignment.work_completed", "crew", crew.userId, { withEvidence: image !== null });
  });
}

/** Proposals and completed work waiting on a coordinator, plus open assistance requests. */
export async function listAssignmentsNeedingAttention(actor: StaffActor | null) {
  requireCoordinator(actor);
  const db = await getDb();
  const rows = await db
    .select({
      id: crewAssignments.id,
      status: crewAssignments.status,
      assistanceRequested: crewAssignments.assistanceRequested,
      assistanceNote: crewAssignments.assistanceNote,
      rationale: crewAssignments.rationale,
      updatedAt: crewAssignments.updatedAt,
      crewName: maintenanceCrews.name,
      incidentId: incidents.id,
      reference: incidents.reference,
      title: incidents.title,
      priorityBand: incidents.priorityBand,
    })
    .from(crewAssignments)
    .innerJoin(incidents, eq(crewAssignments.incidentId, incidents.id))
    .innerJoin(maintenanceCrews, eq(crewAssignments.crewId, maintenanceCrews.id))
    .where(inArray(crewAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]))
    .orderBy(desc(crewAssignments.updatedAt));
  return rows.filter((row) => row.status === "proposed" || row.status === "completed" || row.assistanceRequested);
}
