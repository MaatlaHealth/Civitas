import { describe, expect, it } from "vitest";
import {
  bandForScore,
  computePriority,
  DEFAULT_PRIORITY_CONFIG,
  type PriorityConfig,
  type PriorityFactorKey,
  type PriorityInput,
  type PriorityResult,
} from "@/lib/engines/priority";
import type { ScreeningFinding, ScreeningResult } from "@/lib/engines/screening";

const NO_ASSETS: ScreeningResult = { radiusMeters: 300, findings: [] };

function finding(overrides: Partial<ScreeningFinding> = {}): ScreeningFinding {
  return {
    assetId: "asset-1",
    assetName: "Central Hospital",
    assetType: "hospital",
    importance: "critical",
    verified: true,
    source: "Test registry",
    distanceMeters: 150,
    relevance: "Health facilities depend on a continuous water supply.",
    statement: "statement",
    ...overrides,
  };
}

function input(overrides: Partial<PriorityInput> = {}): PriorityInput {
  return {
    category: "pothole",
    confirmedSeverity: null,
    exposureLevel: null,
    obstructsAccess: null,
    reportedDuration: "unknown",
    hoursOpen: 0,
    coordinatorVerified: false,
    hasPhotograph: false,
    confirmedDuplicateCount: 0,
    screening: NO_ASSETS,
    ...overrides,
  };
}

function factorValue(result: PriorityResult, key: PriorityFactorKey): number | null {
  const factor = result.factors.find((item) => item.key === key);
  if (!factor) throw new Error(`factor ${key} missing`);
  return factor.value;
}

describe("bandForScore", () => {
  it("maps scores to bands at the documented thresholds (inclusive)", () => {
    expect(bandForScore(1)).toBe("critical");
    expect(bandForScore(0.75)).toBe("critical");
    expect(bandForScore(0.749)).toBe("high");
    expect(bandForScore(0.55)).toBe("high");
    expect(bandForScore(0.549)).toBe("moderate");
    expect(bandForScore(0.35)).toBe("moderate");
    expect(bandForScore(0.349)).toBe("low");
    expect(bandForScore(0)).toBe("low");
  });

  it("never returns awaiting_review for a numeric score", () => {
    for (let score = 0; score <= 1; score += 0.05) {
      expect(bandForScore(score)).not.toBe("awaiting_review");
    }
  });

  it("honours custom thresholds", () => {
    const config: PriorityConfig = { ...DEFAULT_PRIORITY_CONFIG, bandThresholds: { critical: 0.9, high: 0.6, moderate: 0.2 } };
    expect(bandForScore(0.8, config)).toBe("high");
    expect(bandForScore(0.25, config)).toBe("moderate");
    expect(bandForScore(0.19, config)).toBe("low");
  });
});

describe("computePriority", () => {
  it("uses weights that sum to 1 by default", () => {
    const { hazard, impact, exposure, urgency, evidence } = DEFAULT_PRIORITY_CONFIG.weights;
    expect(hazard + impact + exposure + urgency + evidence).toBeCloseTo(1, 10);
  });

  it("scores a bare, unverified pothole report from category baselines (hand-computed)", () => {
    // H = 0.45 (baseline), I = 0.35 (baseline), E = unknown,
    // U = (0.5·0.4 + 0.25·0) / 0.75 = 0.267, V = 0
    // P = (0.3·0.45 + 0.25·0.35 + 0.15·0.267 + 0.15·0) / 0.85 = 0.309
    const result = computePriority(input());
    expect(factorValue(result, "hazard")).toBe(0.45);
    expect(factorValue(result, "impact")).toBe(0.35);
    expect(factorValue(result, "exposure")).toBeNull();
    expect(factorValue(result, "urgency")).toBeCloseTo(0.267, 3);
    expect(factorValue(result, "evidence")).toBe(0);
    expect(result.score).toBeCloseTo(0.309, 3);
    expect(result.band).toBe("low");
    expect(result.provisional).toBe(true);
  });

  it("scores a fully specified critical incident (hand-computed)", () => {
    // H = 1, I = 0.6, E = 0.85, U = 0.5·1 + 0.25·0.5 + 0.25·1 = 0.875, V = 0.5 + 0.2 + 0.3 = 1
    // P = 0.3 + 0.15 + 0.1275 + 0.13125 + 0.15 = 0.859
    const result = computePriority(
      input({
        category: "exposed_electrical",
        confirmedSeverity: "critical",
        exposureLevel: "high",
        reportedDuration: "longer",
        hoursOpen: 84,
        coordinatorVerified: true,
        hasPhotograph: true,
        confirmedDuplicateCount: 3,
      }),
    );
    expect(result.factors.map((factor) => factor.value)).toEqual([1, 0.6, 0.85, 0.875, 1]);
    expect(result.score).toBeCloseTo(0.859, 3);
    expect(result.band).toBe("critical");
    expect(result.provisional).toBe(false);
  });

  it("always reports the five factors in H, I, E, U, V order with the configured weights", () => {
    const result = computePriority(input());
    expect(result.factors.map((factor) => factor.key)).toEqual(["hazard", "impact", "exposure", "urgency", "evidence"]);
    expect(result.factors.map((factor) => factor.weight)).toEqual([0.3, 0.25, 0.15, 0.15, 0.15]);
  });

  describe("unknown versus zero", () => {
    it("excludes an unknown factor and renormalises, rather than treating it as zero", () => {
      const result = computePriority(input());
      // Treating unknown exposure as 0 would give 0.26255 / 1.0 = 0.263; renormalising gives / 0.85 = 0.309.
      expect(result.score).not.toBeCloseTo(0.263, 3);
      expect(result.score).toBeCloseTo(0.26255 / 0.85, 3);
    });

    it("includes a factor whose value is a genuine zero (no evidence) at full weight", () => {
      const result = computePriority(input({ exposureLevel: "low" }));
      // All five factors known: P = 0.135 + 0.0875 + 0.15·0.25 + 0.15·0.267 + 0.15·0 = 0.300
      expect(factorValue(result, "evidence")).toBe(0);
      expect(result.score).toBeCloseTo(0.3, 3);
      expect(result.limitations.some((item) => item.includes("Verified evidence"))).toBe(false);
    });

    it("gives the same score as a config that drops the unknown factor's weight", () => {
      const unknownExposure = computePriority(input());
      const weights = { hazard: 0.3 / 0.85, impact: 0.25 / 0.85, exposure: 0, urgency: 0.15 / 0.85, evidence: 0.15 / 0.85 };
      const reweighted = computePriority(input({ exposureLevel: "high" }), { ...DEFAULT_PRIORITY_CONFIG, weights });
      expect(unknownExposure.score).toBeCloseTo(reweighted.score ?? Number.NaN, 3);
    });

    it("a score of a constant factor set is that constant, whatever is unknown", () => {
      // exposed_electrical, critical, U = 1, V = 1, I unknown is impossible here, so use exposure unknown:
      // H = 1, I = 0.6 ... not constant; instead check with a single-weight config.
      const config: PriorityConfig = {
        ...DEFAULT_PRIORITY_CONFIG,
        weights: { hazard: 1, impact: 0, exposure: 5, urgency: 0, evidence: 0 },
      };
      // Exposure unknown: only hazard carries weight → score equals H exactly despite the large exposure weight.
      expect(computePriority(input({ confirmedSeverity: "high" }), config).score).toBe(0.75);
    });
  });

  describe("hazard", () => {
    it("prefers coordinator-confirmed severity over the category baseline", () => {
      expect(factorValue(computePriority(input({ confirmedSeverity: "low" })), "hazard")).toBe(0.25);
      expect(factorValue(computePriority(input({ confirmedSeverity: "moderate" })), "hazard")).toBe(0.5);
      expect(factorValue(computePriority(input({ confirmedSeverity: "high" })), "hazard")).toBe(0.75);
      expect(factorValue(computePriority(input({ confirmedSeverity: "critical" })), "hazard")).toBe(1);
    });

    it("places the incident in awaiting_review with no score when hazard is unknown", () => {
      const result = computePriority(input({ category: "other", hasPhotograph: true, obstructsAccess: true }));
      expect(result.score).toBeNull();
      expect(result.band).toBe("awaiting_review");
      expect(factorValue(result, "hazard")).toBeNull();
      expect(result.explanation).toMatch(/^Awaiting review/);
      expect(result.explanation).toContain("no score has been calculated");
      expect(result.limitations.some((item) => item.startsWith("Hazard severity (H) is unknown"))).toBe(true);
    });

    it("scores an 'other' incident once severity is confirmed, still excluding the unknown impact (hand-computed)", () => {
      // H = 0.5, I = unknown, E = 0.6 (reporter says obstructed),
      // U = 0.5·0.4 + 0.25·0 + 0.25·0.2 = 0.25, V = 0.2 (photo)
      // P = (0.15 + 0.09 + 0.0375 + 0.03) / 0.75 = 0.41
      const result = computePriority(
        input({
          category: "other",
          confirmedSeverity: "moderate",
          obstructsAccess: true,
          reportedDuration: "today",
          hasPhotograph: true,
        }),
      );
      expect(factorValue(result, "impact")).toBeNull();
      expect(result.score).toBeCloseTo(0.41, 3);
      expect(result.band).toBe("moderate");
      expect(result.limitations.some((item) => item.startsWith("Infrastructure impact (I) is unknown"))).toBe(true);
    });
  });

  describe("exposure", () => {
    it("uses the coordinator estimate when present, ignoring the reporter's answer", () => {
      expect(factorValue(computePriority(input({ exposureLevel: "low", obstructsAccess: true })), "exposure")).toBe(0.25);
      expect(factorValue(computePriority(input({ exposureLevel: "moderate" })), "exposure")).toBe(0.55);
      expect(factorValue(computePriority(input({ exposureLevel: "high", obstructsAccess: false })), "exposure")).toBe(0.85);
    });

    it("falls back to the reporter's obstruction answer", () => {
      expect(factorValue(computePriority(input({ obstructsAccess: true })), "exposure")).toBe(0.6);
      expect(factorValue(computePriority(input({ obstructsAccess: false })), "exposure")).toBe(0.3);
    });

    it("is unknown, not zero, when nothing is known", () => {
      expect(factorValue(computePriority(input({ obstructsAccess: null })), "exposure")).toBeNull();
    });
  });

  describe("urgency", () => {
    it("renormalises when the reported duration is unknown", () => {
      // streetlight sensitivity 0.3; open 168 h → openAge 1: (0.15 + 0.25) / 0.75 = 0.533
      const result = computePriority(input({ category: "streetlight", hoursOpen: 168 }));
      expect(factorValue(result, "urgency")).toBeCloseTo(0.533, 3);
    });

    it("includes the reported duration when given", () => {
      // 0.5·0.3 + 0.25·1 + 0.25·0.8 = 0.6
      const result = computePriority(input({ category: "streetlight", hoursOpen: 168, reportedDuration: "weeks" }));
      expect(factorValue(result, "urgency")).toBeCloseTo(0.6, 3);
    });

    it("saturates the time-open component at 168 hours", () => {
      const week = computePriority(input({ hoursOpen: 168 }));
      const year = computePriority(input({ hoursOpen: 8760 }));
      expect(factorValue(year, "urgency")).toBe(factorValue(week, "urgency"));
    });

    it("clamps a negative age to zero", () => {
      expect(factorValue(computePriority(input({ hoursOpen: -50 })), "urgency")).toBe(
        factorValue(computePriority(input({ hoursOpen: 0 })), "urgency"),
      );
    });

    it("increases as an incident stays open", () => {
      const fresh = computePriority(input({ hoursOpen: 1 })).score ?? 0;
      const stale = computePriority(input({ hoursOpen: 120 })).score ?? 0;
      expect(stale).toBeGreaterThan(fresh);
    });
  });

  describe("evidence", () => {
    it("adds 0.5 for verification, 0.2 for a photograph and 0.1 per confirmed duplicate", () => {
      expect(factorValue(computePriority(input({ coordinatorVerified: true })), "evidence")).toBe(0.5);
      expect(factorValue(computePriority(input({ hasPhotograph: true })), "evidence")).toBe(0.2);
      expect(factorValue(computePriority(input({ confirmedDuplicateCount: 2 })), "evidence")).toBe(0.2);
      expect(factorValue(computePriority(input({ coordinatorVerified: true, hasPhotograph: true, confirmedDuplicateCount: 1 })), "evidence")).toBe(0.8);
    });

    it("counts at most three duplicates and never exceeds 1", () => {
      expect(factorValue(computePriority(input({ confirmedDuplicateCount: 25 })), "evidence")).toBe(0.3);
      expect(
        factorValue(computePriority(input({ coordinatorVerified: true, hasPhotograph: true, confirmedDuplicateCount: 25 })), "evidence"),
      ).toBe(1);
    });
  });

  describe("verified-asset impact uplift", () => {
    const leak = (findings: ScreeningFinding[]): PriorityInput =>
      input({ category: "water_leak", screening: { radiusMeters: 300, findings } });

    it("uses the category baseline when no asset is nearby", () => {
      expect(factorValue(computePriority(leak([])), "impact")).toBe(0.7);
    });

    it("raises impact for a verified, relevant asset in proportion to importance and proximity", () => {
      // strength = 1.0 (critical) · (1 − 150/300) = 0.5 → I = 0.7 + 0.3·0.5 = 0.85
      expect(factorValue(computePriority(leak([finding()])), "impact")).toBe(0.85);
      // important at 30 m: 0.7·0.9 = 0.63 → I = 0.7 + 0.189 = 0.889
      expect(factorValue(computePriority(leak([finding({ importance: "important", distanceMeters: 30 })])), "impact")).toBeCloseTo(0.889, 3);
      // standard at 0 m: 0.4 → I = 0.82
      expect(factorValue(computePriority(leak([finding({ importance: "standard", distanceMeters: 0 })])), "impact")).toBeCloseTo(0.82, 3);
    });

    it("gives no uplift for an unverified asset", () => {
      expect(factorValue(computePriority(leak([finding({ verified: false })])), "impact")).toBe(0.7);
    });

    it("gives no uplift for a verified asset with no screening rule (relevance null)", () => {
      expect(factorValue(computePriority(leak([finding({ relevance: null })])), "impact")).toBe(0.7);
    });

    it("gives no uplift for an asset on the edge of the radius", () => {
      expect(factorValue(computePriority(leak([finding({ distanceMeters: 300 })])), "impact")).toBe(0.7);
    });

    it("uses only the strongest qualifying asset, not the sum", () => {
      const result = computePriority(
        leak([
          finding({ assetId: "a", assetName: "Far Critical", importance: "critical", distanceMeters: 150 }), // 0.5
          finding({ assetId: "b", assetName: "Near Important", importance: "important", distanceMeters: 30 }), // 0.63
          finding({ assetId: "c", assetName: "Unverified On Top", importance: "critical", distanceMeters: 0, verified: false }),
        ]),
      );
      expect(factorValue(result, "impact")).toBeCloseTo(0.889, 3);
      expect(result.explanation).toContain("Near Important");
      expect(result.explanation).not.toContain("Unverified On Top");
    });

    it("caps impact at 1", () => {
      const result = computePriority(
        input({ category: "structural", screening: { radiusMeters: 300, findings: [finding({ distanceMeters: 0 })] } }),
      );
      expect(factorValue(result, "impact")).toBe(1);
    });

    it("cannot make an unknown impact known", () => {
      const result = computePriority(
        input({ category: "other", confirmedSeverity: "high", screening: { radiusMeters: 300, findings: [finding()] } }),
      );
      expect(factorValue(result, "impact")).toBeNull();
    });

    it("respects a custom uplift", () => {
      const config: PriorityConfig = { ...DEFAULT_PRIORITY_CONFIG, assetImpactUplift: 0.1 };
      expect(factorValue(computePriority(leak([finding()]), config), "impact")).toBeCloseTo(0.75, 3);
    });

    it("raises the overall score compared with the same incident without the asset", () => {
      const without = computePriority(leak([finding({ verified: false })])).score ?? 0;
      const withAsset = computePriority(leak([finding()])).score ?? 0;
      // ΔI = 0.15 at weight 0.25, renormalised by 0.85 → +0.044
      expect(withAsset - without).toBeCloseTo((0.25 * 0.15) / 0.85, 2);
    });
  });

  describe("provisional flag", () => {
    it("is true until a coordinator verifies the incident, including when awaiting review", () => {
      expect(computePriority(input()).provisional).toBe(true);
      expect(computePriority(input({ confirmedSeverity: "high" })).provisional).toBe(true);
      expect(computePriority(input({ category: "other" })).provisional).toBe(true);
      expect(computePriority(input({ coordinatorVerified: true })).provisional).toBe(false);
      expect(computePriority(input({ category: "other", coordinatorVerified: true })).provisional).toBe(false);
    });
  });

  describe("limitations", () => {
    it("lists every unknown factor and the empty asset registry", () => {
      const result = computePriority(input({ category: "other" }));
      expect(result.limitations).toHaveLength(4);
      expect(result.limitations.filter((item) => item.includes("is unknown and was excluded from the score"))).toHaveLength(3);
      expect(result.limitations.some((item) => item.includes("asset registry may be incomplete"))).toBe(true);
    });

    it("is empty when every factor is known and an asset was found", () => {
      const result = computePriority(
        input({ exposureLevel: "moderate", screening: { radiusMeters: 300, findings: [finding({ verified: false })] } }),
      );
      expect(result.limitations).toEqual([]);
    });

    it("reports only the exposure gap for a typical new report near a registered asset", () => {
      const result = computePriority(input({ screening: { radiusMeters: 300, findings: [finding()] } }));
      expect(result.limitations).toHaveLength(1);
      expect(result.limitations[0]).toContain("Exposure (E) is unknown");
    });
  });

  describe("explanation", () => {
    it("names the band, score, verification state and contributing facts", () => {
      const result = computePriority(
        input({
          category: "water_leak",
          confirmedSeverity: "high",
          exposureLevel: "high",
          coordinatorVerified: true,
          confirmedDuplicateCount: 1,
          reportedDuration: "weeks",
          screening: { radiusMeters: 300, findings: [finding()] },
        }),
      );
      expect(result.explanation).toContain(`priority (score ${(result.score ?? 0).toFixed(2)})`);
      expect(result.explanation).toContain("a coordinator-verified water leak or burst pipe report");
      expect(result.explanation).toContain("severity confirmed as high");
      expect(result.explanation).toContain("1 confirmed matching report,");
      expect(result.explanation).toContain("high exposure estimated by a coordinator");
      expect(result.explanation).toContain("long-standing problem");
      expect(result.explanation).toContain("Central Hospital (critical importance, 150 m away)");
    });

    it("describes an unverified report as such", () => {
      expect(computePriority(input()).explanation).toMatch(/^Low priority \(score 0\.31\): an unverified pothole/);
    });
  });

  it("keeps every score within [0, 1] across all categories and extremes", () => {
    const categories = ["pothole", "water_leak", "blocked_drain", "flooding", "structural", "streetlight", "exposed_electrical", "sidewalk", "illegal_dumping"] as const;
    for (const category of categories) {
      const low = computePriority(input({ category, confirmedSeverity: "low", exposureLevel: "low" }));
      const high = computePriority(
        input({
          category,
          confirmedSeverity: "critical",
          exposureLevel: "high",
          reportedDuration: "longer",
          hoursOpen: 10_000,
          coordinatorVerified: true,
          hasPhotograph: true,
          confirmedDuplicateCount: 9,
          screening: { radiusMeters: 300, findings: [finding({ distanceMeters: 0 })] },
        }),
      );
      expect(low.score).not.toBeNull();
      expect(high.score).not.toBeNull();
      expect(low.score ?? -1).toBeGreaterThanOrEqual(0);
      expect(high.score ?? 2).toBeLessThanOrEqual(1);
      expect(high.score ?? 0).toBeGreaterThan(low.score ?? 1);
      expect(high.band).toBe("critical");
    }
  });
});
