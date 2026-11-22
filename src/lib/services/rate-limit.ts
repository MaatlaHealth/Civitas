import { createHash } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";

export interface RateLimitRule {
  /** Identifies the protected operation, e.g. "report". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  report: { name: "report", limit: 6, windowSeconds: 600 },
  tracking: { name: "tracking", limit: 30, windowSeconds: 600 },
  login: { name: "login", limit: 8, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/** Probability of sweeping expired counters on any one request. */
const CLEANUP_PROBABILITY = 0.02;
const CLEANUP_AGE_MS = 24 * 3_600_000;

export function clientAddress(headers: Headers): string {
  return (
    headers.get("x-nf-client-connection-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

/**
 * Fixed-window rate limit backed by the database, so it holds across
 * serverless instances (an in-memory counter would not). The subject (an IP
 * address or email) is hashed before it is stored.
 */
export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const db = await getDb();
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const bucket = `${rule.name}:${createHash("sha256").update(subject).digest("hex").slice(0, 32)}`;

  const [row] = await db
    .insert(rateLimits)
    .values({ bucket, windowStart })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });

  if (Math.random() < CLEANUP_PROBABILITY) {
    await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - CLEANUP_AGE_MS)));
  }
  if ((row?.count ?? 0) > rule.limit) {
    const minutes = Math.ceil(rule.windowSeconds / 60);
    throw new AppError("rate_limited", `Too many requests. Please wait up to ${minutes} minutes and try again.`);
  }
}
