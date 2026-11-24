import { createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, asc, eq, like } from "drizzle-orm";
import { z } from "zod";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { crewMembers, maintenanceCrews, users } from "@/lib/db/schema";
import { USER_ROLES } from "@/lib/domain/types";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { getOrganizationId, recordAudit } from "./core";

/**
 * Staff accounts: the one-time creation of the first coordinator, and
 * account management by coordinators afterwards. Passwords are stored only
 * as bcrypt hashes and are never returned or logged.
 */
const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;
/** Every real password hash starts with this; demo accounts store a marker that does not. */
const BCRYPT_PREFIX = "$2";

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(200, "Use a password of at most 200 characters.");
const name = z
  .string()
  .transform((value) => value.replace(/[\u0000-\u001F\u007F]/g, "").trim())
  .pipe(z.string().min(2, "Enter a name of at least 2 characters.").max(80, "Use a name of at most 80 characters."));
const email = z.email("Enter a valid email address.").transform((value) => value.toLowerCase());

export const firstAccountSchema = z.object({ name, email, password, setupCode: z.string().min(1, "Enter the setup code.") });
export const newAccountSchema = z.object({
  name,
  email,
  password,
  role: z.enum(USER_ROLES),
  crewId: z.union([z.uuid(), z.literal("")]).optional(),
});
export const passwordResetSchema = z.object({ userId: z.uuid(), password });

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** True while no account with a real password exists, so the first coordinator can still be created. */
export async function setupAvailable(): Promise<boolean> {
  const db = await getDb();
  const existing = await db.$count(users, like(users.passwordHash, `${BCRYPT_PREFIX}%`));
  return existing === 0;
}

export function setupCodeConfigured(): boolean {
  return Boolean(process.env.CIVITAS_SETUP_CODE);
}

/**
 * Creates the first coordinator. Allowed only once, and only by someone who
 * knows the setup code configured on the server, so a stranger who finds a
 * freshly deployed site cannot claim it.
 */
export async function createFirstCoordinator(input: z.infer<typeof firstAccountSchema>): Promise<void> {
  const expected = process.env.CIVITAS_SETUP_CODE;
  if (!expected) throw new AppError("forbidden", "Setup is not enabled: no setup code is configured on the server.");
  if (!timingSafeEqual(sha256(input.setupCode), sha256(expected))) {
    throw new AppError("forbidden", "That setup code is not correct.", { setupCode: "Check the setup code." });
  }
  if (!(await setupAvailable())) {
    throw new AppError("conflict", "Setup has already been completed. Sign in, or ask a coordinator for an account.");
  }
  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    const [user] = await db
      .insert(users)
      .values({ organizationId, email: input.email, name: input.name, role: "coordinator", passwordHash })
      .returning({ id: users.id });
    if (!user) throw new AppError("unavailable", "The account could not be created.");
    await recordAudit(db, { organizationId, actorKind: "system", action: "account.first_coordinator_created", entityType: "user", entityId: user.id });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "An account with this email address already exists.");
    throw error;
  }
}

export async function listAccounts(actor: StaffActor | null) {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, active: users.active, isDemo: users.isEvaluation, passwordHash: users.passwordHash, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, coordinator.organizationId))
    .orderBy(asc(users.name));
  const memberships = await db
    .select({ userId: crewMembers.userId, crewName: maintenanceCrews.name })
    .from(crewMembers)
    .innerJoin(maintenanceCrews, eq(crewMembers.crewId, maintenanceCrews.id));
  return rows.map(({ passwordHash, ...row }) => ({
    ...row,
    canSignInWithPassword: passwordHash.startsWith(BCRYPT_PREFIX),
    crews: memberships.filter((membership) => membership.userId === row.id).map((membership) => membership.crewName),
  }));
}

export async function createAccount(actor: StaffActor | null, input: z.infer<typeof newAccountSchema>): Promise<void> {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ organizationId: coordinator.organizationId, email: input.email, name: input.name, role: input.role, passwordHash })
        .returning({ id: users.id });
      if (!user) throw new AppError("unavailable", "The account could not be created.");
      if (input.role === "crew" && input.crewId) {
        const [crew] = await tx
          .select({ id: maintenanceCrews.id })
          .from(maintenanceCrews)
          .where(and(eq(maintenanceCrews.id, input.crewId), eq(maintenanceCrews.organizationId, coordinator.organizationId)))
          .limit(1);
        if (!crew) throw new AppError("validation", "Choose an existing crew.", { crewId: "Choose a crew." });
        await tx.insert(crewMembers).values({ crewId: crew.id, userId: user.id });
      }
      await recordAudit(tx, {
        organizationId: coordinator.organizationId,
        actorKind: "coordinator",
        actorUserId: coordinator.userId,
        action: "account.created",
        entityType: "user",
        entityId: user.id,
        detail: { role: input.role },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError("conflict", "An account with this email address already exists.", { email: "Use a different email address." });
    throw error;
  }
}

async function loadAccount(coordinatorOrganizationId: string, userId: string) {
  const db = await getDb();
  const [user] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.organizationId, coordinatorOrganizationId))).limit(1);
  if (!user) throw new AppError("not_found", "Account not found.");
  return user;
}

export async function setAccountActive(actor: StaffActor | null, userId: string, active: boolean): Promise<void> {
  const coordinator = requireCoordinator(actor);
  if (userId === coordinator.userId && !active) throw new AppError("conflict", "You cannot deactivate your own account.");
  await loadAccount(coordinator.organizationId, userId);
  const db = await getDb();
  await db.update(users).set({ active }).where(eq(users.id, userId));
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: active ? "account.reactivated" : "account.deactivated",
    entityType: "user",
    entityId: userId,
  });
}

/** Sets a new password for an account (including the coordinator's own). */
export async function resetAccountPassword(actor: StaffActor | null, input: z.infer<typeof passwordResetSchema>): Promise<void> {
  const coordinator = requireCoordinator(actor);
  await loadAccount(coordinator.organizationId, input.userId);
  const db = await getDb();
  await db.update(users).set({ passwordHash: await bcrypt.hash(input.password, BCRYPT_COST), isEvaluation: false }).where(eq(users.id, input.userId));
  await recordAudit(db, {
    organizationId: coordinator.organizationId,
    actorKind: "coordinator",
    actorUserId: coordinator.userId,
    action: "account.password_reset",
    entityType: "user",
    entityId: input.userId,
  });
}
