import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { E2E_ACCOUNTS, e2ePassword } from "./accounts";

/** A coordinator adds a colleague on the Team page, and that person can then sign in. */
test("a coordinator adds a person who can then sign in, and setup stays closed", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByText("Setup is already complete")).toBeVisible();

  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_ACCOUNTS.coordinator.email);
  await page.getByLabel("Password").fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);

  const password = randomBytes(12).toString("base64url");
  await page.goto("/dashboard/team");
  await page.getByLabel("Name", { exact: true }).fill("New Coordinator");
  // A deliberately short password first: the form must keep what was typed.
  await page.getByLabel("Email address").fill("new-coordinator@e2e.civitas.test");
  await page.locator("#new-password").fill("short");
  await page.getByLabel("Role").selectOption("coordinator");
  await page.locator("#new-password").evaluate((input: HTMLInputElement) => input.removeAttribute("minlength"));
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("Use a password of at least 12 characters.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("New Coordinator");

  await page.locator("#new-password").fill(password);
  await page.getByRole("button", { name: "Add person" }).click();
  await expect(page.getByText("Account created.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "new-coordinator@e2e.civitas.test" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email address").fill("new-coordinator@e2e.civitas.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText("New Coordinator")).toBeVisible();
});
