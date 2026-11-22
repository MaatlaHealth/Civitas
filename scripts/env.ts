import { existsSync } from "node:fs";

/** Loads .env.local then .env for command-line scripts (Next.js does this itself). */
export function loadLocalEnvironment(): void {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
