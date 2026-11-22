import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { CoordinatorActor, CrewActor } from "@/lib/auth/actor";
import { connectEmbedded, getDb, setDbForTesting } from "@/lib/db/client";
import { crewMembers, users } from "@/lib/db/schema";
import { getOrganizationId } from "@/lib/services/core";
import { createCrew } from "@/lib/services/crews";
import { submitIncident } from "@/lib/services/intake";
import { setImageStoreForTesting, type ImageStore } from "@/lib/storage/image-store";
import { parseOrThrow, reportSchema, type CrewInput } from "@/lib/validation/schemas";

/**
 * Integration tests run the real services against a real PostgreSQL engine
 * (PGlite, in memory) with the real migrations applied. Only third-party
 * services are replaced: object storage by an in-memory store, and the
 * Gemini HTTP API by a stubbed `fetch` in the tests that exercise it.
 */
export const memoryImages = new Map<string, Uint8Array>();

const memoryStore: ImageStore = {
  async put(key, bytes) {
    memoryImages.set(key, bytes);
  },
  async get(key) {
    return memoryImages.get(key) ?? null;
  },
  async delete(key) {
    memoryImages.delete(key);
  },
};

export async function startTestDatabase(): Promise<void> {
  setDbForTesting(await connectEmbedded());
  setImageStoreForTesting(memoryStore);
  memoryImages.clear();
}

export function stopTestDatabase(): void {
  setDbForTesting(undefined);
  setImageStoreForTesting(undefined);
}

async function createUser(role: "coordinator" | "crew"): Promise<{ userId: string; organizationId: string }> {
  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  const [user] = await db
    .insert(users)
    .values({ organizationId, email: `${role}-${randomUUID()}@example.test`, name: `Test ${role}`, role, passwordHash: "not-a-real-hash" })
    .returning({ id: users.id });
  return { userId: user!.id, organizationId };
}

export async function createCoordinator(): Promise<CoordinatorActor> {
  return { kind: "coordinator", ...(await createUser("coordinator")) };
}

export async function createCrewMember(crewIds: string[]): Promise<CrewActor> {
  const user = await createUser("crew");
  const db = await getDb();
  for (const crewId of crewIds) await db.insert(crewMembers).values({ crewId, userId: user.userId });
  return { kind: "crew", ...user, crewIds };
}

/** A real street-scale location; tests offset from it in metres. */
export const BASE_LOCATION = { latitude: -26.2041, longitude: 28.0473 };
const METERS_PER_DEGREE = 111_195;

export function offsetNorth(meters: number) {
  return { latitude: BASE_LOCATION.latitude + meters / METERS_PER_DEGREE, longitude: BASE_LOCATION.longitude };
}

export function reportInput(overrides: Record<string, unknown> = {}) {
  return parseOrThrow(reportSchema, {
    submissionKey: randomUUID(),
    category: "water_leak",
    title: "Burst pipe flooding the road",
    description: "Water is gushing from a burst pipe and running across both lanes of the road.",
    latitude: BASE_LOCATION.latitude,
    longitude: BASE_LOCATION.longitude,
    address: "Corner of Test Street",
    obstructsAccess: "yes",
    reportedDuration: "today",
    anonymous: "false",
    reporterName: "Thandi Reporter",
    reporterEmail: "thandi@example.test",
    reporterPhone: "",
    consent: "true",
    ...overrides,
  });
}

export async function submitReport(overrides: Record<string, unknown> = {}, photograph: Uint8Array | null = null) {
  return submitIncident(reportInput(overrides), photograph);
}

export async function samplePhotograph(): Promise<Uint8Array> {
  const buffer = await sharp({ create: { width: 320, height: 240, channels: 3, background: { r: 40, g: 110, b: 160 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "should be stripped" } } })
    .toBuffer();
  return new Uint8Array(buffer);
}

export function crewInput(overrides: Partial<CrewInput> = {}): CrewInput {
  return {
    name: `Crew ${randomUUID().slice(0, 8)}`,
    specialization: "water_infrastructure",
    status: "available",
    baseLabel: "Test depot",
    baseLatitude: BASE_LOCATION.latitude + 0.01,
    baseLongitude: BASE_LOCATION.longitude,
    capacity: 2,
    shiftNotes: null,
    ...overrides,
  };
}

export async function createTestCrew(coordinator: CoordinatorActor, overrides: Partial<CrewInput> = {}): Promise<string> {
  return createCrew(coordinator, crewInput(overrides));
}
