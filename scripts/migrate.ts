/**
 * Applies pending SQL migrations from ./drizzle.
 *
 *   npm run db:migrate
 *
 * With DATABASE_URL (or Netlify's NETLIFY_DATABASE_URL) set, migrates that
 * PostgreSQL database. Without one, migrates the embedded development
 * database in ./.data. During a production build with no database URL the
 * step is skipped with a warning so the cause is visible in the build log.
 */
import path from "node:path";
import { loadLocalEnvironment } from "./env";

loadLocalEnvironment();

async function main(): Promise<void> {
  const { connectEmbedded, databaseUrl } = await import("../src/lib/db/client");
  const url = databaseUrl();

  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
      console.log("Migrations applied to the configured PostgreSQL database.");
    } finally {
      await pool.end();
    }
    return;
  }

  if (process.env.NETLIFY || process.env.NODE_ENV === "production") {
    console.warn(
      "WARNING: no DATABASE_URL or NETLIFY_DATABASE_URL is set, so migrations were skipped. " +
        "The deployed application will report that the database is unavailable until one is configured.",
    );
    return;
  }

  const directory = process.env.CIVITAS_EMBEDDED_DB_DIR || path.join(process.cwd(), ".data", "pglite");
  await connectEmbedded(directory);
  console.log(`Migrations applied to the embedded development database at ${directory}.`);
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error("Migration failed:", error);
    process.exit(1);
  },
);
