import { expect, test } from "@playwright/test";
import { E2E_LOCATION } from "./accounts";

/**
 * Checks that the interactive map itself loads, not just its fallback.
 * This needs network access to the public basemap service (OpenFreeMap).
 */
test("the report map loads and a click places the location marker", async ({ page }) => {
  await page.goto("/report");
  const map = page.getByRole("application", { name: /Map for selecting the incident location/ });
  await expect(map.locator("canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Loading map")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByText("The map could not be loaded")).toHaveCount(0);

  await map.click({ position: { x: 200, y: 150 } });
  await expect(page.getByText(/^Selected location: -?\d+\.\d+, -?\d+\.\d+/)).toBeVisible();
  const latitude = Number(await page.getByLabel("Latitude").inputValue());
  // The click landed somewhere in the default map view around Johannesburg.
  expect(Math.abs(latitude - E2E_LOCATION.latitude)).toBeLessThan(1);
  await expect(map.locator(".maplibregl-marker")).toHaveCount(1);
});
