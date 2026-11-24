/**
 * Creates (or updates) a staff account.
 *
 *   npm run users:create -- --email jane@example.org --name "Jane Dlamini" --role coordinator
 *   npm run users:create -- --email sam@example.org --name "Sam Nkosi" --role crew --crew "Water Team"
 *
 * Options:
 *   --demo         label the account as a demo account in the interface
 *   --crew <name>  for crew members: the existing crew to join
 *
 * The password is read from the CIVITAS_NEW_USER_PASSWORD environment
 * variable. If it is not set, a random password is generated and printed
 * once. Passwords are stored only as bcrypt hashes.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { loadLocalEnvironment } from "./env";

loadLocalEnvironment();

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const email = argument("email")?.toLowerCase();
  const name = argument("name");
  const role = argument("role");
  const crewName = argument("crew");
  const isEvaluation = process.argv.includes("--demo");

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Provide a valid --email.");
  if (!name) throw new Error("Provide a --name.");
  if (role !== "coordinator" && role !== "crew") throw new Error('Provide --role "coordinator" or "crew".');

  const supplied = process.env.CIVITAS_NEW_USER_PASSWORD;
  if (supplied !== undefined && supplied.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`CIVITAS_NEW_USER_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const password = supplied ?? randomBytes(15).toString("base64url");

  const { getDb } = await import("../src/lib/db/client");
  const { crewMembers, maintenanceCrews, users } = await import("../src/lib/db/schema");
  const { getOrganizationId } = await import("../src/lib/services/core");
  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const [user] = await db
    .insert(users)
    .values({ organizationId, email, name, role, passwordHash, isEvaluation })
    .onConflictDoUpdate({ target: users.email, set: { name, role, passwordHash, isEvaluation, active: true } })
    .returning({ id: users.id });
  if (!user) throw new Error("The account could not be saved.");

  if (role === "crew" && crewName) {
    const [crew] = await db
      .select({ id: maintenanceCrews.id })
      .from(maintenanceCrews)
      .where(and(eq(maintenanceCrews.organizationId, organizationId), eq(maintenanceCrews.name, crewName)))
      .limit(1);
    if (!crew) throw new Error(`No crew named "${crewName}" exists. Create it in the dashboard first.`);
    await db.insert(crewMembers).values({ crewId: crew.id, userId: user.id }).onConflictDoNothing();
    console.log(`Added ${email} to crew "${crewName}".`);
  }

  console.log(`Account ready: ${email} (${role}).`);
  if (supplied === undefined) {
    console.log(`Generated password (shown once, store it securely): ${password}`);
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
