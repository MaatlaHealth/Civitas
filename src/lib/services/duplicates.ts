import { and, between, desc, eq, inArray, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb, type Database } from "@/lib/db/client";
import { duplicateCandidates, duplicateReviews, incidents, type Incident } from "@/lib/db/schema";
import { DUPLICATE_COMPARABLE_STATUSES } from "@/lib/domain/workflow";
import { findDuplicateCandidates, maxSearchRadiusMeters, type DuplicateSubject } from "@/lib/engines/duplicates";
import { AppError } from "@/lib/errors";
import { boundingBox } from "@/lib/geo/haversine";
import { loadIncident, recordAudit, updateIncident } from "./core";
import { recalculatePriority } from "./priority";

const toSubject = (incident: Incident): DuplicateSubject => ({
  id: incident.id,
  category: incident.category,
  title: incident.title,
  description: incident.description,
  latitude: incident.latitude,
  longitude: incident.longitude,
  reportedAt: incident.createdAt,
});

/**
 * Finds open reports near the given incident that may describe the same
 * physical problem and stores each pair for coordinator review. Nothing is
 * merged here. Returns the number of new candidate pairs.
 */
export async function detectDuplicates(db: Database, incident: Incident): Promise<number> {
  // The bounding box is an index-friendly prefilter; the engine applies the
  // exact per-category radius using Haversine distance.
  const box = boundingBox(incident, maxSearchRadiusMeters());
  const nearby = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.organizationId, incident.organizationId),
        ne(incidents.id, incident.id),
        inArray(incidents.status, [...DUPLICATE_COMPARABLE_STATUSES]),
        between(incidents.latitude, box.minLatitude, box.maxLatitude),
        between(incidents.longitude, box.minLongitude, box.maxLongitude),
      ),
    );

  const byId = new Map(nearby.map((other) => [other.id, other]));
  const matches = findDuplicateCandidates(toSubject(incident), nearby.map(toSubject));
  let created = 0;
  for (const match of matches) {
    const other = byId.get(match.otherIncidentId);
    if (!other) continue;
    const incidentIsEarlier = incident.createdAt.getTime() <= other.createdAt.getTime();
    const inserted = await db
      .insert(duplicateCandidates)
      .values({
        primaryIncidentId: incidentIsEarlier ? incident.id : other.id,
        laterIncidentId: incidentIsEarlier ? other.id : incident.id,
        score: match.score,
        distanceMeters: match.distanceMeters,
        hoursApart: match.hoursApart,
        components: match.components,
        explanation: match.explanation,
      })
      .onConflictDoNothing()
      .returning({ id: duplicateCandidates.id });
    created += inserted.length;
  }
  return created;
}

export type DuplicateDecision = "confirmed" | "rejected" | "reopened";

/**
 * Records a coordinator's decision on a candidate pair.
 *
 * Confirming links the later report to the earlier one; both records are
 * kept in full. Reopening a decision removes that link again, so a
 * confirmation is always reversible.
 */
export async function reviewDuplicate(
  actor: StaffActor | null,
  input: { candidateId: string; decision: DuplicateDecision; reason: string | null },
): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [candidate] = await tx.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, input.candidateId)).limit(1);
    if (!candidate) throw new AppError("not_found", "Duplicate candidate not found.");

    const reopening = input.decision === "reopened";
    if (reopening && candidate.status === "pending") {
      throw new AppError("conflict", "This pair is already awaiting review.");
    }
    if (!reopening && candidate.status !== "pending") {
      throw new AppError("conflict", "This pair has already been reviewed. Reopen it to change the decision.");
    }

    const primary = await loadIncident(tx, candidate.primaryIncidentId);
    const later = await loadIncident(tx, candidate.laterIncidentId);
    // If the earlier report is itself a confirmed duplicate, link to the report it points to.
    const canonicalId = primary.duplicateOfId ?? primary.id;

    if (input.decision === "confirmed") {
      if (later.duplicateOfId && later.duplicateOfId !== canonicalId) {
        throw new AppError("conflict", "The later report is already confirmed as a duplicate of a different incident.");
      }
      await updateIncident(tx, later.id, null, { duplicateOfId: canonicalId });
    }
    if (reopening && candidate.status === "confirmed" && later.duplicateOfId === canonicalId) {
      await updateIncident(tx, later.id, null, { duplicateOfId: null });
    }

    await tx
      .update(duplicateCandidates)
      .set({ status: input.decision === "reopened" ? "pending" : input.decision, updatedAt: new Date() })
      .where(eq(duplicateCandidates.id, candidate.id));
    await tx.insert(duplicateReviews).values({
      candidateId: candidate.id,
      decision: input.decision,
      reason: input.reason,
      reviewerUserId: coordinator.userId,
    });
    await recordAudit(tx, {
      organizationId: primary.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: `duplicate.${input.decision}`,
      entityType: "duplicate_candidate",
      entityId: candidate.id,
      incidentId: canonicalId,
      detail: { primaryReference: primary.reference, laterReference: later.reference, score: candidate.score, reason: input.reason },
    });
    // Confirmed matches count as corroborating evidence, so the score changes.
    await recalculatePriority(tx, canonicalId, coordinator.userId);
  });
}

const primaryIncident = alias(incidents, "primary_incident");
const laterIncident = alias(incidents, "later_incident");

const candidateSelection = {
  id: duplicateCandidates.id,
  status: duplicateCandidates.status,
  score: duplicateCandidates.score,
  distanceMeters: duplicateCandidates.distanceMeters,
  hoursApart: duplicateCandidates.hoursApart,
  components: duplicateCandidates.components,
  explanation: duplicateCandidates.explanation,
  createdAt: duplicateCandidates.createdAt,
  primary: {
    id: primaryIncident.id,
    reference: primaryIncident.reference,
    title: primaryIncident.title,
    description: primaryIncident.description,
    category: primaryIncident.category,
    status: primaryIncident.status,
    createdAt: primaryIncident.createdAt,
  },
  later: {
    id: laterIncident.id,
    reference: laterIncident.reference,
    title: laterIncident.title,
    description: laterIncident.description,
    category: laterIncident.category,
    status: laterIncident.status,
    createdAt: laterIncident.createdAt,
  },
};

function candidateQuery(db: Database) {
  return db
    .select(candidateSelection)
    .from(duplicateCandidates)
    .innerJoin(primaryIncident, eq(duplicateCandidates.primaryIncidentId, primaryIncident.id))
    .innerJoin(laterIncident, eq(duplicateCandidates.laterIncidentId, laterIncident.id));
}

export type DuplicateCandidateView = Awaited<ReturnType<typeof listDuplicateCandidates>>[number];

export async function listDuplicateCandidates(actor: StaffActor | null, status?: "pending" | "confirmed" | "rejected") {
  requireCoordinator(actor);
  const db = await getDb();
  return candidateQuery(db)
    .where(status ? eq(duplicateCandidates.status, status) : undefined)
    .orderBy(desc(duplicateCandidates.createdAt))
    .limit(200);
}

export async function listCandidatesForIncident(db: Database, incidentId: string) {
  return candidateQuery(db)
    .where(or(eq(duplicateCandidates.primaryIncidentId, incidentId), eq(duplicateCandidates.laterIncidentId, incidentId)))
    .orderBy(desc(duplicateCandidates.score));
}
