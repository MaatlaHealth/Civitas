import { describe, expect, it } from "vitest";
import type { IncidentCategory } from "@/lib/domain/categories";
import {
  categoryCompatibility,
  DEFAULT_DUPLICATE_CONFIG,
  findDuplicateCandidates,
  maxSearchRadiusMeters,
  scorePair,
  searchRadiusMeters,
  type DuplicateConfig,
  type DuplicateSubject,
} from "@/lib/engines/duplicates";
import { northOf, ORIGIN } from "./helpers/geo";

const BASE_TIME = new Date("2026-03-01T08:00:00Z");
const HOUR = 3_600_000;

interface SubjectOptions {
  id?: string;
  category?: IncidentCategory;
  metersNorth?: number;
  hoursLater?: number;
  title?: string;
  description?: string;
}

function subject(options: SubjectOptions = {}): DuplicateSubject {
  return {
    id: options.id ?? "target",
    category: options.category ?? "pothole",
    ...northOf(ORIGIN, options.metersNorth ?? 0),
    title: options.title ?? "Deep pothole",
    description: options.description ?? "Large hole in the tar beside the taxi rank",
    reportedAt: new Date(BASE_TIME.getTime() + (options.hoursLater ?? 0) * HOUR),
  };
}

describe("categoryCompatibility", () => {
  it("is 1 for the same category", () => {
    expect(categoryCompatibility("pothole", "pothole")).toBe(1);
    expect(categoryCompatibility("flooding", "flooding")).toBe(1);
  });

  it("is only 0.5 for two 'other' reports, which may describe different things", () => {
    expect(categoryCompatibility("other", "other")).toBe(0.5);
  });

  it("returns the configured value for related categories, in either order", () => {
    expect(categoryCompatibility("water_leak", "flooding")).toBe(0.6);
    expect(categoryCompatibility("flooding", "water_leak")).toBe(0.6);
    expect(categoryCompatibility("blocked_drain", "flooding")).toBe(0.7);
    expect(categoryCompatibility("sidewalk", "pothole")).toBe(0.3);
    expect(categoryCompatibility("exposed_electrical", "streetlight")).toBe(0.4);
    expect(categoryCompatibility("blocked_drain", "illegal_dumping")).toBe(0.4);
  });

  it("is 0 for unrelated categories", () => {
    expect(categoryCompatibility("pothole", "streetlight")).toBe(0);
    expect(categoryCompatibility("water_leak", "exposed_electrical")).toBe(0);
    expect(categoryCompatibility("other", "pothole")).toBe(0);
    // Relatedness is not transitive: leak~flooding and drain~flooding, but not leak~drain.
    expect(categoryCompatibility("water_leak", "blocked_drain")).toBe(0);
  });
});

describe("searchRadiusMeters", () => {
  it("uses the category's own radius for a same-category pair", () => {
    expect(searchRadiusMeters("pothole", "pothole")).toBe(35);
    expect(searchRadiusMeters("streetlight", "streetlight")).toBe(25);
  });

  it("uses the larger radius for a mixed pair, in either order", () => {
    expect(searchRadiusMeters("water_leak", "flooding")).toBe(150);
    expect(searchRadiusMeters("flooding", "water_leak")).toBe(150);
    expect(searchRadiusMeters("pothole", "sidewalk")).toBe(35);
  });

  it("maxSearchRadiusMeters is the largest configured radius (flooding, 150 m)", () => {
    expect(maxSearchRadiusMeters()).toBe(150);
  });
});

describe("scorePair", () => {
  it("scores 1 for an identical report at the same place and time", () => {
    const match = scorePair(subject(), subject({ id: "other" }));
    expect(match).not.toBeNull();
    expect(match?.score).toBe(1);
    expect(match?.components).toEqual({ geographic: 1, category: 1, temporal: 1, description: 1 });
    expect(match?.distanceMeters).toBe(0);
    expect(match?.hoursApart).toBe(0);
    expect(match?.incidentId).toBe("target");
    expect(match?.otherIncidentId).toBe("other");
  });

  it("matches nearby similar reports with a hand-computed score", () => {
    // 10 m apart in a 35 m radius: G = 1 − 10/35 = 0.714; C = T = D = 1
    // S = 0.4·0.714 + 0.25 + 0.2 + 0.15 = 0.886
    const match = scorePair(subject(), subject({ id: "other", metersNorth: 10 }));
    expect(match).not.toBeNull();
    expect(match?.distanceMeters).toBeCloseTo(10, 1);
    expect(match?.radiusMeters).toBe(35);
    expect(match?.components.geographic).toBeCloseTo(0.714, 3);
    expect(match?.score).toBeCloseTo(0.886, 3);
    expect(match?.score).toBeGreaterThanOrEqual(DEFAULT_DUPLICATE_CONFIG.candidateThreshold);
  });

  it("halves the temporal component every 72 hours", () => {
    const threeDays = scorePair(subject(), subject({ id: "other", hoursLater: 72 }));
    const sixDays = scorePair(subject(), subject({ id: "other", hoursLater: 144 }));
    expect(threeDays?.components.temporal).toBe(0.5);
    expect(sixDays?.components.temporal).toBe(0.25);
    expect(threeDays?.hoursApart).toBe(72);
    // S = 0.4 + 0.25 + 0.2·0.5 + 0.15 = 0.9
    expect(threeDays?.score).toBeCloseTo(0.9, 3);
  });

  it("uses the absolute time gap regardless of which report came first", () => {
    const later = scorePair(subject(), subject({ id: "other", hoursLater: 24 }));
    const earlier = scorePair(subject(), subject({ id: "other", hoursLater: -24 }));
    expect(later?.score).toBe(earlier?.score);
    expect(earlier?.hoursApart).toBe(24);
  });

  it("does not match distant reports, however similar their text", () => {
    expect(scorePair(subject(), subject({ id: "other", metersNorth: 5000 }))).toBeNull();
  });

  it("applies the search radius as a hard cut-off", () => {
    expect(scorePair(subject(), subject({ id: "other", metersNorth: 34 }))).not.toBeNull();
    expect(scorePair(subject(), subject({ id: "other", metersNorth: 36 }))).toBeNull();
  });

  it("never matches incompatible categories, even at the same point with the same text", () => {
    const pothole = subject({ category: "pothole" });
    const light = subject({ id: "other", category: "streetlight" });
    expect(scorePair(pothole, light)).toBeNull();
    expect(scorePair(light, pothole)).toBeNull();
  });

  it("gives related categories a reduced score compared with the same category", () => {
    const leak = subject({ category: "water_leak", title: "Water in road", description: "Water is covering the whole street" });
    const sameCategory = scorePair(leak, { ...leak, id: "other" });
    const related = scorePair(leak, { ...leak, id: "other", category: "flooding" });
    expect(sameCategory?.score).toBe(1);
    // S = 0.4 + 0.25·0.6 + 0.2 + 0.15 = 0.9
    expect(related?.score).toBeCloseTo(0.9, 3);
    expect(related?.components.category).toBe(0.6);
    expect(related?.explanation).toContain("related categories");
  });

  it("uses the larger radius for related categories", () => {
    // 100 m apart: outside a leak's own 75 m radius but inside flooding's 150 m.
    const leak = subject({ category: "water_leak" });
    const flood = subject({ id: "other", category: "flooding", metersNorth: 100 });
    const match = scorePair(leak, flood);
    expect(match).not.toBeNull();
    expect(match?.radiusMeters).toBe(150);
    expect(match?.components.geographic).toBeCloseTo(1 - 100 / 150, 3);
    expect(scorePair(leak, subject({ id: "other", category: "water_leak", metersNorth: 100 }))).toBeNull();
  });

  it("scores the description component from shared vocabulary", () => {
    const a = subject({ title: "Burst pipe", description: "leaking water" });
    const b = subject({ id: "other", title: "Water pipe", description: "burst" });
    // {burst, pipe, leak, water} vs {water, pipe, burst} → 0.75
    expect(scorePair(a, b)?.components.description).toBe(0.75);
  });

  it("is symmetric in score", () => {
    const a = subject({ title: "Pothole", description: "Deep hole near the school gate" });
    const b = subject({ id: "other", metersNorth: 12, hoursLater: 30, title: "Road damage", description: "Hole in road at school" });
    expect(scorePair(a, b)?.score).toBe(scorePair(b, a)?.score);
  });

  it("keeps the score within [0, 1] and equal to the weighted sum of its components", () => {
    const match = scorePair(
      subject(),
      subject({ id: "other", metersNorth: 20, hoursLater: 50, description: "Hole beside the taxi rank is growing" }),
    );
    expect(match).not.toBeNull();
    if (!match) return;
    const { geographic, category, temporal, description } = match.components;
    const expected = 0.4 * geographic + 0.25 * category + 0.2 * temporal + 0.15 * description;
    expect(match.score).toBeGreaterThanOrEqual(0);
    expect(match.score).toBeLessThanOrEqual(1);
    // Components are rounded to 3 places, so allow for rounding.
    expect(match.score).toBeCloseTo(expected, 2);
  });

  it("honours custom weights", () => {
    const config: DuplicateConfig = {
      weights: { geographic: 1, category: 0, temporal: 0, description: 0 },
      candidateThreshold: 0,
      temporalHalfLifeHours: 72,
    };
    const match = scorePair(subject(), subject({ id: "other", metersNorth: 7, hoursLater: 500, description: "x" }), config);
    expect(match?.score).toBeCloseTo(1 - 7 / 35, 3);
  });

  it("explains the match in plain language", () => {
    const match = scorePair(subject(), subject({ id: "other", metersNorth: 10 }));
    expect(match?.explanation).toContain('Both reports are categorised as "Pothole or road surface damage"');
    expect(match?.explanation).toContain("10 m apart");
    expect(match?.explanation).toContain("less than an hour apart");
    expect(match?.explanation).toContain("use similar wording");

    const different = scorePair(
      subject(),
      subject({ id: "other", hoursLater: 96, title: "Crater", description: "Vehicles swerving dangerously" }),
    );
    expect(different?.explanation).toContain("about 4 days apart");
    expect(different?.explanation).toContain("are worded differently");
  });
});

describe("findDuplicateCandidates", () => {
  it("returns nearby similar reports and leaves out distant or incompatible ones", () => {
    const target = subject();
    const others = [
      subject({ id: "near", metersNorth: 8 }),
      subject({ id: "far", metersNorth: 2500 }),
      subject({ id: "wrong-category", category: "streetlight", metersNorth: 1 }),
    ];
    const matches = findDuplicateCandidates(target, others);
    expect(matches.map((match) => match.otherIncidentId)).toEqual(["near"]);
  });

  it("sorts results by descending score", () => {
    const target = subject();
    const others = [
      subject({ id: "25m", metersNorth: 25 }),
      subject({ id: "5m", metersNorth: 5 }),
      subject({ id: "15m", metersNorth: 15 }),
    ];
    const matches = findDuplicateCandidates(target, others);
    expect(matches.map((match) => match.otherIncidentId)).toEqual(["5m", "15m", "25m"]);
    const scores = matches.map((match) => match.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(3);
  });

  it("ranks a same-category report above a related-category one at the same place", () => {
    const target = subject({ category: "flooding", title: "Flooded road", description: "Water covering the street after rain" });
    const others = [
      { ...target, id: "related", category: "blocked_drain" as const },
      { ...target, id: "same" },
    ];
    const matches = findDuplicateCandidates(target, others);
    expect(matches.map((match) => match.otherIncidentId)).toEqual(["same", "related"]);
  });

  it("respects the threshold", () => {
    // 30 m apart, 72 h apart, no shared wording:
    // S = 0.4·(1 − 30/35) + 0.25 + 0.2·0.5 + 0 = 0.407
    const target = subject();
    const weak = subject({ id: "weak", metersNorth: 30, hoursLater: 72, title: "Crater", description: "Vehicles swerving dangerously" });
    expect(scorePair(target, weak)?.score).toBeCloseTo(0.407, 3);

    expect(findDuplicateCandidates(target, [weak])).toEqual([]);

    const lenient: DuplicateConfig = { ...DEFAULT_DUPLICATE_CONFIG, candidateThreshold: 0.4 };
    expect(findDuplicateCandidates(target, [weak], lenient).map((match) => match.otherIncidentId)).toEqual(["weak"]);

    const strict: DuplicateConfig = { ...DEFAULT_DUPLICATE_CONFIG, candidateThreshold: 0.41 };
    expect(findDuplicateCandidates(target, [weak], strict)).toEqual([]);
  });

  it("includes a pair whose score equals the threshold exactly", () => {
    const target = subject();
    const other = subject({ id: "other", metersNorth: 10 });
    const score = scorePair(target, other)?.score;
    expect(score).toBeDefined();
    if (score === undefined) return;
    const atThreshold: DuplicateConfig = { ...DEFAULT_DUPLICATE_CONFIG, candidateThreshold: score };
    expect(findDuplicateCandidates(target, [other], atThreshold)).toHaveLength(1);
  });

  it("never matches a report with itself", () => {
    const target = subject();
    expect(findDuplicateCandidates(target, [target, subject({ id: "target" })])).toEqual([]);
  });

  it("returns an empty list when there is nothing to compare", () => {
    expect(findDuplicateCandidates(subject(), [])).toEqual([]);
  });

  it("does not raise two vague 'other' reports at the same spot unless more evidence agrees", () => {
    // Same place, same time, unrelated wording: S = 0.4 + 0.25·0.5 + 0.2 + 0 = 0.725 → still a candidate.
    // 72 h apart and 30 m apart (radius 50): S = 0.4·0.4 + 0.125 + 0.1 + 0 = 0.385 → not a candidate.
    const target = subject({ category: "other", title: "Strange noise", description: "Humming from a metal cabinet" });
    const sameSpot = subject({ id: "a", category: "other", title: "Broken bench", description: "Wooden slats missing" });
    const apart = { ...sameSpot, id: "b", ...northOf(ORIGIN, 30), reportedAt: new Date(BASE_TIME.getTime() + 72 * HOUR) };
    expect(scorePair(target, sameSpot)?.score).toBeCloseTo(0.725, 3);
    expect(scorePair(target, apart)?.score).toBeCloseTo(0.385, 3);
    expect(findDuplicateCandidates(target, [sameSpot, apart]).map((match) => match.otherIncidentId)).toEqual(["a"]);
  });
});
