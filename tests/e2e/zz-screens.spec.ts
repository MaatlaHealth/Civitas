import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, e2ePassword } from "./accounts";

/**
 * Captures screenshots of the running application and checks that no page
 * overflows horizontally on a phone-sized screen. It runs last (file name
 * order) so the dashboard pages show the records created by the journey.
 *
 * Screenshots are written to docs/screenshots only when CIVITAS_CAPTURE=1.
 */
const CAPTURE = process.env.CIVITAS_CAPTURE === "1";
const MOBILE = { width: 360, height: 740 };
const DESKTOP = { width: 1366, height: 900 };

async function capture(page: Page, name: string) {
  if (CAPTURE) await page.screenshot({ path: `docs/screenshots/${name}.png`, fullPage: true });
}

async function expectNoHorizontalOverflow(page: Page, path: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${path} overflows horizontally by ${overflow}px at ${MOBILE.width}px wide`).toBeLessThanOrEqual(0);
}

const PUBLIC_PAGES = ["/", "/report", "/track", "/how-it-works", "/transparency", "/privacy", "/login"];
const DASHBOARD_PAGES = [
  "/dashboard",
  "/dashboard/incidents",
  "/dashboard/map",
  "/dashboard/duplicates?status=confirmed",
  "/dashboard/crews",
  "/dashboard/planning",
  "/dashboard/analytics",
  "/dashboard/assets",
];

const slug = (path: string) => path.replace(/^\//, "").replace(/[/?=]/g, "-") || "home";

test("public pages render on desktop and do not overflow on mobile", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.setViewportSize(DESKTOP);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await capture(page, `public-${slug(path)}`);
    await page.setViewportSize(MOBILE);
    await page.goto(path);
    await expectNoHorizontalOverflow(page, path);
  }
  await capture(page, "public-login-mobile");
});

test("coordinator pages render on desktop and do not overflow on mobile", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_ACCOUNTS.coordinator.email);
  await page.getByLabel("Password").fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);

  for (const path of DASHBOARD_PAGES) {
    await page.setViewportSize(DESKTOP);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (path === "/dashboard/map") await page.waitForTimeout(2500);
    if (path === "/dashboard/planning") await page.getByRole("button", { name: "Run both and compare" }).click();
    await capture(page, `dashboard-${slug(path)}`);
    await page.setViewportSize(MOBILE);
    await page.goto(path);
    await expectNoHorizontalOverflow(page, path);
  }

  await page.setViewportSize(DESKTOP);
  await page.goto("/dashboard/incidents");
  await page.getByRole("link", { name: /^Open CIV-/ }).last().click();
  await page.waitForURL(/\/dashboard\/incidents\/[0-9a-f-]{36}/);
  await page.waitForTimeout(2000);
  await capture(page, "dashboard-incident-detail");
  await page.setViewportSize(MOBILE);
  await page.reload();
  await expectNoHorizontalOverflow(page, "incident detail");
});
