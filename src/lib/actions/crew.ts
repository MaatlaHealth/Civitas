"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActor } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import {
  addFieldNote,
  completeWork,
  requestAssistance,
  respondToAssignment,
  startWork,
} from "@/lib/services/assignments";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/image-processing";
import { formDataToObject, parseOrThrow } from "@/lib/validation/schemas";
import { runAction, type ActionState } from "./result";

/** Server actions for the crew workspace. Crew membership is checked in the service layer. */

const idSchema = z.object({ id: z.uuid() });
const noteText = (label: string) =>
  z.string().trim().min(5, `${label} must be at least 5 characters.`).max(2000, `${label} must be at most 2000 characters.`);

const refresh = () => {
  revalidatePath("/crew", "layout");
  revalidatePath("/dashboard", "layout");
};

export async function respondAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("crewRespond", async () => {
    // The field is called "decision" because Netlify's edge rejects form posts that contain a field named "response".
    const { id, decision, reason } = parseOrThrow(
      idSchema.extend({ decision: z.enum(["accepted", "declined"]), reason: z.string().trim().max(500).optional() }),
      formDataToObject(formData),
    );
    await respondToAssignment(await getActor(), id, decision, reason || null);
    refresh();
    return decision === "accepted" ? "Assignment accepted." : "Assignment declined. The coordinator has been informed.";
  });
}

export async function startWorkAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("crewStartWork", async () => {
    const { id } = parseOrThrow(idSchema, formDataToObject(formData));
    await startWork(await getActor(), id);
    refresh();
    return "Work started.";
  });
}

export async function addFieldNoteAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("crewFieldNote", async () => {
    const { id, body } = parseOrThrow(idSchema.extend({ body: noteText("The note") }), formDataToObject(formData));
    await addFieldNote(await getActor(), id, body);
    refresh();
    return "Field note added.";
  });
}

export async function requestAssistanceAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("crewRequestAssistance", async () => {
    const { id, note } = parseOrThrow(idSchema.extend({ note: noteText("The request") }), formDataToObject(formData));
    await requestAssistance(await getActor(), id, note);
    refresh();
    return "The coordinator has been asked for assistance.";
  });
}

export async function completeWorkAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  return runAction("crewCompleteWork", async () => {
    const { id, completionNotes } = parseOrThrow(
      idSchema.extend({ completionNotes: noteText("Completion notes") }),
      formDataToObject(formData),
    );
    const file = formData.get("evidence");
    let evidence: Uint8Array | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) throw new AppError("payload_too_large", "The photograph is too large. The maximum size is 4 MB.");
      evidence = new Uint8Array(await file.arrayBuffer());
    }
    await completeWork(await getActor(), id, completionNotes, evidence);
    refresh();
    return "Work marked complete. A coordinator will verify it.";
  });
}
