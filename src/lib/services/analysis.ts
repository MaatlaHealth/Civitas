import { and, asc, desc, eq } from "drizzle-orm";
import { analyzeIncident, type AnalysisOutcome } from "@/lib/ai/gemini";
import { getDb } from "@/lib/db/client";
import { aiAnalyses, incidentImages, incidents } from "@/lib/db/schema";
import { errorMetadata, logger } from "@/lib/logger";
import { getImageStore } from "@/lib/storage/image-store";
import { loadIncident } from "./core";

async function loadReportPhotograph(incidentId: string) {
  const db = await getDb();
  const [image] = await db
    .select()
    .from(incidentImages)
    .where(and(eq(incidentImages.incidentId, incidentId), eq(incidentImages.kind, "report")))
    .orderBy(asc(incidentImages.createdAt))
    .limit(1);
  if (!image) return undefined;
  try {
    const bytes = await getImageStore().get(image.storageKey);
    return bytes ? { bytes, contentType: image.contentType } : undefined;
  } catch (error) {
    // Analysis can still proceed on the text alone.
    logger.warn("analysis.photograph.unreadable", { incidentId, ...errorMetadata(error) });
    return undefined;
  }
}

/**
 * Runs the advisory AI analysis for an incident and records the outcome,
 * successful or not. A successful analysis is reused rather than repeated
 * unless `force` is set (a coordinator explicitly asked for a re-run).
 */
export async function runAnalysis(incidentId: string, options: { force?: boolean } = {}): Promise<AnalysisOutcome | null> {
  const db = await getDb();
  const incident = await loadIncident(db, incidentId);
  if (!options.force && incident.analysisStatus === "completed") return null;

  const image = await loadReportPhotograph(incidentId);
  const outcome = await analyzeIncident({
    reportedCategory: incident.reportedCategory,
    title: incident.title,
    description: incident.description,
    image,
  });

  if (!outcome.ok && outcome.errorCode === "not_configured") {
    await db.update(incidents).set({ analysisStatus: "not_configured" }).where(eq(incidents.id, incidentId));
    return outcome;
  }
  await db.insert(aiAnalyses).values({
    incidentId,
    succeeded: outcome.ok,
    model: outcome.model,
    includedImage: image !== undefined,
    result: outcome.ok ? outcome.analysis : null,
    errorCode: outcome.ok ? null : outcome.errorCode,
    durationMs: outcome.durationMs,
  });
  // analysis_status is advisory metadata, so it does not bump the incident version.
  await db
    .update(incidents)
    .set({ analysisStatus: outcome.ok ? "completed" : "failed" })
    .where(eq(incidents.id, incidentId));
  return outcome;
}

export async function latestAnalysis(incidentId: string) {
  const db = await getDb();
  const [analysis] = await db
    .select()
    .from(aiAnalyses)
    .where(eq(aiAnalyses.incidentId, incidentId))
    .orderBy(desc(aiAnalyses.createdAt))
    .limit(1);
  return analysis ?? null;
}
