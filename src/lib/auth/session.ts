import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db/client";
import { crewMembers, users } from "@/lib/db/schema";
import type { CoordinatorActor, CrewActor, StaffActor } from "./actor";
import { auth } from "./auth";

export interface StaffSession {
  actor: StaffActor;
  name: string;
  email: string;
  isEvaluation: boolean;
}

/**
 * Resolves the signed-in staff member for this request. The session token
 * only proves identity; role, active status and crew membership are read
 * from the database every time, so revoking access takes effect immediately.
 */
export const getStaffSession = cache(async (): Promise<StaffSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const db = await getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.active) return null;

  const base = { name: user.name, email: user.email, isEvaluation: user.isEvaluation };
  if (user.role === "coordinator") {
    return { ...base, actor: { kind: "coordinator", userId: user.id, organizationId: user.organizationId } };
  }
  const memberships = await db.select({ crewId: crewMembers.crewId }).from(crewMembers).where(eq(crewMembers.userId, user.id));
  return {
    ...base,
    actor: { kind: "crew", userId: user.id, organizationId: user.organizationId, crewIds: memberships.map((row) => row.crewId) },
  };
});

export async function getActor(): Promise<StaffActor | null> {
  return (await getStaffSession())?.actor ?? null;
}

/** For coordinator pages: redirects anyone who is not a signed-in coordinator. */
export async function requireCoordinatorSession(): Promise<StaffSession & { actor: CoordinatorActor }> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.actor.kind !== "coordinator") redirect("/crew");
  return { ...session, actor: session.actor };
}

/** For crew pages: redirects anyone who is not a signed-in crew member. */
export async function requireCrewSession(): Promise<StaffSession & { actor: CrewActor }> {
  const session = await getStaffSession();
  if (!session) redirect("/login");
  if (session.actor.kind !== "crew") redirect("/dashboard");
  return { ...session, actor: session.actor };
}
