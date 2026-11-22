import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/errors";
import { errorMetadata, logger } from "@/lib/logger";

/** What a server action returns to the form that invoked it. */
export type ActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
} | null;

/**
 * Runs a server action body and converts the outcome to an ActionState.
 * Expected failures (AppError) return their user-facing message. Anything
 * else is logged with its details and reported generically.
 */
export async function runAction(name: string, body: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await body() };
  } catch (error) {
    // Let Next.js redirects and not-found signals pass through.
    unstable_rethrow(error);
    if (error instanceof AppError) {
      return { ok: false, message: error.message, fieldErrors: error.fieldErrors };
    }
    logger.error("action.failed", { action: name, ...errorMetadata(error) });
    return { ok: false, message: "Something went wrong on our side and the change was not saved. Please try again." };
  }
}
