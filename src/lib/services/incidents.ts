import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { classifyByRules } from "@/lib/ai/rule-classifier";
import { getDb } from "@/lib/db/client";
import {
  aiAnalyses,
  auditEvents,
  crewAssignments,
  incidentImages,
  incidentObservations,
  incidents,
  incidentStatusHistory,
  maintenanceCrews,
  priorityAssessments,
  publicUpdates,
  reporterContacts,
  users,
} from "@/lib/db/schema";
import type { IncidentCategory } from "@/lib/domain/categories";
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  type ExposureLevel,
  type IncidentStatus,
  type PriorityBand,
  type SeverityLevel,
} from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { getImageStore } from "@/lib/storage/image-store";
import { loadIncident, recordAudit, transitionIncident, updateIncident } from "./core";
import { listCandidatesForIncident } from "./duplicates";
import { runIntakeChecks } from "./intake";
import { recalculatePriority, screenIncident } from "./priority";

export const INCIDENT_PAGE_SIZE = 25;

export interface IncidentFilters {
  search?: string;
  priority?: PriorityBand;
  category?: IncidentCategory;
  status?: IncidentStatus;
  assignment?: "assigned" | "unassigned";
  review?: "needs_review" | "overridden" | "duplicate";
  from?: Date;
  to?: Date;
  sort?: "newest" | "oldest" | "priority";
  page?: number;
}

/** Orders bands from most to least severe, with unassessed incidents last. */
const PRIORITY_RANK = sql`case ${incidents.priorityBand}
  when 'critical' then 0 when 'high' then 1 when 'moderate' then 2 when 'low' then 3 else 4 end`;

const activeAssignment = and(
  eq(crewAssignments.incidentId, incidents.id),
  inArray(crewAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]),
);

function buildConditions(filters: IncidentFilters): SQL | undefined {
  const conditions: Array<SQL | undefined> = [];
  if (filters.search) {
    const pattern = `%${filters.search.replace(/[%_\\]/g, "\\$&")}%`;
    conditions.push(
      or(ilike(incidents.reference, pattern), ilike(incidents.title, pattern), ilike(incidents.address, pattern)),
    );
  }
  if (filters.priority) conditions.push(eq(incidents.priorityBand, filters.priority));
  if (filters.category) conditions.push(eq(incidents.category, filters.category));
  if (filters.status) conditions.push(eq(incidents.status, filters.status));
  if (filters.from) conditions.push(gte(incidents.createdAt, filters.from));
  if (filters.to) conditions.push(lte(incidents.createdAt, filters.to));
  if (filters.assignment === "assigned") conditions.push(sql`${crewAssignments.id} is not null`);
  if (filters.assignment === "unassigned") conditions.push(isNull(crewAssignments.id));
  if (filters.review === "needs_review") conditions.push(inArray(incidents.status, ["submitted", "awaiting_review"]));
  if (filters.review === "overridden") conditions.push(eq(incidents.priorityOverridden, true));
  if (filters.review === "duplicate") conditions.push(sql`${incidents.duplicateOfId} is not null`);
  return and(...conditions);
}

export type IncidentListItem = Awaited<ReturnType<typeof listIncidents>>["items"][number];

export async function listIncidents(actor: StaffActor | null, filters: IncidentFilters = {}) {
  requireCoordinator(actor);
  const db = await getDb();
  const where = buildConditions(filters);
  const page = Math.max(1, filters.page ?? 1);
  const order =
    filters.sort === "oldest"
      ? [asc(incidents.createdAt)]
      : filters.sort === "priority"
        ? [asc(PRIORITY_RANK), desc(incidents.priorityScore), desc(incidents.createdAt)]
        : [desc(incidents.createdAt)];

  const base = () =>
    db
      .select({
        id: incidents.id,
        reference: incidents.reference,
        title: incidents.title,
        category: incidents.category,
        address: incidents.address,
        latitude: incidents.latitude,
        longitude: incidents.longitude,
        status: incidents.status,
        priorityBand: incidents.priorityBand,
        priorityScore: incidents.priorityScore,
        priorityOverridden: incidents.priorityOverridden,
        duplicateOfId: incidents.duplicateOfId,
        createdAt: incidents.createdAt,
        crewName: maintenanceCrews.name,
        assignmentStatus: crewAssignments.status,
      })
      .from(incidents)
      .leftJoin(crewAssignments, activeAssignment)
      .leftJoin(maintenanceCrews, eq(crewAssignments.crewId, maintenanceCrews.id));

  const items = await base()
    .where(where)
    .orderBy(...order)
    .limit(INCIDENT_PAGE_SIZE)
    .offset((page - 1) * INCIDENT_PAGE_SIZE);
  const [total] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(incidents)
    .leftJoin(crewAssignments, activeAssignment)
    .where(where);
  const totalCount = total?.value ?? 0;
  return { items, totalCount, page, pageCount: Math.max(1, Math.ceil(totalCount / INCIDENT_PAGE_SIZE)) };
}

/** Every incident with a location, for the operations map and CSV export. */
export async function listIncidentsForMap(actor: StaffActor | null) {
  requireCoordinator(actor);
  const db = await getDb();
  return db
    .select({
      id: incidents.id,
      reference: incidents.reference,
      title: incidents.title,
      category: incidents.category,
      status: incidents.status,
      priorityBand: incidents.priorityBand,
      latitude: incidents.latitude,
      longitude: incidents.longitude,
      address: incidents.address,
      createdAt: incidents.createdAt,
    })
    .from(incidents)
    .where(notInArray(incidents.status, ["closed", "rejected"]))
    .orderBy(desc(incidents.createdAt))
    .limit(2000);
}

export type IncidentDetail = Awaited<ReturnType<typeof getIncidentDetail>>;

export async function getIncidentDetail(actor: StaffActor | null, incidentId: string) {
  requireCoordinator(actor);
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);

  const [contact] = await db.select().from(reporterContacts).where(eq(reporterContacts.incidentId, incidentId)).limit(1);
  const images = await db.select().from(incidentImages).where(eq(incidentImages.incidentId, incidentId)).orderBy(asc(incidentImages.createdAt));
  const [analysis] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.incidentId, incidentId)).orderBy(desc(aiAnalyses.createdAt)).limit(1);
  const observations = await db
    .select({
      id: incidentObservations.id,
      source: incidentObservations.source,
      body: incidentObservations.body,
      createdAt: incidentObservations.createdAt,
      authorName: users.name,
    })
    .from(incidentObservations)
    .leftJoin(users, eq(incidentObservations.authorUserId, users.id))
    .where(eq(incidentObservations.incidentId, incidentId))
    .orderBy(desc(incidentObservations.createdAt));
  const assessments = await db
    .select()
    .from(priorityAssessments)
    .where(eq(priorityAssessments.incidentId, incidentId))
    .orderBy(desc(priorityAssessments.createdAt))
    .limit(20);
  const assignments = await db
    .select({ assignment: crewAssignments, crewName: maintenanceCrews.name })
    .from(crewAssignments)
    .innerJoin(maintenanceCrews, eq(crewAssignments.crewId, maintenanceCrews.id))
    .where(eq(crewAssignments.incidentId, incidentId))
    .orderBy(desc(crewAssignments.createdAt));
  const history = await db
    .select({
      id: incidentStatusHistory.id,
      fromStatus: incidentStatusHistory.fromStatus,
      toStatus: incidentStatusHistory.toStatus,
      reason: incidentStatusHistory.reason,
      actorKind: incidentStatusHistory.actorKind,
      actorName: users.name,
      createdAt: incidentStatusHistory.createdAt,
    })
    .from(incidentStatusHistory)
    .leftJoin(users, eq(incidentStatusHistory.actorUserId, users.id))
    .where(eq(incidentStatusHistory.incidentId, incidentId))
    .orderBy(asc(incidentStatusHistory.createdAt));
  const updates = await db.select().from(publicUpdates).where(eq(publicUpdates.incidentId, incidentId)).orderBy(desc(publicUpdates.createdAt));
  const audit = await db
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      actorKind: auditEvents.actorKind,
      actorName: users.name,
      detail: auditEvents.detail,
      createdAt: auditEvents.createdAt,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.actorUserId, users.id))
    .where(eq(auditEvents.incidentId, incidentId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);
  const duplicateOf = incident.duplicateOfId ? await loadIncident(db, incident.duplicateOfId) : null;

  return {
    incident,
    contact: contact ?? null,
    images,
    analysis: analysis ?? null,
    ruleClassification: classifyByRules(incident.reportedCategory, incident.title, incident.description),
    observations,
    latestAssessment: assessments.find((assessment) => !assessment.isOverride) ?? null,
    overrides: assessments.filter((assessment) => assessment.isOverride),
    screening: await screenIncident(db, incident),
    duplicateCandidates: await listCandidatesForIncident(db, incidentId),
    duplicateOf: duplicateOf ? { id: duplicateOf.id, reference: duplicateOf.reference } : null,
    assignments,
    history,
    updates,
    audit,
  };
}

export async function updateClassification(
  actor: StaffActor | null,
  input: {
    incidentId: string;
    version: number;
    category: IncidentCategory;
    confirmedSeverity: SeverityLevel | null;
    exposureLevel: ExposureLevel | null;
  },
): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const before = await loadIncident(tx, input.incidentId);
    if (before.status === "closed") throw new AppError("conflict", "Closed incidents cannot be reclassified.");
    await updateIncident(tx, input.incidentId, input.version, {
      category: input.category,
      confirmedSeverity: input.confirmedSeverity,
      exposureLevel: input.exposureLevel,
    });
    await recordAudit(tx, {
      organizationId: before.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: "incident.classification_updated",
      entityType: "incident",
      entityId: before.id,
      incidentId: before.id,
      detail: {
        before: { category: before.category, confirmedSeverity: before.confirmedSeverity, exposureLevel: before.exposureLevel },
        after: { category: input.category, confirmedSeverity: input.confirmedSeverity, exposureLevel: input.exposureLevel },
      },
    });
    await recalculatePriority(tx, input.incidentId, coordinator.userId);
  });
}

export async function changeStatus(
  actor: StaffActor | null,
  input: { incidentId: string; version: number; toStatus: IncidentStatus; reason: string | null },
): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const incident = await loadIncident(tx, input.incidentId);
    if (incident.version !== input.version) {
      throw new AppError("conflict", "This record was changed by someone else while you were viewing it. Reload the page and try again.");
    }
    await transitionIncident(tx, incident, input.toStatus, {
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      reason: input.reason,
      manual: true,
    });
    // Verification is an input to the evidence factor, so the score changes with status.
    await recalculatePriority(tx, input.incidentId, coordinator.userId);
  });
}

export async function addInternalNote(actor: StaffActor | null, incidentId: string, body: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);
  await db.insert(incidentObservations).values({ incidentId, source: "coordinator", body, authorUserId: coordinator.userId });
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "incident.note_added",
    entityType: "incident",
    entityId: incidentId,
    incidentId,
  });
}

export async function publishPublicUpdate(actor: StaffActor | null, incidentId: string, body: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const incident = await loadIncident(tx, incidentId);
    await tx.insert(publicUpdates).values({ incidentId, body, authorUserId: coordinator.userId });
    await updateIncident(tx, incidentId, null, {});
    await recordAudit(tx, {
      organizationId: incident.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: "incident.public_update_published",
      entityType: "incident",
      entityId: incidentId,
      incidentId,
    });
  });
}

/** Re-runs duplicate detection and priority assessment for an incident. */
export async function rerunIntakeChecks(actor: StaffActor | null, incidentId: string): Promise<number> {
  const coordinator = requireCoordinator(actor);
  const created = await runIntakeChecks(incidentId);
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "incident.checks_rerun",
    entityType: "incident",
    entityId: incidentId,
    incidentId,
    detail: { newDuplicateCandidates: created },
  });
  return created;
}

/** Permanently erases the reporter's contact details while keeping the incident. */
export async function eraseReporterContact(actor: StaffActor | null, incidentId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);
  const deleted = await db.delete(reporterContacts).where(eq(reporterContacts.incidentId, incidentId)).returning({ id: reporterContacts.incidentId });
  if (deleted.length === 0) throw new AppError("not_found", "This incident has no stored contact details.");
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "incident.reporter_contact_erased",
    entityType: "incident",
    entityId: incidentId,
    incidentId,
  });
}

/** Permanently deletes a photograph from storage and the database. */
export async function deleteIncidentImage(actor: StaffActor | null, imageId: string): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [image] = await db.select().from(incidentImages).where(eq(incidentImages.id, imageId)).limit(1);
  if (!image) throw new AppError("not_found", "Photograph not found.");
  const incident = await loadIncident(db, image.incidentId);
  await getImageStore().delete(image.storageKey);
  await db.delete(incidentImages).where(eq(incidentImages.id, imageId));
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "incident.image_deleted",
    entityType: "incident_image",
    entityId: imageId,
    incidentId: incident.id,
    detail: { kind: image.kind },
  });
}
