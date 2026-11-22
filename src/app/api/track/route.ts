import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/services/rate-limit";
import { addReporterInformation, getPublicIncident } from "@/lib/services/tracking";
import { parseOrThrow, reporterInformationSchema, trackingLookupSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("validation", "The request could not be read.");
  }
}

/**
 * Looks up the public view of an incident. Credentials are sent in the
 * request body rather than the URL so they do not end up in server logs or
 * browser history.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(RATE_LIMITS.tracking, clientAddress(request.headers));
    const { reference, accessCode } = parseOrThrow(trackingLookupSchema, await readJson(request));
    return NextResponse.json(await getPublicIncident(reference, accessCode), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse("POST /api/track", error);
  }
}

/** Adds further information from the reporter to an existing incident. */
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(RATE_LIMITS.tracking, clientAddress(request.headers));
    const { reference, accessCode, body } = parseOrThrow(reporterInformationSchema, await readJson(request));
    await addReporterInformation(reference, accessCode, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse("PUT /api/track", error);
  }
}
