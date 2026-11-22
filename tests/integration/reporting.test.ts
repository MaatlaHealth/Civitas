import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { auditEvents, incidentImages, incidentObservations, incidents, incidentStatusHistory, reporterContacts } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { hashAccessCode } from "@/lib/services/intake";
import { enforceRateLimit } from "@/lib/services/rate-limit";
import { addReporterInformation, getPublicIncident } from "@/lib/services/tracking";
import { setImageStoreForTesting } from "@/lib/storage/image-store";
import { memoryImages, reportInput, samplePhotograph, startTestDatabase, stopTestDatabase, submitReport } from "./helpers";

beforeAll(startTestDatabase);
afterAll(stopTestDatabase);

async function expectAppError(promise: Promise<unknown>, code: AppError["code"]) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

describe("incident submission", () => {
  it("persists the report, runs intake checks and returns tracking details", async () => {
    const result = await submitReport();
    expect(result.reference).toMatch(/^CIV-[0-9A-Z]{8}$/);
    expect(result.accessCode).toMatch(/^[0-9A-Z]{20}$/);

    const db = await getDb();
    const [stored] = await db.select().from(incidents).where(eq(incidents.id, result.incidentId));
    expect(stored).toBeDefined();
    expect(stored!.title).toBe("Burst pipe flooding the road");
    expect(stored!.status).toBe("awaiting_review");
    expect(stored!.priorityScore).not.toBeNull();
    expect(stored!.priorityBand).not.toBe("awaiting_review");
    // No Gemini key is configured in tests, and that must not block acceptance.
    expect(stored!.analysisStatus).toBe("not_configured");

    const history = await db.select().from(incidentStatusHistory).where(eq(incidentStatusHistory.incidentId, result.incidentId));
    expect(history.map((entry) => entry.toStatus).sort()).toEqual(["awaiting_review", "submitted"]);
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.incidentId, result.incidentId));
    expect(audit.map((event) => event.action)).toContain("incident.submitted");
  });

  it("stores only a hash of the access code", async () => {
    const result = await submitReport();
    const db = await getDb();
    const [stored] = await db.select().from(incidents).where(eq(incidents.id, result.incidentId));
    expect(stored!.trackingTokenHash).toBe(hashAccessCode(result.accessCode));
    expect(JSON.stringify(stored)).not.toContain(result.accessCode);
  });

  it("keeps contact details in a separate table and stores none for anonymous reports", async () => {
    const named = await submitReport();
    const anonymous = await submitReport({ anonymous: "true", ...{ latitude: -25.9, longitude: 28.2 } });
    const db = await getDb();
    const namedContact = await db.select().from(reporterContacts).where(eq(reporterContacts.incidentId, named.incidentId));
    const anonymousContact = await db.select().from(reporterContacts).where(eq(reporterContacts.incidentId, anonymous.incidentId));
    expect(namedContact).toHaveLength(1);
    expect(namedContact[0]!.email).toBe("thandi@example.test");
    expect(anonymousContact).toHaveLength(0);
  });

  it("rejects a repeated submission with the same key instead of creating a second incident", async () => {
    const input = reportInput({ latitude: -25.5, longitude: 28.5 });
    const { submitIncident } = await import("@/lib/services/intake");
    await submitIncident(input, null);
    await expectAppError(submitIncident(input, null), "conflict");
    const db = await getDb();
    expect(await db.$count(incidents, eq(incidents.submissionKey, input.submissionKey))).toBe(1);
  });

  it("re-encodes and stores a photograph privately, stripping metadata", async () => {
    const result = await submitReport({ latitude: -25.1, longitude: 28.1 }, await samplePhotograph());
    expect(result.photographStored).toBe(true);
    const db = await getDb();
    const [image] = await db.select().from(incidentImages).where(eq(incidentImages.incidentId, result.incidentId));
    expect(image!.contentType).toBe("image/jpeg");
    const storedBytes = memoryImages.get(image!.storageKey);
    expect(storedBytes).toBeDefined();
    const metadata = await sharp(storedBytes!).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects a file that is not an image before saving anything", async () => {
    const db = await getDb();
    const before = await db.$count(incidents);
    const notAnImage = new TextEncoder().encode("<script>alert(1)</script>");
    await expectAppError(submitReport({}, notAnImage), "unsupported_media");
    expect(await db.$count(incidents)).toBe(before);
  });

  it("still accepts the report when photograph storage is down", async () => {
    setImageStoreForTesting({
      put: async () => {
        throw new Error("storage offline");
      },
      get: async () => null,
      delete: async () => undefined,
    });
    try {
      const result = await submitReport({ latitude: -25.2, longitude: 28.3 }, await samplePhotograph());
      expect(result.photographStored).toBe(false);
      expect(result.photographProblem).toMatch(/could not be stored/);
      const db = await getDb();
      expect(await db.$count(incidents, eq(incidents.id, result.incidentId))).toBe(1);
    } finally {
      await startTestDatabaseStoreOnly();
    }
  });
});

/** Restores the in-memory image store without resetting the database. */
async function startTestDatabaseStoreOnly() {
  setImageStoreForTesting({
    put: async (key, bytes) => void memoryImages.set(key, bytes),
    get: async (key) => memoryImages.get(key) ?? null,
    delete: async (key) => void memoryImages.delete(key),
  });
}

describe("citizen tracking", () => {
  it("returns only public information for the correct reference and access code", async () => {
    const result = await submitReport({ latitude: -24.9, longitude: 28.4 });
    const view = await getPublicIncident(result.reference, result.accessCode);
    expect(view.reference).toBe(result.reference);
    expect(view.status).toBe("awaiting_review");
    expect(view.timeline.map((entry) => entry.status)).toEqual(["submitted", "awaiting_review"]);
    const serialised = JSON.stringify(view);
    expect(serialised).not.toContain("thandi@example.test");
    expect(serialised).not.toContain("Thandi");
    expect(serialised).not.toContain(result.incidentId);
    expect(serialised).not.toContain("Corner of Test Street");
  });

  it("gives the same error for a wrong code and an unknown reference", async () => {
    const result = await submitReport({ latitude: -24.8, longitude: 28.4 });
    const wrongCode = await getPublicIncident(result.reference, "0".repeat(20)).catch((error: AppError) => error);
    const unknown = await getPublicIncident("CIV-ZZZZZZZZ", result.accessCode).catch((error: AppError) => error);
    expect(wrongCode).toBeInstanceOf(AppError);
    expect(unknown).toBeInstanceOf(AppError);
    expect((wrongCode as AppError).message).toBe((unknown as AppError).message);
    expect((wrongCode as AppError).code).toBe("not_found");
  });

  it("lets the reporter add information, and refuses without the access code", async () => {
    const result = await submitReport({ latitude: -24.7, longitude: 28.4 });
    await addReporterInformation(result.reference, result.accessCode, "The leak has become much worse since this morning.");
    await expectAppError(addReporterInformation(result.reference, "1".repeat(20), "Trying without the right code."), "not_found");
    const db = await getDb();
    const notes = await db.select().from(incidentObservations).where(eq(incidentObservations.incidentId, result.incidentId));
    expect(notes).toHaveLength(1);
    expect(notes[0]!.source).toBe("reporter");
  });
});

describe("rate limiting", () => {
  it("blocks requests beyond the limit within a window", async () => {
    const rule = { name: "test-limit", limit: 3, windowSeconds: 600 };
    for (let request = 0; request < 3; request += 1) await enforceRateLimit(rule, "203.0.113.7");
    await expectAppError(enforceRateLimit(rule, "203.0.113.7"), "rate_limited");
    // A different client is unaffected.
    await expect(enforceRateLimit(rule, "203.0.113.8")).resolves.toBeUndefined();
  });
});
