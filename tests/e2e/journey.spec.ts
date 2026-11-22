import { expect, test, type Page } from "@playwright/test";
import { E2E_ACCOUNTS, E2E_CREWS, E2E_LOCATION, e2ePassword } from "./accounts";

/**
 * The complete journey through the real interface and the real backend:
 * citizen report -> tracking -> coordinator review -> duplicate analysis ->
 * priority -> crew assignment -> crew work -> coordinator closure -> citizen
 * sees the result. Nothing is stubbed. AI analysis is not configured in this
 * run, which also exercises the "AI unavailable" path.
 */
test.describe.configure({ mode: "serial" });

interface Receipt {
  reference: string;
  accessCode: string;
}

let firstReport: Receipt;
let secondReport: Receipt;

async function submitReport(page: Page, details: { title: string; description: string; northOffset: number }): Promise<Receipt> {
  await page.goto("/report");
  await page.getByLabel("Category").selectOption("water_leak");
  await expect(page.getByText("This type of problem can be dangerous")).toBeVisible();
  await page.getByLabel("Short title").fill(details.title);
  await page.getByLabel("Description").fill(details.description);
  await page.getByLabel("Is a road or walkway blocked?").selectOption("yes");
  // The typed coordinate fields are the keyboard-accessible alternative to clicking the map.
  await page.getByLabel("Latitude").fill(String(E2E_LOCATION.latitude + details.northOffset));
  await page.getByLabel("Longitude").fill(String(E2E_LOCATION.longitude));
  await page.getByLabel(/Report anonymously/).check();
  await page.getByLabel(/I have read the/).check();
  await page.getByRole("button", { name: "Submit report" }).click();

  await expect(page.getByTestId("report-confirmation")).toBeVisible();
  const reference = (await page.getByTestId("reference").innerText()).trim();
  const accessCode = (await page.getByTestId("access-code").getAttribute("data-code")) ?? "";
  expect(reference).toMatch(/^CIV-[0-9A-Z]{8}$/);
  expect(accessCode).toMatch(/^[0-9A-Z]{20}$/);
  return { reference, accessCode };
}

async function track(page: Page, receipt: Receipt) {
  await page.goto("/track");
  await page.getByLabel("Reference").fill(receipt.reference);
  await page.getByLabel("Access code").fill(receipt.accessCode);
  await page.getByRole("button", { name: "View progress" }).click();
  await expect(page.getByTestId("tracking-result")).toBeVisible();
}

async function signIn(page: Page, account: { email: string }) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(e2ePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(dashboard|crew)/);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
}

async function openIncident(page: Page, reference: string) {
  await page.goto(`/dashboard/incidents?q=${reference}`);
  await page.getByRole("link", { name: `Open ${reference}` }).click();
  await page.waitForURL(/\/dashboard\/incidents\/[0-9a-f-]{36}/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

test("form validation rejects an incomplete report with helpful messages", async ({ page }) => {
  await page.goto("/report");
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("Select the incident location before submitting.")).toBeVisible();

  await page.getByLabel("Latitude").fill(String(E2E_LOCATION.latitude));
  await page.getByLabel("Longitude").fill(String(E2E_LOCATION.longitude));
  await page.getByRole("button", { name: "Submit report" }).click();
  await expect(page.getByText("The report was not submitted")).toBeVisible();
  await expect(page.getByText("Choose an incident category.").first()).toBeVisible();
});

test("a citizen submits a report, it persists, and tracking shows it awaiting review", async ({ page }) => {
  firstReport = await submitReport(page, {
    title: "Burst pipe flooding the road",
    description: "Water is gushing from a burst pipe and running across both lanes of the road.",
    northOffset: 0,
  });
  await track(page, firstReport);
  await expect(page.getByTestId("tracking-status")).toHaveText("Awaiting review");
  await expect(page.getByText("waiting to be reviewed by a coordinator")).toBeVisible();
});

test("tracking refuses a wrong access code without revealing whether the reference exists", async ({ page }) => {
  await page.goto("/track");
  await page.getByLabel("Reference").fill(firstReport.reference);
  await page.getByLabel("Access code").fill("0".repeat(20));
  await page.getByRole("button", { name: "View progress" }).click();
  await expect(page.getByText("No report matches that reference and access code.")).toBeVisible();
  await expect(page.getByTestId("tracking-result")).toHaveCount(0);
});

test("a second nearby report is raised as a possible duplicate", async ({ page }) => {
  secondReport = await submitReport(page, {
    title: "Water gushing out of the road",
    description: "Water is gushing strongly from a burst pipe in the road and running across both lanes.",
    // About 30 metres north of the first report.
    northOffset: 0.00027,
  });
  expect(secondReport.reference).not.toBe(firstReport.reference);
});

test("staff pages and data require the right role", async ({ page, request }) => {
  await page.goto("/dashboard");
  await page.waitForURL(/\/login/);
  expect((await request.get("/api/export/incidents")).status()).toBe(401);

  await signIn(page, E2E_ACCOUNTS.crew);
  await page.waitForURL(/\/crew/);
  await page.goto("/dashboard/incidents");
  await page.waitForURL(/\/crew$/);
  expect((await page.request.get("/api/export/incidents")).status()).toBe(403);
  await signOut(page);
});

test("the coordinator reviews the report, confirms the duplicate, verifies and assigns a crew", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.coordinator);
  await expect(page.getByRole("heading", { name: "Operations overview" })).toBeVisible();
  await expect(page.getByText("Evaluation account")).toBeVisible();

  await openIncident(page, firstReport.reference);
  // Priority was calculated by the rule engine at intake and is explained.
  await expect(page.getByTestId("priority-explanation")).toContainText(/priority \(score \d\.\d\d\)/i);
  await expect(page.getByText("AI analysis is not configured for this deployment")).toBeVisible();

  // Duplicate analysis found the second report; confirm it.
  const candidate = page.getByRole("article", { name: /Possible duplicate/ });
  await expect(candidate).toContainText(secondReport.reference);
  await expect(candidate).toContainText("apart (straight line)");
  await candidate.getByRole("button", { name: "Confirm same incident" }).click();
  await expect(candidate.getByText("Confirmed match", { exact: true })).toBeVisible();
  await expect(page.getByTestId("priority-explanation")).toContainText("1 confirmed matching report");

  // Verify, then assign the recommended crew.
  await page.getByRole("button", { name: "Verify the report" }).click();
  await expect(page.getByRole("button", { name: `Assign ${E2E_CREWS.water}` })).toBeVisible();
  await expect(page.getByText("Not qualified for this incident category.")).toBeVisible();
  await page.getByRole("button", { name: `Assign ${E2E_CREWS.water}` }).click();
  await expect(page.getByText("Assigned (awaiting crew response)").first()).toBeVisible();
  await signOut(page);
});

test("the citizen sees that a crew has been assigned", async ({ page }) => {
  await track(page, firstReport);
  await expect(page.getByTestId("tracking-status")).toHaveText("Assigned");
});

test("a member of another crew cannot see the job", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.otherCrew);
  await expect(page.getByText("No assignments yet")).toBeVisible();
  await signOut(page);
});

test("the crew accepts, works on and completes the job", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.crew);
  await page.getByRole("link", { name: /Burst pipe flooding the road/ }).click();
  await page.getByRole("button", { name: "Accept assignment" }).click();
  await page.getByRole("button", { name: "Start work" }).click();
  await page.getByLabel("Add a field note").fill("Isolated the main at the valve before excavating.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Isolated the main at the valve before excavating.")).toBeVisible();
  await page.getByLabel(/Completion notes/).fill("Replaced the failed coupling and reinstated the road surface.");
  await page.getByRole("button", { name: "Mark work complete" }).click();
  await expect(page.getByText("Waiting for coordinator verification")).toBeVisible();
  await signOut(page);
});

test("the coordinator verifies the work, publishes an update and closes the incident", async ({ page }) => {
  await signIn(page, E2E_ACCOUNTS.coordinator);
  await openIncident(page, firstReport.reference);
  await expect(page.getByText("Replaced the failed coupling and reinstated the road surface.").first()).toBeVisible();
  await page.getByRole("button", { name: "Verify completion and resolve incident" }).click();
  await expect(page.getByRole("button", { name: "Close the incident" })).toBeVisible();

  await page.getByLabel("Publish an update to the reporter").fill("The burst pipe has been repaired and the road has reopened.");
  await page.getByRole("button", { name: "Publish update" }).click();
  await expect(page.getByText("Update published.")).toBeVisible();

  await page.getByRole("button", { name: "Close the incident" }).click();
  await expect(page.getByText("This incident is closed. No further changes are possible.")).toBeVisible();

  // The audit trail recorded the whole history.
  for (const action of ["incident.submitted", "duplicate.confirmed", "assignment.assigned", "assignment.completion_verified"]) {
    await expect(page.getByRole("cell", { name: action, exact: true }).first()).toBeVisible();
  }
  await signOut(page);
});

test("the citizen sees the closed status, the full timeline and the public update only", async ({ page }) => {
  await track(page, firstReport);
  await expect(page.getByTestId("tracking-status")).toHaveText("Closed");
  const result = page.getByTestId("tracking-result");
  await expect(result).toContainText("The burst pipe has been repaired and the road has reopened.");
  for (const stage of ["Submitted", "Awaiting review", "Verified", "Assigned", "In progress", "Resolved", "Closed"]) {
    await expect(result.getByText(stage, { exact: true }).first()).toBeVisible();
  }
  // Internal crew notes never reach the public page.
  await expect(result).not.toContainText("coupling");
  await expect(result).not.toContainText("Isolated the main");
});
