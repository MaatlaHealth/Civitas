import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isGeminiConfigured } from "@/lib/ai/gemini";
import { getDb } from "@/lib/db/client";
import { incidentImages, incidents, incidentStatusHistory, reporterContacts } from "@/lib/db/schema";
import { AppError, isUniqueViolation } from "@/lib/errors";
import { errorMetadata, logger } from "@/lib/logger";
import { processUploadedImage, type ProcessedImage } from "@/lib/storage/image-processing";
import { getImageStore } from "@/lib/storage/image-store";
import type { ReportInput } from "@/lib/validation/schemas";
import { getOrganizationId, loadIncident, recordAudit, transitionIncident } from "./core";
import { detectDuplicates } from "./duplicates";
import { recalculatePriority } from "./priority";

/** Crockford base32: no I, L, O or U, so codes are easy to read aloud and copy. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const REFERENCE_LENGTH = 8;
const ACCESS_CODE_LENGTH = 20;

function randomCode(length: number): string {
  const bytes = randomBytes(length);
  let code = "";
  // 256 is a multiple of 32, so the modulo introduces no bias.
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

export function hashAccessCode(accessCode: string): string {
  return createHash("sha256").update(accessCode).digest("hex");
}

export interface SubmissionResult {
  incidentId: string;
  reference: string;
  /** Shown to the citizen once. Only its hash is stored. */
  accessCode: string;
  photographStored: boolean;
  photographProblem: string | null;
  duplicateCandidates: number;
  analysisConfigured: boolean;
}

async function storePhotograph(incidentId: string, image: ProcessedImage): Promise<void> {
  const storageKey = `reports/${incidentId}/${randomUUID()}.jpg`;
  await getImageStore().put(storageKey, image.bytes, image.contentType);
  const db = await getDb();
  await db.insert(incidentImages).values({
    incidentId,
    kind: "report",
    storageKey,
    contentType: image.contentType,
    byteSize: image.bytes.byteLength,
    width: image.width,
    height: image.height,
  });
}

/**
 * Deterministic intake checks: duplicate search, priority assessment and the
 * move to "awaiting review". Safe to run again; coordinators can re-run it
 * if it failed during submission.
 */
export async function runIntakeChecks(incidentId: string): Promise<number> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const incident = await loadIncident(tx, incidentId);
    const duplicates = await detectDuplicates(tx, incident);
    const assessed = await recalculatePriority(tx, incidentId);
    if (assessed.status === "submitted") {
      await transitionIncident(tx, assessed, "awaiting_review", { actorKind: "system", manual: false });
    }
    return duplicates;
  });
}

/**
 * Accepts a citizen report.
 *
 * The report row is committed first, on its own. Everything after that
 * (photograph storage, duplicate search, priority) is allowed to fail without
 * losing the report: the failure is logged, reported back, and can be retried
 * by a coordinator. AI analysis is started separately by the caller.
 */
export async function submitIncident(input: ReportInput, photograph: Uint8Array | null): Promise<SubmissionResult> {
  // A file that is not a readable image is the reporter's to fix, so it is
  // rejected before anything is saved.
  const image = photograph ? await processUploadedImage(photograph) : null;

  const db = await getDb();
  const organizationId = await getOrganizationId(db);
  const reference = `CIV-${randomCode(REFERENCE_LENGTH)}`;
  const accessCode = randomCode(ACCESS_CODE_LENGTH);
  const analysisConfigured = isGeminiConfigured();
  const obstructsAccess = input.obstructsAccess === "unsure" ? null : input.obstructsAccess === "yes";
  const hasContact = !input.anonymous && Boolean(input.reporterName || input.reporterEmail || input.reporterPhone);

  let incidentId: string;
  try {
    incidentId = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(incidents)
        .values({
          organizationId,
          reference,
          trackingTokenHash: hashAccessCode(accessCode),
          submissionKey: input.submissionKey,
          category: input.category,
          reportedCategory: input.category,
          title: input.title,
          description: input.description,
          latitude: input.latitude,
          longitude: input.longitude,
          address: input.address,
          obstructsAccess,
          reportedDuration: input.reportedDuration,
          analysisStatus: analysisConfigured ? "pending" : "not_configured",
        })
        .returning({ id: incidents.id });
      if (!created) throw new AppError("unavailable", "The report could not be saved. Please try again.");
      if (hasContact) {
        await tx.insert(reporterContacts).values({
          incidentId: created.id,
          name: input.reporterName,
          email: input.reporterEmail,
          phone: input.reporterPhone,
        });
      }
      await tx.insert(incidentStatusHistory).values({ incidentId: created.id, fromStatus: null, toStatus: "submitted", actorKind: "citizen" });
      await recordAudit(tx, {
        organizationId,
        actorKind: "citizen",
        action: "incident.submitted",
        entityType: "incident",
        entityId: created.id,
        incidentId: created.id,
        detail: { category: input.category, anonymous: !hasContact, withPhotograph: image !== null },
      });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("conflict", "This report has already been received. Use the reference and access code shown when it was first submitted.");
    }
    throw error;
  }

  let photographStored = false;
  let photographProblem: string | null = null;
  if (image) {
    try {
      await storePhotograph(incidentId, image);
      photographStored = true;
    } catch (error) {
      logger.error("intake.photograph.failed", { incidentId, ...errorMetadata(error) });
      photographProblem = "Your report was saved, but the photograph could not be stored.";
    }
  }

  let duplicateCandidates = 0;
  try {
    duplicateCandidates = await runIntakeChecks(incidentId);
  } catch (error) {
    logger.error("intake.checks.failed", { incidentId, ...errorMetadata(error) });
  }

  return { incidentId, reference, accessCode, photographStored, photographProblem, duplicateCandidates, analysisConfigured };
}
