"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/lib/auth/session";
import { CREW_STATUSES } from "@/lib/domain/types";
import { runAnalysis } from "@/lib/services/analysis";
import { requireCoordinator } from "@/lib/auth/actor";
import {
  approveProposal,
  cancelAssignment,
  createAssignment,
  reassign,
  resolveAssistance,
  returnForRework,
  verifyCompletion,
} from "@/lib/services/assignments";
import { createAsset, deleteAsset, setAssetVerified } from "@/lib/services/assets";
import { createCrew, setCrewStatus, updateCrew } from "@/lib/services/crews";
import { loadDemoData } from "@/lib/services/demo-data";
import { reviewDuplicate } from "@/lib/services/duplicates";
import {
  addInternalNote,
  changeStatus,
  deleteIncidentImage,
  eraseReporterContact,
  publishPublicUpdate,
  rerunIntakeChecks,
  updateClassification,
} from "@/lib/services/incidents";
import { proposeLivePlan } from "@/lib/services/planning";
import { clearPriorityOverride, overridePriority } from "@/lib/services/priority";
import {
  assetSchema,
  assignmentCreateSchema,
  classificationSchema,
  crewSchema,
  duplicateReviewSchema,
  formDataToObject,
  noteSchema,
  parseOrThrow,
  priorityOverrideSchema,
  publicUpdateSchema,
  statusChangeSchema,
} from "@/lib/validation/schemas";
import { runAction, type ActionState } from "./result";

/**
 * Server actions for coordinator pages. Each one resolves the signed-in
 * actor on the server and passes it to a service function, which performs
 * the authorisation check; nothing here trusts the browser.
 */

const idSchema = z.object({ id: z.uuid() });
const idWithVersionSchema = z.object({ id: z.uuid(), version: z.coerce.number().int().positive() });
const idWithReasonSchema = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(10, "Give a reason of at least 10 characters.").max(500),
});

const refresh = () => revalidatePath("/dashboard", "layout");

export async function updateClassificationAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateClassification", async () => {
    await updateClassification(await getActor(), parseOrThrow(classificationSchema, formDataToObject(formData)));
    refresh();
    return "Classification saved and priority recalculated.";
  });
}

export async function changeStatusAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("changeStatus", async () => {
    await changeStatus(await getActor(), parseOrThrow(statusChangeSchema, formDataToObject(formData)));
    refresh();
    return "Status updated.";
  });
}

export async function overridePriorityAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("overridePriority", async () => {
    await overridePriority(await getActor(), parseOrThrow(priorityOverrideSchema, formDataToObject(formData)));
    refresh();
    return "Priority override recorded.";
  });
}

export async function clearOverrideAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("clearOverride", async () => {
    const { id, version } = parseOrThrow(idWithVersionSchema, formDataToObject(formData));
    await clearPriorityOverride(await getActor(), id, version);
    refresh();
    return "Override cleared. The calculated priority applies again.";
  });
}

export async function addNoteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("addNote", async () => {
    const { incidentId, body } = parseOrThrow(noteSchema, formDataToObject(formData));
    await addInternalNote(await getActor(), incidentId, body);
    refresh();
    return "Internal note added.";
  });
}

export async function publishUpdateAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("publishUpdate", async () => {
    const { incidentId, body } = parseOrThrow(publicUpdateSchema, formDataToObject(formData));
    await publishPublicUpdate(await getActor(), incidentId, body);
    refresh();
    return "Update published. The reporter can now see it on the tracking page.";
  });
}

export async function rerunChecksAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("rerunChecks", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    const created = await rerunIntakeChecks(await getActor(), id);
    refresh();
    return `Checks re-run. ${created} new possible duplicate${created === 1 ? "" : "s"} found; priority recalculated.`;
  });
}

export async function rerunAnalysisAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("rerunAnalysis", async () => {
    requireCoordinator(await getActor());
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    const outcome = await runAnalysis(id, { force: true });
    refresh();
    if (!outcome || outcome.ok) return "AI analysis completed.";
    if (outcome.errorCode === "not_configured") return "AI analysis is not configured for this deployment (no Gemini API key).";
    return `AI analysis failed (${outcome.errorCode}). The report itself is unaffected; you can try again later.`;
  });
}

export async function eraseContactAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("eraseContact", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await eraseReporterContact(await getActor(), id);
    refresh();
    return "Reporter contact details permanently erased.";
  });
}

export async function deleteImageAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("deleteImage", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await deleteIncidentImage(await getActor(), id);
    refresh();
    return "Photograph permanently deleted.";
  });
}

export async function reviewDuplicateAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("reviewDuplicate", async () => {
    const input = parseOrThrow(duplicateReviewSchema, formDataToObject(formData));
    await reviewDuplicate(await getActor(), input);
    refresh();
    if (input.decision === "confirmed") return "Match confirmed. Both reports are kept; the later one is linked to the earlier one.";
    if (input.decision === "rejected") return "Match rejected. The reports remain separate.";
    return "Decision reopened. The pair is awaiting review again.";
  });
}

export async function assignCrewAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("assignCrew", async () => {
    const input = parseOrThrow(assignmentCreateSchema, formDataToObject(formData));
    await createAssignment(await getActor(), { ...input, asProposal: false });
    refresh();
    return "Crew assigned. The crew has been asked to accept the job.";
  });
}

export async function approveProposalAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("approveProposal", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await approveProposal(await getActor(), id);
    refresh();
    return "Proposal approved and crew assigned.";
  });
}

export async function cancelAssignmentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("cancelAssignment", async () => {
    const { id, reason } = parseOrThrow(idWithReasonSchema, formDataToObject(formData));
    await cancelAssignment(await getActor(), id, reason);
    refresh();
    return "Assignment cancelled.";
  });
}

export async function reassignAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("reassign", async () => {
    const data = formDataToObject(formData);
    const { id, reason } = parseOrThrow(idWithReasonSchema, data);
    const { crewId } = parseOrThrow(z.object({ crewId: z.uuid("Choose a crew.") }), data);
    await reassign(await getActor(), id, crewId, reason);
    refresh();
    return "Incident reassigned.";
  });
}

export async function verifyCompletionAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("verifyCompletion", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await verifyCompletion(await getActor(), id);
    refresh();
    return "Completion verified. The incident is now resolved.";
  });
}

export async function returnForReworkAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("returnForRework", async () => {
    const { id, reason } = parseOrThrow(idWithReasonSchema, formDataToObject(formData));
    await returnForRework(await getActor(), id, reason);
    refresh();
    return "Returned to the crew for further work.";
  });
}

export async function resolveAssistanceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("resolveAssistance", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await resolveAssistance(await getActor(), id);
    refresh();
    return "Assistance request marked as handled.";
  });
}

export async function proposeLivePlanAction(): Promise<ActionState> {
  return runAction("proposeLivePlan", async () => {
    const { created, skipped } = await proposeLivePlan(await getActor());
    refresh();
    if (created === 0 && skipped.length === 0) return "No verified, unassigned incidents could be matched to an available qualified crew.";
    const skippedNote = skipped.length > 0 ? ` ${skipped.length} could not be proposed: ${skipped[0]}` : "";
    return `${created} proposal${created === 1 ? "" : "s"} created. Each one needs your approval before the crew is notified.${skippedNote}`;
  });
}

export async function createCrewAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createCrew", async () => {
    await createCrew(await getActor(), parseOrThrow(crewSchema, formDataToObject(formData)));
    refresh();
    return "Crew created.";
  });
}

export async function updateCrewAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("updateCrew", async () => {
    const data = formDataToObject(formData);
    const { id } = parseOrThrow(idSchema, data);
    await updateCrew(await getActor(), id, parseOrThrow(crewSchema, data));
    refresh();
    return "Crew updated.";
  });
}

export async function setCrewStatusAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("setCrewStatus", async () => {
    const { id, status } = parseOrThrow(idSchema.extend({ status: z.enum(CREW_STATUSES) }), formDataToObject(formData));
    await setCrewStatus(await getActor(), id, status);
    refresh();
    return "Crew availability updated.";
  });
}

export async function createAssetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("createAsset", async () => {
    await createAsset(await getActor(), parseOrThrow(assetSchema, formDataToObject(formData)));
    refresh();
    return "Asset registered.";
  });
}

export async function setAssetVerifiedAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("setAssetVerified", async () => {
    const { id, verified } = parseOrThrow(idSchema.extend({ verified: z.enum(["true", "false"]) }), formDataToObject(formData));
    await setAssetVerified(await getActor(), id, verified === "true");
    refresh();
    return verified === "true" ? "Asset marked as verified." : "Asset marked as unverified.";
  });
}

export async function deleteAssetAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("deleteAsset", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await deleteAsset(await getActor(), id);
    refresh();
    return "Asset removed from the registry.";
  });
}

export async function loadDemoDataAction(): Promise<ActionState> {
  return runAction("loadDemoData", async () => {
    const { reportsCreated, trackable } = await loadDemoData(await getActor());
    refresh();
    if (reportsCreated === 0) return "Demonstration data is already loaded.";
    const tracking = trackable
      ? ` To try the public tracking page, use reference ${trackable.reference} with access code ${trackable.accessCode} (shown once).`
      : "";
    return `Loaded ${reportsCreated} demonstration reports with demo crews and assets.${tracking}`;
  });
}
