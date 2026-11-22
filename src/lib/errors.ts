export type AppErrorCode =
  | "validation"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "payload_too_large"
  | "unsupported_media"
  | "unavailable";

const HTTP_STATUS: Record<AppErrorCode, number> = {
  validation: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  payload_too_large: 413,
  unsupported_media: 415,
  unavailable: 503,
};

/**
 * An expected failure with a message that is safe to show to the user.
 * Anything that is not an AppError is treated as an internal error and its
 * details are logged, never returned.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  get status(): number {
    return HTTP_STATUS[this.code];
  }
}

export const CONCURRENT_UPDATE_MESSAGE =
  "This record was changed by someone else while you were viewing it. Reload the page and try again.";

/** PostgreSQL unique-violation, as reported by both pg and PGlite. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
