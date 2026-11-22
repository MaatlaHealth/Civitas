import { after, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { errorMetadata, logger } from "@/lib/logger";
import { runAnalysis } from "@/lib/services/analysis";
import { submitIncident } from "@/lib/services/intake";
import { clientAddress, enforceRateLimit, RATE_LIMITS } from "@/lib/services/rate-limit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/image-processing";
import { formDataToObject, parseOrThrow, reportSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

async function readPhotograph(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("photograph");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError("payload_too_large", "The photograph is too large. The maximum size is 4 MB.");
  }
  return new Uint8Array(await file.arrayBuffer());
}

/** Accepts a citizen report (multipart form data). No account is required. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(RATE_LIMITS.report, clientAddress(request.headers));

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new AppError("validation", "The report could not be read. Please reload the page and try again.");
    }
    const input = parseOrThrow(reportSchema, formDataToObject(formData));
    const result = await submitIncident(input, await readPhotograph(formData));

    // The advisory AI analysis runs after the response is sent. If it fails
    // or never runs, the report is unaffected and a coordinator can retry it.
    if (result.analysisConfigured) {
      after(async () => {
        try {
          await runAnalysis(result.incidentId);
        } catch (error) {
          logger.error("analysis.background.failed", { incidentId: result.incidentId, ...errorMetadata(error) });
        }
      });
    }

    return NextResponse.json(
      {
        reference: result.reference,
        accessCode: result.accessCode,
        photographStored: result.photographStored,
        photographProblem: result.photographProblem,
        analysisConfigured: result.analysisConfigured,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse("POST /api/incidents", error);
  }
}
