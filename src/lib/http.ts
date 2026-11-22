import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { errorMetadata, logger } from "@/lib/logger";

export interface ApiErrorBody {
  error: { code: string; message: string; fieldErrors?: Record<string, string> };
}

/** Converts any thrown value to a structured JSON error. Internal details are logged, never returned. */
export function errorResponse(route: string, error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } },
      { status: error.status },
    );
  }
  logger.error("api.unhandled", { route, ...errorMetadata(error) });
  return NextResponse.json(
    { error: { code: "internal", message: "Something went wrong on our side. Please try again shortly." } },
    { status: 500 },
  );
}

/**
 * Rejects state-changing requests sent from another origin. Browsers always
 * send Origin on cross-site POSTs, so a mismatch means the request did not
 * come from this site's own pages. No CORS headers are ever emitted.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "Cross-origin requests are not allowed.");
  }
  if (originHost !== host) throw new AppError("forbidden", "Cross-origin requests are not allowed.");
}
