import { desc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CoordinatorActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { aiAnalyses, auditEvents, crewAssignments, duplicateCandidates, duplicateReviews, incidents, priorityAssessments } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getOverview } from "@/lib/services/analytics";
import { runAnalysis } from "@/lib/services/analysis";
import {
  completeWork,
  createAssignment,
  getCrewAssignment,
  listCrewAssignments,
  recommendCrews,
  respondToAssignment,
  startWork,
  verifyCompletion,
} from "@/lib/services/assignments";
import { createAsset } from "@/lib/services/assets";
import { loadIncident } from "@/lib/services/core";
import { listCandidatesForIncident, reviewDuplicate } from "@/lib/services/duplicates";
import { changeStatus, getIncidentDetail, listIncidents, publishPublicUpdate, updateClassification } from "@/lib/services/incidents";
import { overridePriority } from "@/lib/services/priority";
import { getPublicIncident } from "@/lib/services/tracking";
import {
  BASE_LOCATION,
  createCoordinator,
  createCrewMember,
  createTestCrew,
  offsetNorth,
  startTestDatabase,
  stopTestDatabase,
  submitReport,
} from "./helpers";

let coordinator: CoordinatorActor;

beforeAll(async () => {
  await startTestDatabase();
  coordinator = await createCoordinator();
});
afterAll(stopTestDatabase);
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

async function failure(promise: Promise<unknown>): Promise<AppError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

const current = async (incidentId: string) => loadIncident(await getDb(), incidentId);

async function verify(incidentId: string) {
  const incident = await current(incidentId);
  await changeStatus(coordinator, { incidentId, version: incident.version, toStatus: "verified", reason: null });
}

describe("duplicate detection and review", () => {
  it("raises a nearby similar report as a candidate and never merges automatically", async () => {
    const first = await submitReport();
    const second = await submitReport({
      ...offsetNorth(30),
      title: "Water gushing out of the road",
      description: "Water is gushing strongly from a burst pipe in the road and running across both lanes.",
    });
    expect(second.duplicateCandidates).toBe(1);

    const db = await getDb();
    const candidates = await listCandidatesForIncident(db, second.incidentId);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.primary.id).toBe(first.incidentId);
    expect(candidates[0]!.status).toBe("pending");
    expect(candidates[0]!.distanceMeters).toBeGreaterThan(25);
    expect(candidates[0]!.distanceMeters).toBeLessThan(35);
    expect((await current(second.incidentId)).duplicateOfId).toBeNull();
  });

  it("does not match a distant report or an incompatible category", async () => {
    const far = await submitReport(offsetNorth(5000));
    const streetlight = await submitReport({
      ...offsetNorth(5005),
      category: "streetlight",
      title: "Streetlight out at the crossing",
      description: "The streetlight above the crossing has been out for several nights.",
    });
    expect(far.duplicateCandidates).toBe(0);
    expect(streetlight.duplicateCandidates).toBe(0);
  });

  it("confirms a match reversibly, preserving both reports and recording each decision", async () => {
    const first = await submitReport(offsetNorth(-9000));
    const second = await submitReport(offsetNorth(-9020));
    const db = await getDb();
    const [candidate] = await listCandidatesForIncident(db, second.incidentId);
    const scoreBefore = (await current(first.incidentId)).priorityScore!;

    await reviewDuplicate(coordinator, { candidateId: candidate!.id, decision: "confirmed", reason: "Same burst pipe" });
    expect((await current(second.incidentId)).duplicateOfId).toBe(first.incidentId);
    // Corroboration raises the evidence factor of the earlier report.
    expect((await current(first.incidentId)).priorityScore!).toBeGreaterThan(scoreBefore);
    expect(await db.$count(incidents, eq(incidents.id, second.incidentId))).toBe(1);

    await reviewDuplicate(coordinator, { candidateId: candidate!.id, decision: "reopened", reason: "Checked on site: two leaks" });
    expect((await current(second.incidentId)).duplicateOfId).toBeNull();
    expect((await current(first.incidentId)).priorityScore!).toBeCloseTo(scoreBefore, 2);

    const [stored] = await db.select().from(duplicateCandidates).where(eq(duplicateCandidates.id, candidate!.id));
    expect(stored!.status).toBe("pending");
    const reviews = await db.select().from(duplicateReviews).where(eq(duplicateReviews.candidateId, candidate!.id));
    expect(reviews.map((review) => review.decision).sort()).toEqual(["confirmed", "reopened"]);
  });

  it("refuses duplicate decisions from crew members", async () => {
    const crewId = await createTestCrew(coordinator);
    const crewMember = await createCrewMember([crewId]);
    const error = await failure(reviewDuplicate(crewMember, { candidateId: crypto.randomUUID(), decision: "confirmed", reason: null }));
    expect(error.code).toBe("forbidden");
  });
});

describe("coordinator review, priority and status", () => {
  it("stores an explained priority assessment and recalculates on classification", async () => {
    const report = await submitReport(offsetNorth(20_000));
    const before = await getIncidentDetail(coordinator, report.incidentId);
    expect(before.latestAssessment?.factors).toHaveLength(5);
    expect(before.latestAssessment?.explanation).toMatch(/priority/i);

    await updateClassification(coordinator, {
      incidentId: report.incidentId,
      version: before.incident.version,
      category: "water_leak",
      confirmedSeverity: "critical",
      exposureLevel: "high",
    });
    const after = await getIncidentDetail(coordinator, report.incidentId);
    expect(after.incident.priorityScore!).toBeGreaterThan(before.incident.priorityScore!);
    expect(after.audit.map((event) => event.action)).toContain("incident.classification_updated");
  });

  it("raises infrastructure impact only for a verified registered asset", async () => {
    const location = offsetNorth(30_000);
    await createAsset(coordinator, {
      name: "Test pumping station",
      assetType: "water_pumping_station",
      latitude: location.latitude + 0.0005,
      longitude: location.longitude,
      importance: "critical",
      source: "Integration test fixture",
      verified: true,
      notes: null,
    });
    const report = await submitReport(location);
    const detail = await getIncidentDetail(coordinator, report.incidentId);
    expect(detail.screening.findings).toHaveLength(1);
    expect(detail.screening.findings[0]!.statement).toMatch(/Proximity alone does not establish a service impact/);
    const impact = detail.latestAssessment!.factors.find((factor) => factor.key === "impact")!;
    expect(impact.value!).toBeGreaterThan(0.7);
  });

  it("records a priority override with reason, previous and new values", async () => {
    const report = await submitReport(offsetNorth(40_000));
    const incident = await current(report.incidentId);
    await overridePriority(coordinator, { incidentId: incident.id, version: incident.version, band: "critical", reason: "Next to a clinic entrance" });

    const updated = await current(incident.id);
    expect(updated.priorityBand).toBe("critical");
    expect(updated.priorityOverridden).toBe(true);
    const db = await getDb();
    const [override] = await db.select().from(priorityAssessments).where(eq(priorityAssessments.incidentId, incident.id)).orderBy(desc(priorityAssessments.createdAt)).limit(1);
    expect(override!.isOverride).toBe(true);
    expect(override!.previousBand).toBe(incident.priorityBand);
    expect(override!.overrideReason).toBe("Next to a clinic entrance");
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.incidentId, incident.id));
    expect(audit.find((event) => event.action === "priority.overridden")?.detail).toMatchObject({ newBand: "critical" });
  });

  it("enforces the status workflow, required reasons and optimistic concurrency", async () => {
    const report = await submitReport(offsetNorth(50_000));
    const incident = await current(report.incidentId);

    const invalid = await failure(changeStatus(coordinator, { incidentId: incident.id, version: incident.version, toStatus: "closed", reason: null }));
    expect(invalid.code).toBe("conflict");
    const automatic = await failure(changeStatus(coordinator, { incidentId: incident.id, version: incident.version, toStatus: "verified", reason: null }).then(async () => {
      const verified = await current(incident.id);
      await changeStatus(coordinator, { incidentId: incident.id, version: verified.version, toStatus: "assigned", reason: null });
    }));
    expect(automatic.code).toBe("conflict");

    const verified = await current(incident.id);
    expect(verified.status).toBe("verified");
    const noReason = await failure(changeStatus(coordinator, { incidentId: incident.id, version: verified.version, toStatus: "rejected", reason: null }));
    expect(noReason.code).toBe("validation");
    const stale = await failure(changeStatus(coordinator, { incidentId: incident.id, version: verified.version - 1, toStatus: "rejected", reason: "Not infrastructure" }));
    expect(stale.code).toBe("conflict");
    expect((await current(incident.id)).status).toBe("verified");
  });

  it("requires a coordinator for coordinator operations", async () => {
    const crewMember = await createCrewMember([]);
    expect((await failure(listIncidents(crewMember))).code).toBe("forbidden");
    expect((await failure(listIncidents(null))).code).toBe("unauthenticated");
  });
});

describe("crew assignment workflow", () => {
  it("runs from recommendation to verified completion and shows the citizen the result", async () => {
    const report = await submitReport(offsetNorth(60_000));
    await verify(report.incidentId);
    const waterCrew = await createTestCrew(coordinator, { name: "Water crew", baseLatitude: BASE_LOCATION.latitude + 0.54 });
    const electricalCrew = await createTestCrew(coordinator, { name: "Electrical crew", specialization: "electrical" });
    const member = await createCrewMember([waterCrew]);
    const outsider = await createCrewMember([electricalCrew]);

    const rankings = await recommendCrews(coordinator, report.incidentId);
    expect(rankings[0]!.crewId).toBe(waterCrew);
    expect(rankings.find((ranking) => ranking.crewId === electricalCrew)!.ineligibility).toBe("specialization");

    const unqualified = await failure(createAssignment(coordinator, { incidentId: report.incidentId, crewId: electricalCrew, origin: "manual", asProposal: false }));
    expect(unqualified.code).toBe("conflict");

    const assignmentId = await createAssignment(coordinator, { incidentId: report.incidentId, crewId: waterCrew, origin: "recommendation", asProposal: false });
    expect((await current(report.incidentId)).status).toBe("assigned");
    const second = await failure(createAssignment(coordinator, { incidentId: report.incidentId, crewId: waterCrew, origin: "manual", asProposal: false }));
    expect(second.code).toBe("conflict");

    // Crew members see only their own crew's work.
    expect(await listCrewAssignments(member)).toHaveLength(1);
    expect(await listCrewAssignments(outsider)).toHaveLength(0);
    expect((await failure(getCrewAssignment(outsider, assignmentId))).code).toBe("forbidden");
    expect((await failure(startWork(outsider, assignmentId))).code).toBe("forbidden");
    const job = await getCrewAssignment(member, assignmentId);
    expect(JSON.stringify(job)).not.toContain("thandi@example.test");

    // The crew cannot skip acceptance, and cannot verify its own work.
    expect((await failure(startWork(member, assignmentId))).code).toBe("conflict");
    await respondToAssignment(member, assignmentId, "accepted", null);
    await startWork(member, assignmentId);
    expect((await current(report.incidentId)).status).toBe("in_progress");
    await completeWork(member, assignmentId, "Replaced the failed coupling and reinstated the road surface.", null);
    expect((await current(report.incidentId)).status).toBe("in_progress");
    expect((await failure(verifyCompletion(member, assignmentId))).code).toBe("forbidden");

    await verifyCompletion(coordinator, assignmentId);
    const resolved = await current(report.incidentId);
    expect(resolved.status).toBe("resolved");
    await publishPublicUpdate(coordinator, report.incidentId, "The burst pipe has been repaired and the road reopened.");
    const closing = await current(report.incidentId);
    await changeStatus(coordinator, { incidentId: report.incidentId, version: closing.version, toStatus: "closed", reason: null });

    const db = await getDb();
    const [assignment] = await db.select().from(crewAssignments).where(eq(crewAssignments.id, assignmentId));
    expect(assignment!.status).toBe("verified");

    const publicView = await getPublicIncident(report.reference, report.accessCode);
    expect(publicView.status).toBe("closed");
    expect(publicView.timeline.map((entry) => entry.status)).toEqual(["submitted", "awaiting_review", "verified", "assigned", "in_progress", "resolved", "closed"]);
    expect(publicView.updates[0]!.body).toMatch(/repaired/);
    expect(JSON.stringify(publicView)).not.toContain("coupling");
  });

  it("returns the incident to the queue when the crew declines", async () => {
    const report = await submitReport(offsetNorth(70_000));
    await verify(report.incidentId);
    const crewId = await createTestCrew(coordinator);
    const member = await createCrewMember([crewId]);
    const assignmentId = await createAssignment(coordinator, { incidentId: report.incidentId, crewId, origin: "manual", asProposal: false });

    expect((await failure(respondToAssignment(member, assignmentId, "declined", null))).code).toBe("validation");
    await respondToAssignment(member, assignmentId, "declined", "Vehicle breakdown");
    expect((await current(report.incidentId)).status).toBe("verified");
  });

  it("counts dashboard figures from stored records", async () => {
    const overview = await getOverview(coordinator);
    const db = await getDb();
    const stored = await db.select({ status: incidents.status }).from(incidents);
    const active = stored.filter((row) => ["submitted", "awaiting_review", "verified", "assigned", "in_progress"].includes(row.status)).length;
    expect(overview.activeIncidents).toBe(active);
    expect(overview.availableCrews).toBeGreaterThan(0);
  });
});

describe("AI analysis (Gemini API mocked)", () => {
  const validAnalysis = {
    category: "water_leak",
    observations: ["Water is visible on the road surface."],
    descriptionConsistency: "not_assessable",
    possibleHazards: ["Possible slippery road surface."],
    imageQuality: "no_image",
    missingInformation: ["The source of the water is not confirmed."],
    reviewQuestions: ["Is the water still flowing?"],
    confidence: "medium",
    requiresHumanReview: true,
  };
  const geminiResponse = (text: string, status = 200) =>
    new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status });

  it("stores a validated analysis and sends no reporter contact details", async () => {
    const report = await submitReport(offsetNorth(80_000));
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiResponse(JSON.stringify(validAnalysis)));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runAnalysis(report.incidentId, { force: true });
    expect(outcome?.ok).toBe(true);
    expect((await current(report.incidentId)).analysisStatus).toBe("completed");
    const db = await getDb();
    const [stored] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.incidentId, report.incidentId));
    expect(stored!.result?.observations).toEqual(validAnalysis.observations);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("test-key");
    expect(String(init.body)).not.toContain("thandi@example.test");
    expect(String(init.body)).not.toContain("Thandi");
  });

  it("discards output that fails schema validation and leaves the report intact", async () => {
    const report = await submitReport(offsetNorth(90_000));
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => geminiResponse(JSON.stringify({ ...validAnalysis, confidence: "97%" }))));

    const outcome = await runAnalysis(report.incidentId, { force: true });
    expect(outcome).toMatchObject({ ok: false, errorCode: "invalid_response" });
    const incident = await current(report.incidentId);
    expect(incident.analysisStatus).toBe("failed");
    expect(incident.status).toBe("awaiting_review");
    expect(incident.priorityScore).not.toBeNull();
  });

  it("retries once on a transient provider error, then records the failure", async () => {
    const report = await submitReport(offsetNorth(100_000));
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await runAnalysis(report.incidentId, { force: true });
    expect(outcome).toMatchObject({ ok: false, errorCode: "provider_error" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
