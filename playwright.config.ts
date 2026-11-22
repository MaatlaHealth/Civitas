import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the production build (`npm run build` first)
 * with an isolated embedded database that is recreated on every run.
 *
 * Test account passwords and the session secret are generated per run and
 * passed through the environment; nothing is written to the repository.
 * Worker processes inherit these values from the main process.
 */
process.env.CIVITAS_E2E_PASSWORD ??= randomBytes(18).toString("base64url");
process.env.CIVITAS_E2E_AUTH_SECRET ??= randomBytes(32).toString("base64url");

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  // The journey tests share one database and build on each other's records.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx tests/e2e/seed.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      CIVITAS_ALLOW_EMBEDDED_DB: "true",
      CIVITAS_EMBEDDED_DB_DIR: ".data/e2e/pglite",
      CIVITAS_E2E_PASSWORD: process.env.CIVITAS_E2E_PASSWORD,
      AUTH_SECRET: process.env.CIVITAS_E2E_AUTH_SECRET,
      // Empty values override any local .env.local so the run never touches real services.
      DATABASE_URL: "",
      NETLIFY_DATABASE_URL: "",
      GEMINI_API_KEY: "",
    },
  },
});
