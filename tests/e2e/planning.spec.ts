import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, e2ePassword } from "./accounts";

/**
 * The planning simulator on the synthetic training scenario. The numbers
 * asserted here are not hard-coded expectations of specific values: the test
 * checks that results are produced by the engine, respond to a change in
 * crew availability, and stay internally consistent.
 */
async function metric(page: Page, row: string, column: 1 | 2): Promise<number> {
  const text = await page.getByTestId("plan-metrics").getByRole("row", { name: new RegExp(`^${row}`) }).getByRole("cell").nth(column - 1).innerText();
  return Number.parseFloat(text);
}

test("the planning simulator compares FIFO with the Civitas plan and reacts to losing a crew", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(E2E_ACCOUNTS.coordinator.email);
  await page.getByLabel("Password").fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto("/dashboard/planning");
  await expect(page.getByText("Synthetic training data", { exact: true })).toBeVisible();
  // The duplicate engine matched the second burst-pipe report to the first.
  await expect(page.getByText("Duplicate of T-01")).toBeVisible();

  await page.getByRole("button", { name: "Run FIFO baseline" }).click();
  await expect(page.getByTestId("plan-fifo")).toBeVisible();
  await page.getByRole("button", { name: "Run Civitas plan" }).click();
  await expect(page.getByTestId("plan-civitas")).toBeVisible();
  await expect(page.getByTestId("comparison-summary")).toBeVisible();

  const fifoAssigned = await metric(page, "Feasible assignments", 1);
  const civitasAssigned = await metric(page, "Feasible assignments", 2);
  const fifoWait = await metric(page, "Priority-weighted waiting time", 1);
  const civitasWait = await metric(page, "Priority-weighted waiting time", 2);
  // Eight plannable incidents (nine reports minus one confirmed duplicate).
  expect(fifoAssigned + (await metric(page, "Unassigned incidents", 1))).toBe(8);
  expect(civitasAssigned + (await metric(page, "Unassigned incidents", 2))).toBe(8);
  // With the same incidents assigned, the minimum-cost plan cannot be worse than FIFO on its own objective.
  if (civitasAssigned === fifoAssigned) expect(civitasWait).toBeLessThanOrEqual(fifoWait);

  // Remove a crew and recalculate.
  await page.getByLabel("Availability of Electrical Team").selectOption("unavailable");
  await expect(page.getByText("The inputs have changed since these results were calculated.")).toBeVisible();
  await page.getByRole("button", { name: "Run both and compare" }).click();
  await expect(page.getByText("The inputs have changed since these results were calculated.")).toHaveCount(0);

  const civitasAssignedAfter = await metric(page, "Feasible assignments", 2);
  const civitasUnassignedAfter = await metric(page, "Unassigned incidents", 2);
  expect(civitasAssignedAfter).toBeLessThan(civitasAssigned);
  expect(civitasAssignedAfter + civitasUnassignedAfter).toBe(8);
  await expect(page.getByTestId("plan-civitas").getByText("Every qualified crew is currently unavailable.").first()).toBeVisible();
});
