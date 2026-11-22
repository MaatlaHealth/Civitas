import { and, between, count, desc, eq } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb, type Database } from "@/lib/db/client";
import { incidentImages, incidents, infrastructureAssets, priorityAssessments, type Incident } from "@/lib/db/schema";
import type { IncidentStatus, PriorityBand } from "@/lib/domain/types";
import { computePriority, type PriorityResult } from "@/lib/engines/priority";
import { DEFAULT_SCREENING_CONFIG, screenConsequences, type ScreeningResult } from "@/lib/engines/screening";
import { AppError } from "@/lib/errors";
import { boundingBox } from "@/lib/geo/haversine";
import { loadIncident, recordAudit, updateIncident } from "./core";

const VERIFIED_STATUSES: readonly IncidentStatus[] = ["verified", "assigned", "in_progress", "resolved", "closed"];

export async function screenIncident(db: Database, incident: Incident): Promise<ScreeningResult> {
  const box = boundingBox(incident, DEFAULT_SCREENING_CONFIG.radiusMeters);
  const nearby = await db
    .select()
    .from(infrastructureAssets)
    .where(
      and(
        eq(infrastructureAssets.organizationId, incident.organizationId),
        between(infrastructureAssets.latitude, box.minLatitude, box.maxLatitude),
        between(infrastructureAssets.longitude, box.minLongitude, box.maxLongitude),
      ),
    );
  return screenConsequences(incident, nearby);
}

export async function assessPriority(db: Database, incident: Incident, now = new Date()): Promise<PriorityResult> {
  const [photographs] = await db
    .select({ value: count() })
    .from(incidentImages)
    .where(and(eq(incidentImages.incidentId, incident.id), eq(incidentImages.kind, "report")));
  const [duplicates] = await db.select({ value: count() }).from(incidents).where(eq(incidents.duplicateOfId, incident.id));
  return computePriority({
    category: incident.category,
    confirmedSeverity: incident.confirmedSeverity,
    exposureLevel: incident.exposureLevel,
    obstructsAccess: incident.obstructsAccess,
    reportedDuration: incident.reportedDuration,
    hoursOpen: Math.max(0, (now.getTime() - incident.createdAt.getTime()) / 3_600_000),
    coordinatorVerified: VERIFIED_STATUSES.includes(incident.status),
    hasPhotograph: (photographs?.value ?? 0) > 0,
    confirmedDuplicateCount: duplicates?.value ?? 0,
    screening: await screenIncident(db, incident),
  });
}

/**
 * Recomputes and stores a priority assessment. A manual override keeps the
 * incident's band until it is cleared, but the computed assessment is still
 * recorded so coordinators can see what the engine would say.
 */
export async function recalculatePriority(db: Database, incidentId: string, actorUserId: string | null = null): Promise<Incident> {
  const incident = await loadIncident(db, incidentId);
  const result = await assessPriority(db, incident);
  await db.insert(priorityAssessments).values({
    incidentId,
    score: result.score,
    band: result.band,
    factors: result.factors,
    explanation: result.explanation,
    limitations: result.limitations,
    createdByUserId: actorUserId,
  });
  return updateIncident(db, incidentId, null, {
    priorityScore: result.score,
    ...(incident.priorityOverridden ? {} : { priorityBand: result.band }),
  });
}

export async function latestComputedAssessment(db: Database, incidentId: string) {
  const [assessment] = await db
    .select()
    .from(priorityAssessments)
    .where(and(eq(priorityAssessments.incidentId, incidentId), eq(priorityAssessments.isOverride, false)))
    .orderBy(desc(priorityAssessments.createdAt))
    .limit(1);
  return assessment ?? null;
}

export async function overridePriority(
  actor: StaffActor | null,
  input: { incidentId: string; version: number; band: Exclude<PriorityBand, "awaiting_review">; reason: string },
): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const incident = await loadIncident(tx, input.incidentId);
    if (incident.priorityBand === input.band && incident.priorityOverridden) {
      throw new AppError("validation", "The priority is already overridden to this value.");
    }
    const computed = await latestComputedAssessment(tx, incident.id);
    await updateIncident(tx, incident.id, input.version, { priorityBand: input.band, priorityOverridden: true });
    await tx.insert(priorityAssessments).values({
      incidentId: incident.id,
      score: incident.priorityScore,
      band: input.band,
      factors: computed?.factors ?? [],
      explanation: `Priority manually set to ${input.band} by a coordinator.`,
      limitations: [],
      isOverride: true,
      overrideReason: input.reason,
      previousBand: incident.priorityBand,
      createdByUserId: coordinator.userId,
    });
    await recordAudit(tx, {
      organizationId: incident.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: "priority.overridden",
      entityType: "incident",
      entityId: incident.id,
      incidentId: incident.id,
      detail: { previousBand: incident.priorityBand, newBand: input.band, reason: input.reason },
    });
  });
}

export async function clearPriorityOverride(actor: StaffActor | null, incidentId: string, version: number): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const incident = await loadIncident(tx, incidentId);
    if (!incident.priorityOverridden) throw new AppError("conflict", "This incident has no priority override.");
    await updateIncident(tx, incidentId, version, { priorityOverridden: false });
    const updated = await recalculatePriority(tx, incidentId, coordinator.userId);
    await recordAudit(tx, {
      organizationId: incident.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: "priority.override_cleared",
      entityType: "incident",
      entityId: incidentId,
      incidentId,
      detail: { previousBand: incident.priorityBand, newBand: updated.priorityBand },
    });
  });
}
