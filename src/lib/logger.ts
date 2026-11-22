/**
 * Structured JSON logging. Callers pass event names and metadata only;
 * report text, contact details and image contents must never be logged.
 */
type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, event: string, metadata: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "test") return;
  const line = JSON.stringify({ level, event, time: new Date().toISOString(), ...metadata });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { errorName: error.name, errorMessage: error.message };
  return { errorMessage: String(error) };
}

export const logger = {
  info: (event: string, metadata?: Record<string, unknown>) => write("info", event, metadata),
  warn: (event: string, metadata?: Record<string, unknown>) => write("warn", event, metadata),
  error: (event: string, metadata?: Record<string, unknown>) => write("error", event, metadata),
};
