import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Pool, PoolClient } from "pg";
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
const IDLE_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 8_000;
/** Connections idle for longer than this are checked before reuse. */
const RECHECK_AFTER_IDLE_MS = 3_000;
const HEALTH_CHECK_TIMEOUT_MS = 2_000;

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || undefined;
}

function embeddedDatabaseAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CIVITAS_ALLOW_EMBEDDED_DB === "true";
}

async function connectPostgres(url: string): Promise<Database> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    max: SERVERLESS_POOL_SIZE,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    keepAlive: true,
  });
  pool.on("error", (error) => logger.error("db.pool.error", errorMetadata(error)));
  guardAgainstStaleConnections(pool);
  return drizzle(pool, { schema }) as unknown as Database;
}

/**
 * A serverless function is frozen between requests. A pooled connection that
 * was idle through a freeze may have been closed by the database in the
 * meantime, and the next query on it fails. Before reusing a connection that
 * has been idle for a while, this sends a trivial query; if that fails or
 * does not answer promptly the connection is discarded and a new one is
 * opened. Fresh and recently used connections are not checked.
 */
function guardAgainstStaleConnections(pool: Pool): void {
  const lastReleased = new WeakMap<PoolClient, number>();
  const acquire: () => Promise<PoolClient> = pool.connect.bind(pool);

  const isAlive = async (client: PoolClient): Promise<boolean> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        client.query("select 1"),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("health check timed out")), HEALTH_CHECK_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };

  const healthyClient = async (): Promise<PoolClient> => {
    for (let attempt = 1; ; attempt += 1) {
      const client = await acquire();
      const released = lastReleased.get(client);
      const idleLong = released !== undefined && Date.now() - released > RECHECK_AFTER_IDLE_MS;
      if (!idleLong || (await isAlive(client))) {
        const release = client.release.bind(client);
        client.release = (error?: Error | boolean) => {
          lastReleased.set(client, Date.now());
          client.release = release;
          release(error);
        };
        return client;
      }
      logger.warn("db.pool.stale_connection_discarded", { attempt });
      // Passing true destroys the connection instead of returning it to the pool.
      client.release(true);
      if (attempt >= SERVERLESS_POOL_SIZE + 1) return acquire();
    }
  };

  // Drizzle uses pool.query for single statements and pool.connect for transactions.
  const guarded = pool as unknown as {
    connect: () => Promise<PoolClient>;
    query: (...queryArguments: unknown[]) => Promise<unknown>;
  };
  guarded.connect = healthyClient;
  guarded.query = async (...queryArguments: unknown[]) => {
    const client = await healthyClient();
    try {
      return await (client.query as (...values: unknown[]) => Promise<unknown>)(...queryArguments);
    } finally {
      client.release();
    }
  };
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
