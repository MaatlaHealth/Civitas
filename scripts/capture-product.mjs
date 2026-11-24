/**
 * Captures the product screenshots used on the public site from a running
 * Civitas instance, so the marketing pages always show the real interface.
 *
 *   node scripts/capture-product.mjs http://localhost:3200
 *
 * The instance must have name-only demo sign-in on (CIVITAS_OPEN_ACCESS=true).
 * Demonstration data is loaded if it is not there yet. Output goes to
 * public/product/, plus full-page review shots in demo-video/review/.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = (process.argv[2] ?? "http://localhost:3200").replace(/\/$/, "");
const PRODUCT_DIRECTORY = "public/product";
const REVIEW_DIRECTORY = "demo-video/review";

await mkdir(PRODUCT_DIRECTORY, { recursive: true });
await mkdir(REVIEW_DIRECTORY, { recursive: true });

const browser = await chromium.launch();
// A narrower window gives product panels a shape that reads well beside text.
const context = await browser.newContext({ viewport: { width: 1180, height: 1000 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.setDefaultTimeout(60_000);

const shot = async (locator, name) => {
  await locator.first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await locator.first().screenshot({ path: `${PRODUCT_DIRECTORY}/${name}.png` });
  console.log("product", name);
};
const review = async (path, name, viewport = { width: 1440, height: 1000 }) => {
  await page.setViewportSize(viewport);
  await page.goto(BASE_URL + path);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${REVIEW_DIRECTORY}/${name}.jpg`, type: "jpeg", quality: 70, fullPage: true });
  console.log("review", name);
};

await page.goto(`${BASE_URL}/login`);
await page.getByLabel("Your name").fill("Thandi Mokoena");
await page.getByRole("button", { name: "Continue as coordinator" }).click();
await page.waitForURL(/\/dashboard/);
await page.goto(`${BASE_URL}/dashboard/crews`);
if ((await page.getByText("Demo Water Team").count()) === 0) {
  await page.goto(`${BASE_URL}/dashboard`);
  await page.getByRole("button", { name: "Load demonstration data" }).click();
  await page.getByText(/Loaded \d+ demonstration reports|already loaded/).waitFor({ timeout: 120_000 });
}

await page.goto(`${BASE_URL}/dashboard/duplicates?status=confirmed`);
await shot(page.getByRole("article", { name: /Possible duplicate/ }), "duplicate");

await page.goto(`${BASE_URL}/dashboard/incidents?q=Burst+pipe`);
await page.getByRole("link", { name: /^Open CIV-/ }).first().click();
await page.waitForURL(/incidents\/[0-9a-f-]{36}/);
await shot(page.locator("section").filter({ has: page.getByRole("heading", { name: "Priority", exact: true }) }), "priority");

await page.goto(`${BASE_URL}/dashboard/planning`);
await page.getByRole("button", { name: "Run both and compare" }).click();
await shot(page.getByTestId("plan-metrics"), "planning");

await page.goto(`${BASE_URL}/dashboard/map`);
await page.locator(".maplibregl-canvas").waitFor();
await page.waitForTimeout(6000);
await shot(page.locator(".maplibregl-map").locator(".."), "map");

await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForURL(/\/login/);

await review("/", "home");
await review("/login", "login");
await review("/how-it-works", "how-it-works");
await review("/", "home-mobile", { width: 390, height: 844 });
await browser.close();
