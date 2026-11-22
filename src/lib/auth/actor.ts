import { AppError } from "@/lib/errors";

/**
 * Who is performing an operation. Every service function that changes or
 * reveals protected data takes an Actor and checks it, so authorisation is
 * enforced on the server regardless of which page or route called it.
 */
export interface CoordinatorActor {
  kind: "coordinator";
  userId: string;
  organizationId: string;
}

export interface CrewActor {
  kind: "crew";
  userId: string;
  organizationId: string;
  /** Crews this user belongs to. */
  crewIds: readonly string[];
}

export type StaffActor = CoordinatorActor | CrewActor;

export function requireCoordinator(actor: StaffActor | null | undefined): CoordinatorActor {
  if (!actor) throw new AppError("unauthenticated", "Please sign in to continue.");
  if (actor.kind !== "coordinator") {
    throw new AppError("forbidden", "Only coordinators can perform this action.");
  }
  return actor;
}

export function requireCrew(actor: StaffActor | null | undefined): CrewActor {
  if (!actor) throw new AppError("unauthenticated", "Please sign in to continue.");
  if (actor.kind !== "crew") throw new AppError("forbidden", "Only crew members can perform this action.");
  return actor;
}

export function requireCrewMembership(actor: CrewActor, crewId: string): void {
  if (!actor.crewIds.includes(crewId)) {
    throw new AppError("forbidden", "This assignment belongs to a crew you are not a member of.");
  }
}
