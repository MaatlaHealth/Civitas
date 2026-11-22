/**
 * MapLibre GL JS 6 loads its rendering worker from a separate file. This
 * copies that file from the installed package into /public so the browser
 * can fetch it from the site's own origin. It runs automatically before
 * `npm run dev` and `npm run build`, so the worker always matches the
 * installed MapLibre version; the copy is not committed.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";

const SOURCE_DIRECTORY = path.join("node_modules", "maplibre-gl", "dist");
const TARGET_DIRECTORY = path.join("public", "vendor", "maplibre");
const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(TARGET_DIRECTORY, { recursive: true });
for (const file of FILES) {
  const source = path.join(SOURCE_DIRECTORY, file);
  await stat(source);
  await copyFile(source, path.join(TARGET_DIRECTORY, file));
}
console.log(`Copied MapLibre worker to ${TARGET_DIRECTORY}.`);
