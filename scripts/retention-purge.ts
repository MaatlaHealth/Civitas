/**
 * Erases reporter contact details for incidents that were closed or rejected
 * more than a given number of days ago. The incidents themselves are kept.
 *
 *   npm run retention:purge              (default: 90 days)
 *   npm run retention:purge -- --days 30
 *   npm run retention:purge -- --dry-run
 */
import { and, eq, inArray, lt } from "drizzle-orm";
import { loadLocalEnvironment } from "./env";

loadLocalEnvironment();

const DEFAULT_RETENTION_DAYS = 90;

async function main(): Promise<void> {
  const daysIndex = process.argv.indexOf("--days");
  const days = daysIndex >= 0 ? Number(process.argv[daysIndex + 1]) : DEFAULT_RETENTION_DAYS;
  if (!Number.isInteger(days) || days < 1) throw new Error("--days must be a whole number of at least 1.");
  const dryRun = process.argv.includes("--dry-run");

  const { getDb } = await import("../src/lib/db/client");
  const { incidents, reporterContacts } = await import("../src/lib/db/schema");
  const { recordAudit } = await import("../src/lib/services/core");
  const db = await getDb();
  const cutoff = new Date(Date.now() - days * 24 * 3_600_000);

  const due = await db
    .select({ id: incidents.id, organizationId: incidents.organizationId })
    .from(incidents)
    .innerJoin(reporterContacts, eq(reporterContacts.incidentId, incidents.id))
    .where(and(inArray(incidents.status, ["closed", "rejected"]), lt(incidents.updatedAt, cutoff)));

  if (dryRun) {
    console.log(`${due.length} incident(s) have contact details due for erasure (dry run, nothing changed).`);
    return;
  }
  for (const incident of due) {
    await db.delete(reporterContacts).where(eq(reporterContacts.incidentId, incident.id));
    await recordAudit(db, {
      organizationId: incident.organizationId,
      actorKind: "system",
      action: "incident.reporter_contact_erased",
      entityType: "incident",
      entityId: incident.id,
      incidentId: incident.id,
      detail: { reason: "retention", retentionDays: days },
    });
  }
  console.log(`Erased contact details for ${due.length} incident(s) closed or rejected more than ${days} days ago.`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
