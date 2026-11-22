import { defineConfig } from "drizzle-kit";

// Used only to generate SQL migrations from the schema (`npm run db:generate`).
// Migrations are applied by scripts/migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
