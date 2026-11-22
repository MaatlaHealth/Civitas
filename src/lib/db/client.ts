import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { AppError } from "@/lib/errors";
import { errorMetadata, logger } from "@/lib/logger";
import * as schema from "./schema";

/**
 * Driver-independent database handle. Transactions have the same type, so
 * service functions accept either.
 */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");
const SERVERLESS_POOL_SIZE = 3;

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || undefined;
}

function embeddedDatabaseAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CIVITAS_ALLOW_EMBEDDED_DB === "true";
}

async function connectPostgres(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({ connectionString: url, max: SERVERLESS_POOL_SIZE });
  pool.on("error", (error) => logger.error("db.pool.error", errorMetadata(error)));
  return drizzle(pool, { schema }) as unknown as Database;
}

/**
 * Embedded PGlite (PostgreSQL compiled to WebAssembly) for local development
 * and automated tests only. It stores data on the local filesystem, which a
 * serverless host does not persist, so it is refused in production unless
 * explicitly allowed for a local `next start`.
 */
export async function connectEmbedded(dataDirectory?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dataDirectory) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(dataDirectory), { recursive: true });
  }
  const client = new PGlite(dataDirectory);
  const database = drizzle(client, { schema });
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
  return database as unknown as Database;
}

async function connect(): Promise<Database> {
  const url = databaseUrl();
  if (url) return connectPostgres(url);
  if (embeddedDatabaseAllowed()) {
    const directory = process.env.CIVITAS_EMBEDDED_DB_DIR || path.join(process.cwd(), ".data", "pglite");
    return connectEmbedded(directory);
  }
  throw new AppError("unavailable", "The database is not configured for this deployment.");
}

// Cached on globalThis so development hot reloads reuse one connection.
const globalCache = globalThis as typeof globalThis & { civitasDatabase?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!globalCache.civitasDatabase) {
    globalCache.civitasDatabase = connect().catch((error: unknown) => {
      globalCache.civitasDatabase = undefined;
      if (error instanceof AppError) throw error;
      logger.error("db.connect.failed", errorMetadata(error));
      throw new AppError("unavailable", "The database is currently unavailable. Please try again shortly.");
    });
  }
  return globalCache.civitasDatabase;
}

/** Test hook: replaces the shared connection with an isolated database. */
export function setDbForTesting(database: Database | undefined): void {
  globalCache.civitasDatabase = database ? Promise.resolve(database) : undefined;
}
