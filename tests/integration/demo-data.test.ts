import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { incidents, infrastructureAssets, maintenanceCrews } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { DEMO_ADDRESS, loadDemoData } from "@/lib/services/demo-data";
import { getPublicIncident } from "@/lib/services/tracking";
import { createCoordinator, startTestDatabase, stopTestDatabase } from "./helpers";

beforeAll(startTestDatabase);
afterAll(() => {
  delete process.env.CIVITAS_OPEN_ACCESS;
  stopTestDatabase();
});

describe("demonstration data", () => {
  it("is refused unless open evaluation access is on", async () => {
    const coordinator = await createCoordinator();
    const error = await loadDemoData(coordinator).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe("forbidden");
  });

  it("creates labelled records through the real services and is safe to run twice", async () => {
    process.env.CIVITAS_OPEN_ACCESS = "true";
    const coordinator = await createCoordinator();
    const first = await loadDemoData(coordinator);
    expect(first.reportsCreated).toBe(9);

    const db = await getDb();
    const demo = await db.select().from(incidents).where(eq(incidents.address, DEMO_ADDRESS));
    expect(demo).toHaveLength(9);
    expect(demo.every((incident) => incident.description.includes("not a real incident"))).toBe(true);
    const byTitle = (title: string) => demo.find((incident) => incident.title === title)!;
    // The engines, not the script, produced these outcomes.
    expect(byTitle("Water gushing out of the road").duplicateOfId).toBe(byTitle("Burst pipe flooding the road").id);
    expect(byTitle("Burst pipe flooding the road").status).toBe("assigned");
    expect(byTitle("Deep pothole in the left lane").status).toBe("in_progress");
    expect(byTitle("Streetlight out at the crossing").status).toBe("resolved");
    // The exposed cables, with confirmed critical severity and high exposure, rank highest.
    const cables = byTitle("Exposed cables at an open electrical box");
    expect(["critical", "high"]).toContain(cables.priorityBand);
    expect(Math.max(...demo.map((incident) => incident.priorityScore ?? 0))).toBe(cables.priorityScore);

    const crews = await db.select().from(maintenanceCrews);
    expect(crews.every((crew) => crew.name.startsWith("Demo "))).toBe(true);
    const assets = await db.select().from(infrastructureAssets);
    expect(assets.every((asset) => !asset.verified && asset.name.includes("not a real asset"))).toBe(true);

    const view = await getPublicIncident(first.trackable!.reference, first.trackable!.accessCode);
    expect(view.status).toBe("resolved");

    const second = await loadDemoData(coordinator);
    expect(second.reportsCreated).toBe(0);
    expect(await db.$count(incidents, eq(incidents.address, DEMO_ADDRESS))).toBe(9);
    expect(await db.$count(maintenanceCrews)).toBe(5);
  });
});
