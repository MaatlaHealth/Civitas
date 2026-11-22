import { and, eq, inArray } from "drizzle-orm";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { crewAssignments, incidentImages } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { getImageStore } from "@/lib/storage/image-store";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves an incident photograph to authorised staff only. Coordinators may
 * view any photograph; crew members only those of incidents assigned to one
 * of their crews. Photographs have no public URL.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const actor = await getActor();
    if (!actor) throw new AppError("unauthenticated", "Please sign in to view this photograph.");
    if (!UUID_PATTERN.test(id)) throw new AppError("not_found", "Photograph not found.");

    const db = await getDb();
    const [image] = await db.select().from(incidentImages).where(eq(incidentImages.id, id)).limit(1);
    if (!image) throw new AppError("not_found", "Photograph not found.");

    if (actor.kind === "crew") {
      const assigned =
        actor.crewIds.length === 0
          ? []
          : await db
              .select({ id: crewAssignments.id })
              .from(crewAssignments)
              .where(
                and(
                  eq(crewAssignments.incidentId, image.incidentId),
                  inArray(crewAssignments.crewId, [...actor.crewIds]),
                  inArray(crewAssignments.status, ["assigned", "accepted", "in_progress", "completed", "verified"]),
                ),
              )
              .limit(1);
      // Report the same error as a missing image so existence is not revealed.
      if (assigned.length === 0) throw new AppError("not_found", "Photograph not found.");
    }

    const bytes = await getImageStore().get(image.storageKey);
    if (!bytes) throw new AppError("not_found", "The photograph file is no longer available.");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse("GET /api/images/[id]", error);
  }
}
