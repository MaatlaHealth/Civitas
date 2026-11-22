/**
 * Prepares a fresh embedded database for the end-to-end run: applies the
 * migrations and creates the staff accounts and crews the journey needs.
 * It runs before the web server starts, so the two never open the database
 * at the same time. Citizen reports are NOT seeded; the tests create them
 * through the real interface.
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { E2E_ACCOUNTS, E2E_CREWS, E2E_LOCATION, e2ePassword } from "./accounts";

async function main(): Promise<void> {
  const directory = process.env.CIVITAS_EMBEDDED_DB_DIR;
  if (!directory || !directory.replaceAll("\\", "/").includes(".data/e2e")) {
    throw new Error("Refusing to seed: CIVITAS_EMBEDDED_DB_DIR must point inside .data/e2e.");
  }
  await rm(path.resolve(".data/e2e"), { recursive: true, force: true });

  const { getDb } = await import("../../src/lib/db/client");
  const { crewMembers, users } = await import("../../src/lib/db/schema");
  const { getOrganizationId } = await import("../../src/lib/services/core");
  const { createCrew } = await import("../../src/lib/services/crews");

  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  // Low cost factor: these accounts exist only for the duration of the test run.
  const passwordHash = await bcrypt.hash(e2ePassword(), 6);

  const createUser = async (account: { email: string; name: string }, role: "coordinator" | "crew") => {
    const [user] = await db
      .insert(users)
      .values({ organizationId, email: account.email, name: account.name, role, passwordHash, isEvaluation: true })
      .returning({ id: users.id });
    return user!.id;
  };

  const coordinatorId = await createUser(E2E_ACCOUNTS.coordinator, "coordinator");
  const crewUserId = await createUser(E2E_ACCOUNTS.crew, "crew");
  const otherCrewUserId = await createUser(E2E_ACCOUNTS.otherCrew, "crew");

  const coordinator = { kind: "coordinator" as const, userId: coordinatorId, organizationId };
  const base = { status: "available" as const, capacity: 2, shiftNotes: null };
  const waterCrewId = await createCrew(coordinator, {
    ...base,
    name: E2E_CREWS.water,
    specialization: "water_infrastructure",
    baseLabel: "E2E depot north",
    baseLatitude: E2E_LOCATION.latitude + 0.02,
    baseLongitude: E2E_LOCATION.longitude,
  });
  const electricalCrewId = await createCrew(coordinator, {
    ...base,
    name: E2E_CREWS.electrical,
    specialization: "electrical",
    baseLabel: "E2E depot south",
    baseLatitude: E2E_LOCATION.latitude - 0.02,
    baseLongitude: E2E_LOCATION.longitude,
  });
  await db.insert(crewMembers).values([
    { crewId: waterCrewId, userId: crewUserId },
    { crewId: electricalCrewId, userId: otherCrewUserId },
  ]);
  console.log("E2E database seeded with staff accounts and crews.");
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
