import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { requireCoordinator, type CoordinatorActor, type CrewActor, type StaffActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { crewMembers, incidents, infrastructureAssets, maintenanceCrews, users } from "@/lib/db/schema";
import type { CrewSpecialization, IncidentCategory } from "@/lib/domain/categories";
import type { ExposureLevel, SeverityLevel } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { errorMetadata, logger } from "@/lib/logger";
import { parseOrThrow, reportSchema } from "@/lib/validation/schemas";
import { completeWork, createAssignment, respondToAssignment, startWork, verifyCompletion } from "./assignments";
import { loadIncident } from "./core";
import { listCandidatesForIncident, reviewDuplicate } from "./duplicates";
import { changeStatus, publishPublicUpdate, updateClassification } from "./incidents";
import { submitIncident } from "./intake";
import { openAccessEnabled } from "./open-access";

/**
 * Demonstration data for a demo site.
 *
 * Everything created here is invented and says so: crews are named "Demo
 * ...", every report's address and description state that it is not a real
 * incident, and assets are named "(not a real asset)" and left unverified.
 * The records are created through the same services as real ones, so the
 * duplicate matches, priority scores and crew recommendations on screen are
 * computed, not scripted. Loading is only allowed where open demo
 * access is on, which is never a deployment holding real reports.
 *
 * Each step checks what already exists, so loading can be run again safely
 * if an earlier attempt was interrupted.
 */
export const DEMO_ADDRESS = "Demonstration data (central Johannesburg)";
const DEMO_NOTE = "Demonstration report; not a real incident.";
const DEMO_SOURCE = "Demonstration record; not a real asset.";

interface DemoReport {
  key: string;
  category: IncidentCategory;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  obstructsAccess: "yes" | "no" | "unsure";
  reportedDuration: "unknown" | "today" | "days" | "weeks" | "longer";
}

const REPORTS: DemoReport[] = [
  { key: "pipe", category: "water_leak", title: "Burst pipe flooding the road", description: "Water is gushing from a burst pipe and running across both lanes of the road.", latitude: -26.2041, longitude: 28.0473, obstructsAccess: "yes", reportedDuration: "today" },
  { key: "pipe2", category: "water_leak", title: "Water gushing out of the road", description: "Water is gushing strongly from a burst pipe in the road and running across both lanes.", latitude: -26.20383, longitude: 28.0473, obstructsAccess: "yes", reportedDuration: "today" },
  { key: "pothole", category: "pothole", title: "Deep pothole in the left lane", description: "A deep pothole has opened in the left lane and cars are swerving to avoid it.", latitude: -26.199, longitude: 28.04, obstructsAccess: "no", reportedDuration: "days" },
  { key: "light", category: "streetlight", title: "Streetlight out at the crossing", description: "The streetlight above the pedestrian crossing has been out for several nights.", latitude: -26.21, longitude: 28.055, obstructsAccess: "unsure", reportedDuration: "days" },
  { key: "cables", category: "exposed_electrical", title: "Exposed cables at an open electrical box", description: "An electrical box on the pavement has been broken open and cables are exposed at child height.", latitude: -26.2065, longitude: 28.0365, obstructsAccess: "unsure", reportedDuration: "today" },
  { key: "drain", category: "blocked_drain", title: "Stormwater drain blocked with debris", description: "The stormwater drain at the corner is blocked with sand and litter and water is ponding around it.", latitude: -26.1955, longitude: 28.052, obstructsAccess: "no", reportedDuration: "weeks" },
  { key: "flood", category: "flooding", title: "Road flooded after overnight rain", description: "The road is covered in standing water after the rain and small cars cannot get through.", latitude: -26.213, longitude: 28.044, obstructsAccess: "yes", reportedDuration: "today" },
  { key: "paving", category: "sidewalk", title: "Broken paving on the sidewalk", description: "Several paving slabs are broken and lifted, making it hard to pass with a wheelchair or pram.", latitude: -26.201, longitude: 28.06, obstructsAccess: "yes", reportedDuration: "longer" },
  { key: "dumping", category: "illegal_dumping", title: "Rubble dumped next to the drain", description: "A load of building rubble has been dumped at the kerb and is spilling towards the drain.", latitude: -26.216, longitude: 28.05, obstructsAccess: "no", reportedDuration: "weeks" },
];

const CREWS: Array<{ name: string; specialization: CrewSpecialization; latitude: number; longitude: number }> = [
  { name: "Demo Water Team", specialization: "water_infrastructure", latitude: -26.192, longitude: 28.045 },
  { name: "Demo Roads Team", specialization: "road_maintenance", latitude: -26.207, longitude: 28.03 },
  { name: "Demo Electrical Team", specialization: "electrical", latitude: -26.218, longitude: 28.058 },
  { name: "Demo Drainage Team", specialization: "drainage", latitude: -26.198, longitude: 28.064 },
  { name: "Demo General Team", specialization: "general_maintenance", latitude: -26.21, longitude: 28.047 },
];

const ASSETS = [
  { name: "Demo pumping station (not a real asset)", assetType: "water_pumping_station" as const, latitude: -26.2036, longitude: 28.0481, importance: "critical" as const },
  { name: "Demo primary school (not a real asset)", assetType: "school" as const, latitude: -26.2058, longitude: 28.0372, importance: "important" as const },
];

export interface DemoDataResult {
  reportsCreated: number;
  /** A demo report the visitor can look up on the public tracking page. */
  trackable: { reference: string; accessCode: string } | null;
}

async function ensureCrews(coordinator: CoordinatorActor): Promise<Map<string, string>> {
  const db = await getDb();
  for (const crew of CREWS) {
    await db
      .insert(maintenanceCrews)
      .values({
        organizationId: coordinator.organizationId,
        name: crew.name,
        specialization: crew.specialization,
        baseLabel: "Demonstration depot (invented)",
        baseLatitude: crew.latitude,
        baseLongitude: crew.longitude,
        capacity: 2,
        shiftNotes: "Demonstration crew",
      })
      .onConflictDoNothing();
  }
  const rows = await db.select({ id: maintenanceCrews.id, name: maintenanceCrews.name }).from(maintenanceCrews).where(eq(maintenanceCrews.organizationId, coordinator.organizationId));
  return new Map(rows.map((row) => [row.name, row.id]));
}

async function ensureAssets(coordinator: CoordinatorActor): Promise<void> {
  const db = await getDb();
  for (const asset of ASSETS) {
    const [existing] = await db.select({ id: infrastructureAssets.id }).from(infrastructureAssets).where(eq(infrastructureAssets.name, asset.name)).limit(1);
    if (existing) continue;
    await db.insert(infrastructureAssets).values({ ...asset, organizationId: coordinator.organizationId, source: DEMO_SOURCE, verified: false });
  }
}

/** A labelled crew account that performs the crew-side steps of the demonstration. */
async function ensureDemoCrewMember(coordinator: CoordinatorActor, crewIds: string[]): Promise<CrewActor> {
  const db = await getDb();
  const email = "demo-crew@open-access.invalid";
  await db
    .insert(users)
    .values({ organizationId: coordinator.organizationId, email, name: "Demo crew member", role: "crew", passwordHash: "open-access:no-password", isEvaluation: true })
    .onConflictDoNothing();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new AppError("unavailable", "The demonstration crew account could not be created.");
  for (const crewId of crewIds) await db.insert(crewMembers).values({ crewId, userId: user.id }).onConflictDoNothing();
  return { kind: "crew", userId: user.id, organizationId: coordinator.organizationId, crewIds };
}

async function findDemoReport(title: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db.select({ id: incidents.id }).from(incidents).where(and(eq(incidents.address, DEMO_ADDRESS), eq(incidents.title, title))).limit(1);
  return row?.id ?? null;
}

async function verify(
  coordinator: CoordinatorActor,
  incidentId: string,
  severity: SeverityLevel | null,
  exposure: ExposureLevel | null = null,
): Promise<void> {
  const db = await getDb();
  let incident = await loadIncident(db, incidentId);
  if (severity) {
    await updateClassification(coordinator, { incidentId, version: incident.version, category: incident.category, confirmedSeverity: severity, exposureLevel: exposure });
    incident = await loadIncident(db, incidentId);
  }
  await changeStatus(coordinator, { incidentId, version: incident.version, toStatus: "verified", reason: null });
}

/** Runs one demonstration step, logging rather than aborting if it cannot apply. */
async function step(name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    logger.warn("demo.step.skipped", { step: name, ...errorMetadata(error) });
  }
}

export async function loadDemoData(actor: StaffActor | null): Promise<DemoDataResult> {
  const coordinator = requireCoordinator(actor);
  if (!openAccessEnabled()) {
    throw new AppError("forbidden", "Demonstration data can only be loaded on a demo site with open access switched on.");
  }

  const crews = await ensureCrews(coordinator);
  await ensureAssets(coordinator);
  const crewId = (name: string) => crews.get(name) ?? "";
  const crewMember = await ensureDemoCrewMember(coordinator, CREWS.map((crew) => crewId(crew.name)).filter(Boolean));

  const ids = new Map<string, string>();
  const fresh = new Set<string>();
  let trackable: DemoDataResult["trackable"] = null;
  for (const report of REPORTS) {
    const existing = await findDemoReport(report.title);
    if (existing) {
      ids.set(report.key, existing);
      continue;
    }
    const result = await submitIncident(
      parseOrThrow(reportSchema, {
        submissionKey: randomUUID(),
        category: report.category,
        title: report.title,
        description: `${report.description} ${DEMO_NOTE}`,
        latitude: report.latitude,
        longitude: report.longitude,
        address: DEMO_ADDRESS,
        obstructsAccess: report.obstructsAccess,
        reportedDuration: report.reportedDuration,
        anonymous: "true",
        consent: "true",
      }),
      null,
    );
    ids.set(report.key, result.incidentId);
    fresh.add(report.key);
    if (report.key === "light") trackable = { reference: result.reference, accessCode: result.accessCode };
  }

  // Move some of the new reports through the workflow so each stage has an example.
  const id = (key: string) => ids.get(key) ?? "";
  const db = await getDb();
  if (fresh.has("pipe")) {
    await step("pipe", async () => {
      const [candidate] = await listCandidatesForIncident(db, id("pipe"));
      if (candidate?.status === "pending") {
        await reviewDuplicate(coordinator, { candidateId: candidate.id, decision: "confirmed", reason: "Demonstration: same burst pipe" });
      }
      await verify(coordinator, id("pipe"), "high");
      await createAssignment(coordinator, { incidentId: id("pipe"), crewId: crewId("Demo Water Team"), origin: "recommendation", asProposal: false });
    });
  }
  if (fresh.has("cables")) await step("cables", () => verify(coordinator, id("cables"), "critical", "high"));
  if (fresh.has("flood")) await step("flood", () => verify(coordinator, id("flood"), null));
  if (fresh.has("pothole")) {
    await step("pothole", async () => {
      await verify(coordinator, id("pothole"), null);
      const assignmentId = await createAssignment(coordinator, { incidentId: id("pothole"), crewId: crewId("Demo Roads Team"), origin: "recommendation", asProposal: false });
      await respondToAssignment(crewMember, assignmentId, "accepted", null);
      await startWork(crewMember, assignmentId);
    });
  }
  if (fresh.has("light")) {
    await step("light", async () => {
      await verify(coordinator, id("light"), null);
      const assignmentId = await createAssignment(coordinator, { incidentId: id("light"), crewId: crewId("Demo Electrical Team"), origin: "recommendation", asProposal: false });
      await respondToAssignment(crewMember, assignmentId, "accepted", null);
      await startWork(crewMember, assignmentId);
      await completeWork(crewMember, assignmentId, "Demonstration: replaced the failed lamp and tested the circuit.", null);
      await verifyCompletion(coordinator, assignmentId);
      await publishPublicUpdate(coordinator, id("light"), "Demonstration update: the streetlight has been repaired and is working again.");
    });
  }

  return { reportsCreated: fresh.size, trackable };
}
