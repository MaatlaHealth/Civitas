import { asc, eq, inArray, sql } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb, type Database } from "@/lib/db/client";
import { crewAssignments, crewMembers, maintenanceCrews, users, type MaintenanceCrew } from "@/lib/db/schema";
import { ACTIVE_ASSIGNMENT_STATUSES, type CrewStatus } from "@/lib/domain/types";
import type { PlanCrew } from "@/lib/engines/assignment";
import { AppError, isUniqueViolation } from "@/lib/errors";
import type { CrewInput } from "@/lib/validation/schemas";
import { recordAudit } from "./core";

export interface CrewWithWorkload extends MaintenanceCrew {
  activeWorkload: number;
}

/** Crews with the number of assignments currently occupying their capacity. */
export async function loadCrewsWithWorkload(db: Database, organizationId: string): Promise<CrewWithWorkload[]> {
  const crews = await db
    .select()
    .from(maintenanceCrews)
    .where(eq(maintenanceCrews.organizationId, organizationId))
    .orderBy(asc(maintenanceCrews.name));
  const workloads = await db
    .select({ crewId: crewAssignments.crewId, value: sql<number>`count(*)::int` })
    .from(crewAssignments)
    .where(inArray(crewAssignments.status, [...ACTIVE_ASSIGNMENT_STATUSES]))
    .groupBy(crewAssignments.crewId);
  const workloadByCrew = new Map(workloads.map((row) => [row.crewId, row.value]));
  return crews.map((crew) => ({ ...crew, activeWorkload: workloadByCrew.get(crew.id) ?? 0 }));
}

export function toPlanCrew(crew: CrewWithWorkload): PlanCrew {
  return {
    id: crew.id,
    name: crew.name,
    specialization: crew.specialization,
    status: crew.status,
    baseLatitude: crew.baseLatitude,
    baseLongitude: crew.baseLongitude,
    capacity: crew.capacity,
    activeWorkload: crew.activeWorkload,
  };
}

export async function listCrews(actor: StaffActor | null) {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const crews = await loadCrewsWithWorkload(db, coordinator.organizationId);
  const members = await db
    .select({ crewId: crewMembers.crewId, userId: users.id, name: users.name, email: users.email })
    .from(crewMembers)
    .innerJoin(users, eq(crewMembers.userId, users.id));
  return crews.map((crew) => ({ ...crew, members: members.filter((member) => member.crewId === crew.id) }));
}

export async function createCrew(actor: StaffActor | null, input: CrewInput): Promise<string> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  try {
    const [crew] = await db
      .insert(maintenanceCrews)
      .values({ ...input, organizationId: coordinator.organizationId })
      .returning({ id: maintenanceCrews.id });
    if (!crew) throw new AppError("unavailable", "The crew could not be created.");
    await recordAudit(db, {
      organizationId: coordinator.organizationId,
      actorKind: "coordinator",
      actorUserId: coordinator.userId,
      action: "crew.created",
      entityType: "crew",
      entityId: crew.id,
      detail: { name: input.name, specialization: input.specialization },
    });
    return crew.id;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "A crew with this name already exists.", { name: "Choose a different name." });
    throw error;
  }
}

export async function updateCrew(actor: StaffActor | null, crewId: string, input: CrewInput): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [before] = await db.select().from(maintenanceCrews).where(eq(maintenanceCrews.id, crewId)).limit(1);
  if (!before) throw new AppError("not_found", "Crew not found.");
  try {
    await db.update(maintenanceCrews).set({ ...input, updatedAt: new Date() }).where(eq(maintenanceCrews.id, crewId));
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "A crew with this name already exists.", { name: "Choose a different name." });
    throw error;
  }
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "crew.updated",
    entityType: "crew",
    entityId: crewId,
    detail: {
      before: { status: before.status, specialization: before.specialization, capacity: before.capacity },
      after: { status: input.status, specialization: input.specialization, capacity: input.capacity },
    },
  });
}

export async function setCrewStatus(actor: StaffActor | null, crewId: string, status: CrewStatus): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const [updated] = await db
    .update(maintenanceCrews)
    .set({ status, updatedAt: new Date() })
    .where(eq(maintenanceCrews.id, crewId))
    .returning({ id: maintenanceCrews.id });
  if (!updated) throw new AppError("not_found", "Crew not found.");
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "crew.status_changed",
    entityType: "crew",
    entityId: crewId,
    detail: { status },
  });
}
