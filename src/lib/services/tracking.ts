import { timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { incidentObservations, incidents, incidentStatusHistory, publicUpdates, type Incident } from "@/lib/db/schema";
import { categoryLabel } from "@/lib/domain/categories";
import { STATUS_LABELS, type IncidentStatus } from "@/lib/domain/types";
import { AppError } from "@/lib/errors";
import { recordAudit } from "./core";
import { hashAccessCode } from "./intake";

/** What a citizen sees for each status. Internal detail is deliberately left out. */
const PUBLIC_STATUS_MESSAGES: Record<IncidentStatus, string> = {
  submitted: "Your report has been received and is being processed.",
  awaiting_review: "Your report is waiting to be reviewed by a coordinator. No decision has been made yet.",
  verified: "A coordinator has reviewed and verified your report. It is waiting to be scheduled.",
  assigned: "A maintenance crew has been assigned to this incident.",
  in_progress: "A maintenance crew is working on this incident.",
  resolved: "The crew reported the work complete and a coordinator has verified it.",
  closed: "This incident has been closed.",
  rejected: "A coordinator reviewed this report and could not take it further. See the updates below for details.",
};

const MAX_REPORTER_ADDITIONS = 10;
const LOOKUP_FAILED_MESSAGE = "No report matches that reference and access code.";

export interface PublicIncidentView {
  reference: string;
  category: string;
  status: IncidentStatus;
  statusLabel: string;
  statusMessage: string;
  reportedAt: string;
  lastUpdatedAt: string;
  timeline: Array<{ status: IncidentStatus; label: string; at: string }>;
  updates: Array<{ body: string; at: string }>;
}

/**
 * Looks up an incident by reference and access code. The same error is
 * returned whether the reference is unknown or the code is wrong, so the
 * endpoint cannot be used to discover which references exist.
 */
async function findByCredentials(reference: string, accessCode: string): Promise<Incident> {
  const db = await getDb();
  const [incident] = await db.select().from(incidents).where(eq(incidents.reference, reference)).limit(1);
  const expected = Buffer.from(incident?.trackingTokenHash ?? hashAccessCode("no-such-incident"), "hex");
  const supplied = Buffer.from(hashAccessCode(accessCode), "hex");
  if (!incident || !timingSafeEqual(expected, supplied)) throw new AppError("not_found", LOOKUP_FAILED_MESSAGE);
  return incident;
}

export async function getPublicIncident(reference: string, accessCode: string): Promise<PublicIncidentView> {
  const incident = await findByCredentials(reference, accessCode);
  const db = await getDb();
  const history = await db
    .select({ toStatus: incidentStatusHistory.toStatus, createdAt: incidentStatusHistory.createdAt })
    .from(incidentStatusHistory)
    .where(eq(incidentStatusHistory.incidentId, incident.id))
    .orderBy(asc(incidentStatusHistory.createdAt));
  const updates = await db
    .select({ body: publicUpdates.body, createdAt: publicUpdates.createdAt })
    .from(publicUpdates)
    .where(eq(publicUpdates.incidentId, incident.id))
    .orderBy(desc(publicUpdates.createdAt));

  return {
    reference: incident.reference,
    category: categoryLabel(incident.category),
    status: incident.status,
    statusLabel: STATUS_LABELS[incident.status],
    statusMessage: PUBLIC_STATUS_MESSAGES[incident.status],
    reportedAt: incident.createdAt.toISOString(),
    lastUpdatedAt: incident.updatedAt.toISOString(),
    // Reasons and actors are internal; only the status and time are public.
    timeline: history.map((entry) => ({
      status: entry.toStatus,
      label: STATUS_LABELS[entry.toStatus],
      at: entry.createdAt.toISOString(),
    })),
    updates: updates.map((update) => ({ body: update.body, at: update.createdAt.toISOString() })),
  };
}

export async function addReporterInformation(reference: string, accessCode: string, body: string): Promise<void> {
  const incident = await findByCredentials(reference, accessCode);
  if (incident.status === "closed") {
    throw new AppError("conflict", "This incident is closed. Please submit a new report if the problem has returned.");
  }
  const db = await getDb();
  const existing = await db.$count(
    incidentObservations,
    and(eq(incidentObservations.incidentId, incident.id), eq(incidentObservations.source, "reporter")),
  );
  if (existing >= MAX_REPORTER_ADDITIONS) {
    throw new AppError("rate_limited", "This report has reached the limit for additional information.");
  }
  await db.insert(incidentObservations).values({ incidentId: incident.id, source: "reporter", body });
  await recordAudit(db, {
    organizationId: incident.organizationId,
    actorKind: "citizen",
    action: "incident.reporter_information_added",
    entityType: "incident",
    entityId: incident.id,
    incidentId: incident.id,
  });
}
