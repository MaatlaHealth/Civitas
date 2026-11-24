import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import {
  createAccount,
  createFirstCoordinator,
  listAccounts,
  resetAccountPassword,
  setAccountActive,
  setupAvailable,
} from "@/lib/services/accounts";
import { createCrewMember, startTestDatabase, stopTestDatabase } from "./helpers";

const SETUP_CODE = "integration-test-setup-code";
const PASSWORD = "a-long-test-password";

beforeAll(async () => {
  await startTestDatabase();
  process.env.CIVITAS_SETUP_CODE = SETUP_CODE;
});
afterAll(() => {
  delete process.env.CIVITAS_SETUP_CODE;
  stopTestDatabase();
});

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe("first-run setup", () => {
  const first = { name: "Thandi Mokoena", email: "thandi@example.test", password: PASSWORD };

  it("refuses a wrong setup code and creates nothing", async () => {
    expect(await setupAvailable()).toBe(true);
    const error = await failure(createFirstCoordinator({ ...first, setupCode: "guess" }));
    expect(error.code).toBe("forbidden");
    expect(await setupAvailable()).toBe(true);
  });

  it("creates the first coordinator once, storing only a bcrypt hash, then closes", async () => {
    await createFirstCoordinator({ ...first, setupCode: SETUP_CODE });
    const db = await getDb();
    const [stored] = await db.select().from(users).where(eq(users.email, first.email));
    expect(stored!.role).toBe("coordinator");
    expect(stored!.passwordHash).not.toContain(PASSWORD);
    expect(await bcrypt.compare(PASSWORD, stored!.passwordHash)).toBe(true);

    expect(await setupAvailable()).toBe(false);
    const again = await failure(createFirstCoordinator({ name: "Intruder", email: "intruder@example.test", password: PASSWORD, setupCode: SETUP_CODE }));
    expect(again.code).toBe("conflict");
  });
});

describe("team management", () => {
  async function coordinator() {
    const db = await getDb();
    const [user] = await db.select().from(users).where(eq(users.email, "thandi@example.test"));
    return { kind: "coordinator" as const, userId: user!.id, organizationId: user!.organizationId };
  }

  it("lets a coordinator add, deactivate and reset accounts, and never returns password hashes", async () => {
    const actor = await coordinator();
    await createAccount(actor, { name: "Sipho Dube", email: "sipho@example.test", password: PASSWORD, role: "crew", crewId: "" });
    const duplicate = await failure(createAccount(actor, { name: "Sipho Again", email: "sipho@example.test", password: PASSWORD, role: "crew", crewId: "" }));
    expect(duplicate.code).toBe("conflict");

    const accounts = await listAccounts(actor);
    const sipho = accounts.find((account) => account.email === "sipho@example.test")!;
    expect(sipho.canSignInWithPassword).toBe(true);
    expect(JSON.stringify(accounts)).not.toContain("$2");

    await setAccountActive(actor, sipho.id, false);
    const db = await getDb();
    expect((await db.select().from(users).where(eq(users.id, sipho.id)))[0]!.active).toBe(false);
    expect((await failure(setAccountActive(actor, actor.userId, false))).code).toBe("conflict");

    await resetAccountPassword(actor, { userId: sipho.id, password: "another-long-password" });
    const [updated] = await db.select().from(users).where(eq(users.id, sipho.id));
    expect(await bcrypt.compare("another-long-password", updated!.passwordHash)).toBe(true);
  });

  it("refuses crew members and signed-out visitors", async () => {
    const crewMember = await createCrewMember([]);
    expect((await failure(listAccounts(crewMember))).code).toBe("forbidden");
    expect((await failure(createAccount(crewMember, { name: "X Y", email: "x@example.test", password: PASSWORD, role: "coordinator", crewId: "" }))).code).toBe("forbidden");
    expect((await failure(listAccounts(null))).code).toBe("unauthenticated");
  });
});
