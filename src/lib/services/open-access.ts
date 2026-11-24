import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { crewMembers, maintenanceCrews, users } from "@/lib/db/schema";
import { USER_ROLES, type UserRole } from "@/lib/domain/types";
import { getOrganizationId } from "./core";

/**
 * Open demo access: sign in with a name only, no password.
 *
 * This exists so prospective customers can try the coordinator and crew
 * workspaces without being sent credentials. It removes the protection on
 * everything staff can see, including reporter contact details and
 * photographs, so it is off unless CIVITAS_OPEN_ACCESS is set to "true" and
 * must never be enabled on a deployment that holds real reports. While it is
 * on, the site banner and the report form tell visitors not to enter real
 * personal details.
 */
export function openAccessEnabled(): boolean {
  return process.env.CIVITAS_OPEN_ACCESS === "true";
}

export const openAccessSchema = z.object({
  name: z
    .string()
    .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(2, "Enter your name (at least 2 characters).").max(60, "Use a name of at most 60 characters.")),
  role: z.enum(USER_ROLES),
  crewId: z.union([z.uuid(), z.literal("")]).optional(),
});

/** Crews a visitor can join when signing in as a crew member. */
export async function listCrewsForOpenAccess(): Promise<Array<{ id: string; name: string }>> {
  const db = await getDb();
  return db.select({ id: maintenanceCrews.id, name: maintenanceCrews.name }).from(maintenanceCrews).orderBy(asc(maintenanceCrews.name));
}

/**
 * Creates a labelled demo account for this visitor. The stored
 * "password hash" is not a valid bcrypt hash, so the account can never be
 * used through the password sign-in.
 */
export async function createOpenAccessUser(input: { name: string; role: UserRole; crewId?: string }) {
  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  const [user] = await db
    .insert(users)
    .values({
      organizationId,
      email: `${randomUUID()}@open-access.invalid`,
      name: input.name,
      role: input.role,
      passwordHash: "open-access:no-password",
      isEvaluation: true,
    })
    .returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  if (!user) throw new Error("The demo account could not be created.");

  if (input.role === "crew" && input.crewId) {
    const [crew] = await db.select({ id: maintenanceCrews.id }).from(maintenanceCrews).where(eq(maintenanceCrews.id, input.crewId)).limit(1);
    if (crew) await db.insert(crewMembers).values({ crewId: crew.id, userId: user.id });
  }
  return user;
}
