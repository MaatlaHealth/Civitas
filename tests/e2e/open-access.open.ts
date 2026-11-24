import { expect, test } from "@playwright/test";
import { E2E_CREWS } from "./accounts";

/**
 * Name-only sign-in, which only exists when CIVITAS_OPEN_ACCESS=true.
 * Run with: CIVITAS_E2E_OPEN_ACCESS=1 npx playwright test
 */
test("a visitor signs in with just a name as coordinator, then as a crew member", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Anyone can open these workspaces")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByLabel("Your name").fill("Judge Naledi");
  await page.getByRole("button", { name: "Continue as coordinator" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("Judge Naledi")).toBeVisible();
  await expect(page.getByText("Demo account")).toBeVisible();
  await expect(page.getByText("please use made-up details")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Your name").fill("Judge Sipho");
  await page.getByLabel(/Crew to join/).selectOption({ label: E2E_CREWS.water });
  await page.getByRole("button", { name: "Continue as crew member" }).click();
  await page.waitForURL(/\/crew/);
  await expect(page.getByRole("heading", { name: "My assignments" })).toBeVisible();
  // A crew member still cannot open coordinator pages.
  await page.goto("/dashboard");
  await page.waitForURL(/\/crew$/);
});
