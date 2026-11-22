/**
 * Records a silent walkthrough video of a running Civitas site.
 *
 *   node scripts/record-demo.mjs https://your-site.example
 *
 * The site must have open evaluation access on (CIVITAS_OPEN_ACCESS=true).
 * The script drives the real interface: it submits one made-up report and
 * takes it through review, assignment, crew work and closure. If no demo
 * crews exist it first uses the "Load demonstration data" button.
 *
 * Output: demo-video/civitas-demo.webm and demo-video/scenes.json (the start
 * time of each scene, for writing a voice-over).
 */
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = (process.argv[2] ?? "http://localhost:3200").replace(/\/$/, "");
const OUTPUT_DIRECTORY = "demo-video";
const VIEWPORT = { width: 1280, height: 720 };
const TYPING_DELAY_MS = 28;
const REPORT_TITLE = "Storm drain blocked at the taxi rank";
const CREW_NAME = "Demo Drainage Team";

const scenes = [];
let frame = 0;
let startedAt = 0;
const scene = (name) => {
  scenes.push({ name, startsAtSeconds: Math.round((Date.now() - startedAt) / 100) / 10 });
  console.log(`${scenes.at(-1).startsAtSeconds}s  ${name}`);
};

/** Draws a visible pointer, since recorded video does not include the mouse cursor. */
const CURSOR_SCRIPT = `
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;border-radius:50%;background:rgba(245,154,19,.55);border:2px solid #082d52;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:left .25s ease,top .25s ease";
    document.body.appendChild(dot);
    window.addEventListener("mousemove", (event) => { dot.style.left = event.clientX + "px"; dot.style.top = event.clientY + "px"; }, true);
  });
`;

async function main() {
  await rm(OUTPUT_DIRECTORY, { recursive: true, force: true });
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  const browser = await chromium.launch();

  // Off-camera setup: make sure the demo crews exist before recording starts.
  const setup = await browser.newContext({ viewport: VIEWPORT });
  const setupPage = await setup.newPage();
  await setupPage.goto(`${BASE_URL}/login`);
  await setupPage.getByLabel("Your name").fill("Recording setup");
  await setupPage.getByRole("button", { name: "Continue as coordinator" }).click();
  await setupPage.waitForURL(/\/dashboard/);
  await setupPage.goto(`${BASE_URL}/dashboard/crews`);
  if ((await setupPage.getByText("Demo Water Team").count()) === 0) {
    await setupPage.goto(`${BASE_URL}/dashboard`);
    await setupPage.getByRole("button", { name: "Load demonstration data" }).click();
    await setupPage.getByText(/Loaded \d+ demonstration reports|already loaded/).waitFor({ timeout: 120_000 });
  }
  await setup.close();

  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir: OUTPUT_DIRECTORY, size: VIEWPORT } });
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  startedAt = Date.now();
  try {
    await record(page);
  } catch (error) {
    await page.screenshot({ path: path.join(OUTPUT_DIRECTORY, "error.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }

  const recorded = (await readdir(OUTPUT_DIRECTORY)).find((file) => file.endsWith(".webm"));
  if (!recorded) throw new Error("No video file was produced.");
  await rename(path.join(OUTPUT_DIRECTORY, recorded), path.join(OUTPUT_DIRECTORY, "civitas-demo.webm"));
  await writeFile(path.join(OUTPUT_DIRECTORY, "scenes.json"), JSON.stringify({ site: BASE_URL, scenes }, null, 2));
  console.log(`Saved ${OUTPUT_DIRECTORY}/civitas-demo.webm`);
}

async function record(page) {
  const pause = (ms) => page.waitForTimeout(ms);
  const type = (locator, text) => locator.pressSequentially(text, { delay: TYPING_DELAY_MS });
  const click = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    await locator.hover();
    await pause(350);
    await locator.click();
  };
  /** Scrolls so the element sits near the top of the screen, then holds. */
  const show = async (locator, holdMs = 2500) => {
    await locator.first().evaluate((element) => {
      window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
    });
    await pause(900 + holdMs);
    // A still of each held shot, for checking the take without playing the video.
    frame += 1;
    await page.screenshot({ path: path.join(OUTPUT_DIRECTORY, "frames", `${String(frame).padStart(2, "0")}.jpg`), type: "jpeg", quality: 60 });
  };
  const scrollBy = async (pixels, holdMs = 1500) => {
    await page.evaluate((amount) => window.scrollBy({ top: amount, behavior: "smooth" }), pixels);
    await pause(700 + holdMs);
  };
  const signIn = async (name, role, crewName) => {
    await page.goto(`${BASE_URL}/login`);
    await type(page.getByLabel("Your name"), name);
    if (crewName) await page.getByLabel(/Crew to join/).selectOption({ label: crewName });
    await click(page.getByRole("button", { name: role === "crew" ? "Continue as crew member" : "Continue as coordinator" }));
    await page.waitForURL(role === "crew" ? /\/crew/ : /\/dashboard/);
  };
  const signOut = async () => {
    await click(page.getByRole("button", { name: "Sign out" }));
    await page.waitForURL(/\/login/);
  };
  const openIncident = async (reference) => {
    await page.goto(`${BASE_URL}/dashboard/incidents`);
    await type(page.getByLabel("Search reference, title or address"), reference);
    await click(page.getByRole("button", { name: "Apply filters" }));
    await click(page.getByRole("link", { name: `Open ${reference}` }));
    await page.waitForURL(/\/dashboard\/incidents\/[0-9a-f-]{36}/);
    await pause(1200);
  };

  // ----- 1. Home -----
  await page.goto(BASE_URL);
  scene("1 Home page");
  await pause(4500);
  await show(page.getByRole("heading", { name: "Why a pothole can take months to fix" }), 4500);
  await show(page.getByRole("heading", { name: "What happens to a report" }), 4000);

  // ----- 2. Citizen report -----
  await page.goto(`${BASE_URL}/report`);
  scene("2 Citizen reports an incident");
  await pause(1500);
  await page.getByLabel("Category").selectOption("blocked_drain");
  await pause(1800);
  await type(page.getByLabel("Short title"), REPORT_TITLE);
  await type(page.getByLabel("Description"), "The storm drain next to the taxi rank is blocked and dirty water is spreading across the road.");
  await page.getByLabel("Is a road or walkway blocked?").selectOption("yes");
  await pause(600);

  scene("3 Address suggestions and map");
  const address = page.getByRole("combobox", { name: "Street address or place name" });
  await address.scrollIntoViewIfNeeded();
  await type(address, "Rissik Street Johannesburg");
  const suggestion = page.getByRole("listbox", { name: "Address suggestions" }).getByRole("option").first();
  await suggestion.waitFor();
  await pause(1800);
  await suggestion.click();
  await show(page.getByRole("application", { name: /Map for selecting/ }), 3500);

  await click(page.getByLabel(/Report anonymously/));
  await click(page.getByLabel(/I have read the/));
  await pause(600);
  await click(page.getByRole("button", { name: "Submit report" }));
  await page.getByTestId("report-confirmation").waitFor();
  scene("4 Confirmation and tracking");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  const reference = (await page.getByTestId("reference").innerText()).trim();
  await pause(4500);
  await click(page.getByRole("link", { name: "Track this report" }));
  await page.getByTestId("tracking-result").waitFor();
  await show(page.getByTestId("tracking-result"), 4000);
  const trackingCode = await page.getByLabel("Access code").inputValue();

  // ----- 3. Coordinator -----
  await signIn("Thandi", "coordinator");
  scene("5 Coordinator overview");
  await pause(5000);

  await openIncident(reference);
  scene("6 Incident record: interpretation and priority");
  await pause(2500);
  await show(page.getByRole("heading", { name: "Interpretation" }), 3500);
  await show(page.getByRole("heading", { name: "Priority", exact: true }), 6500);
  await show(page.getByRole("heading", { name: "Consequence screening" }), 3500);

  scene("7 Duplicate detection");
  await page.goto(`${BASE_URL}/dashboard/duplicates?status=confirmed`);
  await pause(2500);
  const calculation = page.getByText("How the score was calculated").first();
  if (await calculation.count()) {
    await click(calculation);
    await show(calculation, 4500);
  }

  await openIncident(reference);
  scene("8 Verify and assign a crew");
  await click(page.getByRole("button", { name: "Verify the report" }));
  await page.getByRole("button", { name: `Assign ${CREW_NAME}` }).waitFor();
  await show(page.getByRole("heading", { name: "Crew assignment" }), 5500);
  await click(page.getByRole("button", { name: `Assign ${CREW_NAME}` }));
  await page.getByText("Assigned (awaiting crew response)").first().waitFor();
  await pause(2500);
  await signOut();

  // ----- 4. Crew -----
  await signIn("Sipho", "crew", CREW_NAME);
  scene("9 Crew does the job");
  await pause(2500);
  await click(page.getByRole("link", { name: new RegExp(REPORT_TITLE) }));
  await pause(2500);
  await click(page.getByRole("button", { name: "Accept assignment" }));
  await click(page.getByRole("button", { name: "Start work" }));
  const notes = page.getByLabel(/Completion notes/);
  await notes.scrollIntoViewIfNeeded();
  await type(notes, "Cleared the blockage and flushed the drain. Water is draining normally.");
  await click(page.getByRole("button", { name: "Mark work complete" }));
  await page.getByText("Waiting for coordinator verification").waitFor();
  await pause(2500);
  await signOut();

  // ----- 5. Coordinator closes -----
  await signIn("Thandi", "coordinator");
  await openIncident(reference);
  scene("10 Coordinator verifies and closes");
  await click(page.getByRole("button", { name: "Verify completion and resolve incident" }));
  await page.getByRole("button", { name: "Close the incident" }).waitFor();
  const update = page.getByLabel("Publish an update to the reporter");
  await update.scrollIntoViewIfNeeded();
  await type(update, "The drain has been cleared and the road is open again.");
  await click(page.getByRole("button", { name: "Publish update" }));
  await page.getByText("Update published.").waitFor();
  await click(page.getByRole("button", { name: "Close the incident" }));
  await page.getByText("This incident is closed.").waitFor();
  await show(page.getByRole("heading", { name: "Audit trail" }), 4000);

  // ----- 6. Planning -----
  await page.goto(`${BASE_URL}/dashboard/planning`);
  scene("11 Planning comparison");
  await pause(4500);
  await click(page.getByRole("button", { name: "Run both and compare" }));
  await show(page.getByTestId("plan-metrics"), 8000);
  scene("12 Losing a crew");
  const availability = page.getByLabel("Availability of Electrical Team");
  await show(availability, 800);
  await availability.selectOption("unavailable");
  await pause(1500);
  await click(page.getByRole("button", { name: "Run both and compare" }));
  await show(page.getByTestId("plan-metrics"), 6500);

  // ----- 7. Map -----
  await page.goto(`${BASE_URL}/dashboard/map`);
  scene("13 Operations map");
  await page.locator(".maplibregl-canvas").waitFor();
  await pause(6500);
  await signOut();

  // ----- 8. Citizen sees the result -----
  await page.goto(`${BASE_URL}/track`);
  scene("14 Citizen sees the outcome");
  await page.getByLabel("Reference").fill(reference);
  await page.getByLabel("Access code").fill(trackingCode);
  await click(page.getByRole("button", { name: "View progress" }));
  await page.getByTestId("tracking-result").waitFor();
  await show(page.getByTestId("tracking-result"), 3000);
  await scrollBy(320, 4500);
  scene("15 End");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
