import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { auditEvents, incidents, incidentStatusHistory, organizations, type Incident } from "@/lib/db/schema";
import type { IncidentStatus } from "@/lib/domain/types";
import { findTransition } from "@/lib/domain/workflow";
import { AppError, CONCURRENT_UPDATE_MESSAGE } from "@/lib/errors";

export type ActorKind = "system" | "citizen" | "coordinator" | "crew";

const DEFAULT_ORGANIZATION_NAME = "Civitas operations";

/**
 * Civitas currently serves one organisation per deployment. The schema
 * carries organisation ids so that multi-tenancy can be added without a
 * data migration.
 */
export async function getOrganizationId(db: Database): Promise<string> {
  const [existing] = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.createdAt)).limit(1);
  if (existing) return existing.id;
  const name = process.env.CIVITAS_ORGANIZATION_NAME || DEFAULT_ORGANIZATION_NAME;
  await db.insert(organizations).values({ name }).onConflictDoNothing();
  const [created] = await db.select({ id: organizations.id }).from(organizations).orderBy(asc(organizations.createdAt)).limit(1);
  if (!created) throw new AppError("unavailable", "The organisation record could not be created.");
  return created.id;
}

export interface AuditInput {
  organizationId: string;
  actorKind: ActorKind;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  incidentId?: string | null;
  detail?: Record<string, unknown>;
}

export async function recordAudit(db: Database, event: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    organizationId: event.organizationId,
    actorKind: event.actorKind,
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    incidentId: event.incidentId ?? null,
    detail: event.detail ?? {},
  });
}

export async function loadIncident(db: Database, incidentId: string): Promise<Incident> {
  const [incident] = await db.select().from(incidents).where(eq(incidents.id, incidentId)).limit(1);
  if (!incident) throw new AppError("not_found", "Incident not found.");
  return incident;
}

/**
 * Applies a patch with optimistic concurrency control. When `expectedVersion`
 * is given and the stored version differs, another user changed the record
 * first and the update is refused rather than overwriting their change.
 */
export async function updateIncident(
  db: Database,
  incidentId: string,
  expectedVersion: number | null,
  patch: Partial<typeof incidents.$inferInsert>,
): Promise<Incident> {
  const condition =
    expectedVersion === null
      ? eq(incidents.id, incidentId)
      : and(eq(incidents.id, incidentId), eq(incidents.version, expectedVersion));
  const [updated] = await db
    .update(incidents)
    .set({ ...patch, version: sql`${incidents.version} + 1`, updatedAt: new Date() })
    .where(condition)
    .returning();
  if (!updated) throw new AppError("conflict", CONCURRENT_UPDATE_MESSAGE);
  return updated;
}

export interface TransitionOptions {
  actorKind: ActorKind;
  actorUserId?: string | null;
  reason?: string | null;
  /** True when a person requested the change directly from the status control. */
  manual: boolean;
}

/** Validates and applies a status change, recording it in the status history and audit trail. */
export async function transitionIncident(
  db: Database,
  incident: Incident,
  toStatus: IncidentStatus,
  options: TransitionOptions,
): Promise<Incident> {
  const rule = findTransition(incident.status, toStatus);
  if (!rule) {
    throw new AppError("conflict", `An incident cannot move from "${incident.status}" to "${toStatus}".`);
  }
  if (options.manual && rule.automatic) {
    throw new AppError("conflict", `"${toStatus}" is set automatically by the assignment workflow and cannot be chosen directly.`);
  }
  if (options.manual && rule.requiresReason && !options.reason) {
    throw new AppError("validation", "A reason is required for this status change.", { reason: "Enter a reason." });
  }
  const updated = await updateIncident(db, incident.id, incident.version, { status: toStatus });
  await db.insert(incidentStatusHistory).values({
    incidentId: incident.id,
    fromStatus: incident.status,
    toStatus,
    reason: options.reason ?? null,
    actorKind: options.actorKind,
    actorUserId: options.actorUserId ?? null,
  });
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: options.actorKind,
    actorUserId: options.actorUserId,
    action: "incident.status_changed",
    entityType: "incident",
    entityId: incident.id,
    incidentId: incident.id,
    detail: { from: incident.status, to: toStatus, reason: options.reason ?? null },
  });
  return updated;
}
