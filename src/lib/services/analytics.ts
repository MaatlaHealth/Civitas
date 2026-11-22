import { asc, eq, inArray, sql } from "drizzle-orm";
import { requireCoordinator, type StaffActor } from "@/lib/auth/actor";
import { getDb } from "@/lib/db/client";
import { crewAssignments, duplicateCandidates, incidents, incidentStatusHistory, maintenanceCrews } from "@/lib/db/schema";
import { CATEGORY_DEFINITIONS, INCIDENT_CATEGORIES } from "@/lib/domain/categories";
import {
  INCIDENT_STATUSES,
  PRIORITY_BANDS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  type IncidentStatus,
} from "@/lib/domain/types";
import { ACTIVE_INCIDENT_STATUSES } from "@/lib/domain/workflow";

/** Below this many samples a duration statistic is shown with a small-sample warning. */
export const MIN_RELIABLE_SAMPLE = 5;

export interface DurationStatistic {
  label: string;
  sampleSize: number;
  medianHours: number | null;
  meanHours: number | null;
}

function durationStatistic(label: string, hours: number[]): DurationStatistic {
  if (hours.length === 0) return { label, sampleSize: 0, medianHours: null, meanHours: null };
  const sorted = [...hours].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return { label, sampleSize: sorted.length, medianHours: Math.round(median * 10) / 10, meanHours: Math.round(mean * 10) / 10 };
}

const countAll = sql<number>`count(*)::int`;

export async function getOverview(actor: StaffActor | null) {
  const coordinator = requireCoordinator(actor);
  const db = await getDb();
  const byStatus = await db.select({ status: incidents.status, value: countAll }).from(incidents).groupBy(incidents.status);
  const activePriority = await db
    .select({ band: incidents.priorityBand, value: countAll })
    .from(incidents)
    .where(inArray(incidents.status, [...ACTIVE_INCIDENT_STATUSES]))
    .groupBy(incidents.priorityBand);
  const [availableCrews] = await db
    .select({ value: countAll })
    .from(maintenanceCrews)
    .where(sql`${maintenanceCrews.organizationId} = ${coordinator.organizationId} and ${maintenanceCrews.status} = 'available'`);
  const [pendingDuplicates] = await db.select({ value: countAll }).from(duplicateCandidates).where(eq(duplicateCandidates.status, "pending"));

  const status = (name: IncidentStatus) => byStatus.find((row) => row.status === name)?.value ?? 0;
  const band = (name: string) => activePriority.find((row) => row.band === name)?.value ?? 0;
  return {
    activeIncidents: ACTIVE_INCIDENT_STATUSES.reduce((sum, name) => sum + status(name), 0),
    awaitingReview: status("submitted") + status("awaiting_review"),
    critical: band("critical"),
    high: band("high"),
    inProgress: status("in_progress"),
    resolved: status("resolved") + status("closed"),
    availableCrews: availableCrews?.value ?? 0,
    pendingDuplicates: pendingDuplicates?.value ?? 0,
  };
}

export type Analytics = Awaited<ReturnType<typeof getAnalytics>>;

export async function getAnalytics(actor: StaffActor | null) {
  requireCoordinator(actor);
  const db = await getDb();

  const byCategory = await db.select({ key: incidents.category, value: countAll }).from(incidents).groupBy(incidents.category);
  const byStatus = await db.select({ key: incidents.status, value: countAll }).from(incidents).groupBy(incidents.status);
  const byPriority = await db.select({ key: incidents.priorityBand, value: countAll }).from(incidents).groupBy(incidents.priorityBand);
  const totalIncidents = byStatus.reduce((sum, row) => sum + row.value, 0);

  const [flagged] = await db
    .select({ value: sql<number>`count(distinct ${duplicateCandidates.laterIncidentId})::int` })
    .from(duplicateCandidates);
  const candidateStatus = await db.select({ key: duplicateCandidates.status, value: countAll }).from(duplicateCandidates).groupBy(duplicateCandidates.status);
  const assignmentStatus = await db.select({ key: crewAssignments.status, value: countAll }).from(crewAssignments).groupBy(crewAssignments.status);

  const approvedAssignments = assignmentStatus
    .filter((row) => row.key !== "proposed" && row.key !== "cancelled")
    .reduce((sum, row) => sum + row.value, 0);
  const verifiedAssignments = assignmentStatus.find((row) => row.key === "verified")?.value ?? 0;

  // Durations are derived from the first time each incident reached a status.
  const history = await db
    .select({ incidentId: incidentStatusHistory.incidentId, toStatus: incidentStatusHistory.toStatus, createdAt: incidentStatusHistory.createdAt })
    .from(incidentStatusHistory)
    .orderBy(asc(incidentStatusHistory.createdAt));
  const firstReached = new Map<string, Partial<Record<IncidentStatus, number>>>();
  for (const entry of history) {
    const record = firstReached.get(entry.incidentId) ?? {};
    record[entry.toStatus] ??= entry.createdAt.getTime();
    firstReached.set(entry.incidentId, record);
  }
  const hoursBetween = (from: IncidentStatus, to: IncidentStatus): number[] => {
    const result: number[] = [];
    for (const record of firstReached.values()) {
      const start = record[from];
      const end = record[to];
      if (start !== undefined && end !== undefined && end >= start) result.push((end - start) / 3_600_000);
    }
    return result;
  };

  const count = (rows: Array<{ key: string; value: number }>, key: string) => rows.find((row) => row.key === key)?.value ?? 0;
  return {
    totalIncidents,
    byCategory: INCIDENT_CATEGORIES.map((key) => ({ key, label: CATEGORY_DEFINITIONS[key].label, value: count(byCategory, key) })).filter((row) => row.value > 0),
    byStatus: INCIDENT_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key], value: count(byStatus, key) })),
    byPriority: PRIORITY_BANDS.map((key) => ({ key, label: PRIORITY_LABELS[key], value: count(byPriority, key) })),
    duplicates: {
      flaggedIncidents: flagged?.value ?? 0,
      /** Share of all reports flagged as a possible duplicate of an earlier report. */
      detectionRate: totalIncidents > 0 ? (flagged?.value ?? 0) / totalIncidents : null,
      pending: count(candidateStatus, "pending"),
      confirmed: count(candidateStatus, "confirmed"),
      rejected: count(candidateStatus, "rejected"),
    },
    assignments: {
      approved: approvedAssignments,
      verifiedComplete: verifiedAssignments,
      completionRate: approvedAssignments > 0 ? verifiedAssignments / approvedAssignments : null,
    },
    durations: [
      durationStatistic("Report received to verified", hoursBetween("submitted", "verified")),
      durationStatistic("Verified to crew assigned", hoursBetween("verified", "assigned")),
      durationStatistic("Crew assigned to resolved", hoursBetween("assigned", "resolved")),
    ],
  };
}

const CSV_COLUMNS = [
  "reference",
  "category",
  "status",
  "priority_band",
  "priority_score",
  "priority_overridden",
  "latitude",
  "longitude",
  "address",
  "reported_at",
  "updated_at",
  "confirmed_duplicate",
] as const;

/** Quotes a value for CSV and neutralises spreadsheet formula injection. */
function csvCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Operational export. Reporter contact details and free-text descriptions are excluded. */
export async function exportIncidentsCsv(actor: StaffActor | null): Promise<string> {
  requireCoordinator(actor);
  const db = await getDb();
  const rows = await db.select().from(incidents).orderBy(asc(incidents.createdAt));
  const lines = rows.map((row) =>
    [
      row.reference,
      row.category,
      row.status,
      row.priorityBand,
      row.priorityScore,
      row.priorityOverridden,
      row.latitude,
      row.longitude,
      row.address,
      row.createdAt.toISOString(),
      row.updatedAt.toISOString(),
      row.duplicateOfId !== null,
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...lines].join("\r\n") + "\r\n";
}
