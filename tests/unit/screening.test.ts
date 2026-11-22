import { describe, expect, it } from "vitest";
import type { AssetImportance, AssetType } from "@/lib/domain/types";
import {
  DEFAULT_SCREENING_CONFIG,
  SCREENING_CAVEAT,
  screenConsequences,
  type ScreeningAsset,
} from "@/lib/engines/screening";
import { eastOf, northOf, ORIGIN } from "./helpers/geo";

interface AssetOptions {
  id: string;
  assetType?: AssetType;
  metersNorth?: number;
  importance?: AssetImportance;
  verified?: boolean;
}

function asset(options: AssetOptions): ScreeningAsset {
  return {
    id: options.id,
    name: `Asset ${options.id}`,
    assetType: options.assetType ?? "hospital",
    importance: options.importance ?? "important",
    verified: options.verified ?? true,
    source: "Test registry",
    ...northOf(ORIGIN, options.metersNorth ?? 0),
  };
}

const leak = { ...ORIGIN, category: "water_leak" as const };

describe("screenConsequences", () => {
  it("uses a 300 m radius by default", () => {
    expect(DEFAULT_SCREENING_CONFIG.radiusMeters).toBe(300);
    expect(screenConsequences(leak, []).radiusMeters).toBe(300);
  });

  it("returns no findings when no assets are registered", () => {
    expect(screenConsequences(leak, []).findings).toEqual([]);
  });

  it("lists assets inside the radius and excludes those outside it", () => {
    const result = screenConsequences(leak, [
      asset({ id: "inside", metersNorth: 299 }),
      asset({ id: "outside", metersNorth: 301 }),
      asset({ id: "far", metersNorth: 5000 }),
    ]);
    expect(result.findings.map((finding) => finding.assetId)).toEqual(["inside"]);
  });

  it("sorts findings nearest first", () => {
    const result = screenConsequences(leak, [
      asset({ id: "c", metersNorth: 250 }),
      asset({ id: "a", metersNorth: 20 }),
      asset({ id: "b", metersNorth: -120 }),
    ]);
    expect(result.findings.map((finding) => finding.assetId)).toEqual(["a", "b", "c"]);
  });

  it("reports the straight-line distance rounded to 0.1 m", () => {
    const [finding] = screenConsequences(leak, [asset({ id: "a", metersNorth: 123.44 })]).findings;
    expect(finding?.distanceMeters).toBeCloseTo(123.4, 5);
    const [east] = screenConsequences(leak, [{ ...asset({ id: "e" }), ...eastOf(ORIGIN, 80) }]).findings;
    expect(east?.distanceMeters).toBeCloseTo(80, 0);
  });

  it("attaches a relevance note when a rule connects the category to the asset type", () => {
    const [finding] = screenConsequences(leak, [asset({ id: "h", assetType: "hospital", metersNorth: 50 })]).findings;
    expect(finding?.relevance).toBe("Health facilities depend on a continuous water supply.");
    expect(finding?.statement).toContain("Health facilities depend on a continuous water supply.");
  });

  it("still lists a nearby asset with no rule, with a null relevance", () => {
    const [finding] = screenConsequences(leak, [asset({ id: "s", assetType: "school", metersNorth: 50 })]).findings;
    expect(finding).toBeDefined();
    expect(finding?.relevance).toBeNull();
    expect(finding?.statement).toContain("No screening rule connects this incident category to this asset type.");
  });

  it("has no rules at all for the 'other' category", () => {
    const types: AssetType[] = ["hospital", "school", "substation", "bridge"];
    const result = screenConsequences(
      { ...ORIGIN, category: "other" },
      types.map((assetType, index) => asset({ id: `a${index}`, assetType, metersNorth: 10 * index })),
    );
    expect(result.findings).toHaveLength(4);
    expect(result.findings.every((finding) => finding.relevance === null)).toBe(true);
  });

  it("applies rules per category (a substation is relevant to flooding but not to a pothole)", () => {
    const substation = asset({ id: "sub", assetType: "substation", metersNorth: 40 });
    const flooding = screenConsequences({ ...ORIGIN, category: "flooding" }, [substation]).findings[0];
    const pothole = screenConsequences({ ...ORIGIN, category: "pothole" }, [substation]).findings[0];
    expect(flooding?.relevance).toMatch(/electrical hazard/);
    expect(pothole?.relevance).toBeNull();
  });

  it("never asserts an impact: every statement carries the verification caveat", () => {
    const result = screenConsequences(leak, [
      asset({ id: "a", metersNorth: 10 }),
      asset({ id: "b", assetType: "school", metersNorth: 20 }),
    ]);
    for (const finding of result.findings) {
      expect(finding.statement.endsWith(SCREENING_CAVEAT)).toBe(true);
    }
    expect(SCREENING_CAVEAT).toContain("Coordinator verification required");
  });

  it("states the distance, asset name, type and registry status", () => {
    const verified = screenConsequences(leak, [asset({ id: "v", metersNorth: 150, verified: true })]).findings[0];
    const unverified = screenConsequences(leak, [asset({ id: "u", metersNorth: 150, verified: false })]).findings[0];
    expect(verified?.statement).toContain("The incident is 150 m (straight line) from Asset v (hospital, verified registry entry).");
    expect(unverified?.statement).toContain("(hospital, unverified registry entry)");
    expect(unverified?.verified).toBe(false);
  });

  it("passes asset attributes through unchanged", () => {
    const [finding] = screenConsequences(leak, [
      asset({ id: "p", assetType: "water_pumping_station", importance: "critical", verified: false, metersNorth: 5 }),
    ]).findings;
    expect(finding).toMatchObject({
      assetId: "p",
      assetName: "Asset p",
      assetType: "water_pumping_station",
      importance: "critical",
      verified: false,
      source: "Test registry",
    });
  });

  it("honours a custom radius", () => {
    const assets = [asset({ id: "a", metersNorth: 80 }), asset({ id: "b", metersNorth: 450 })];
    expect(screenConsequences(leak, assets, { radiusMeters: 50 }).findings).toEqual([]);
    const wide = screenConsequences(leak, assets, { radiusMeters: 500 });
    expect(wide.radiusMeters).toBe(500);
    expect(wide.findings.map((finding) => finding.assetId)).toEqual(["a", "b"]);
  });

  it("does not mutate the input list", () => {
    const assets = [asset({ id: "far", metersNorth: 200 }), asset({ id: "near", metersNorth: 10 })];
    screenConsequences(leak, assets);
    expect(assets.map((item) => item.id)).toEqual(["far", "near"]);
  });
});
