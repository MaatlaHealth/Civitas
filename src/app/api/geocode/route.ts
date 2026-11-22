import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, suggestAddresses } from "@/lib/services/geocoding";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/services/rate-limit";
import { parseOrThrow } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().trim().min(MIN_QUERY_LENGTH).max(MAX_QUERY_LENGTH),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** Address suggestions for the report form. The text is sent in the body, not the URL. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(RATE_LIMITS.geocode, clientAddress(request.headers));
    const body: unknown = await request.json().catch(() => {
      throw new AppError("validation", "The request could not be read.");
    });
    const { query, latitude, longitude } = parseOrThrow(requestSchema, body);
    const suggestions = await suggestAddresses(query, { latitude, longitude });
    return NextResponse.json({ suggestions }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse("POST /api/geocode", error);
  }
}
