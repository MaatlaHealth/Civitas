import { describe, expect, it } from "vitest";
import { aiAnalysisSchema, GEMINI_RESPONSE_SCHEMA } from "@/lib/ai/schema";

function validAnalysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    category: "pothole",
    observations: ["A hole roughly 40 cm wide is visible in the left lane."],
    descriptionConsistency: "consistent",
    possibleHazards: ["Vehicles may swerve into oncoming traffic."],
    imageQuality: "good",
    missingInformation: [],
    reviewQuestions: ["How deep is the hole?"],
    confidence: "medium",
    requiresHumanReview: true,
    ...overrides,
  };
}

function without(key: string): Record<string, unknown> {
  const copy = validAnalysis();
  delete copy[key];
  return copy;
}

const REQUIRED_FIELDS = [
  "category",
  "observations",
  "descriptionConsistency",
  "possibleHazards",
  "imageQuality",
  "missingInformation",
  "reviewQuestions",
  "confidence",
  "requiresHumanReview",
] as const;

const LIST_FIELDS = ["observations", "possibleHazards", "missingInformation", "reviewQuestions"] as const;

describe("aiAnalysisSchema", () => {
  it("accepts a valid analysis and returns it unchanged", () => {
    const result = aiAnalysisSchema.safeParse(validAnalysis());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(validAnalysis());
  });

  it("accepts empty lists and lists of exactly eight items", () => {
    const eight = Array.from({ length: 8 }, (_, index) => `Item ${index + 1}`);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: [], possibleHazards: [], reviewQuestions: [] })).success).toBe(true);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: eight })).success).toBe(true);
  });

  it.each(LIST_FIELDS)("rejects more than eight entries in %s", (field) => {
    const nine = Array.from({ length: 9 }, (_, index) => `Item ${index + 1}`);
    const result = aiAnalysisSchema.safeParse(validAnalysis({ [field]: nine }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual([field]);
  });

  it("rejects list entries longer than 300 characters but accepts exactly 300", () => {
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: ["x".repeat(300)] })).success).toBe(true);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: ["x".repeat(301)] })).success).toBe(false);
  });

  it("rejects empty or whitespace-only list entries and trims the rest", () => {
    expect(aiAnalysisSchema.safeParse(validAnalysis({ possibleHazards: [""] })).success).toBe(false);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ possibleHazards: ["   "] })).success).toBe(false);
    const trimmed = aiAnalysisSchema.safeParse(validAnalysis({ possibleHazards: ["  Trip hazard  "] }));
    expect(trimmed.success).toBe(true);
    if (trimmed.success) expect(trimmed.data.possibleHazards).toEqual(["Trip hazard"]);
  });

  it("rejects lists that are not arrays of strings", () => {
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: "one long string" })).success).toBe(false);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: [1, 2] })).success).toBe(false);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ observations: null })).success).toBe(false);
  });

  it.each([
    ["category", "sinkhole"],
    ["category", "Pothole"],
    ["descriptionConsistency", "mostly_consistent"],
    ["imageQuality", "excellent"],
    ["confidence", "very_high"],
    ["confidence", 0.9],
  ])("rejects the wrong enum value %s = %j", (field, value) => {
    const result = aiAnalysisSchema.safeParse(validAnalysis({ [field]: value }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual([field]);
  });

  it("accepts every documented enum value", () => {
    for (const descriptionConsistency of ["consistent", "partially_consistent", "inconsistent", "not_assessable"]) {
      expect(aiAnalysisSchema.safeParse(validAnalysis({ descriptionConsistency })).success).toBe(true);
    }
    for (const imageQuality of ["good", "fair", "poor", "no_image"]) {
      expect(aiAnalysisSchema.safeParse(validAnalysis({ imageQuality })).success).toBe(true);
    }
    for (const confidence of ["low", "medium", "high"]) {
      expect(aiAnalysisSchema.safeParse(validAnalysis({ confidence })).success).toBe(true);
    }
  });

  it.each(REQUIRED_FIELDS)("rejects an analysis missing %s", (field) => {
    const result = aiAnalysisSchema.safeParse(without(field));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual([field]);
  });

  it("requires requiresHumanReview to be a real boolean", () => {
    expect(aiAnalysisSchema.safeParse(validAnalysis({ requiresHumanReview: "true" })).success).toBe(false);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ requiresHumanReview: 1 })).success).toBe(false);
    expect(aiAnalysisSchema.safeParse(validAnalysis({ requiresHumanReview: false })).success).toBe(true);
  });

  it("rejects anything that is not an object", () => {
    for (const value of [null, undefined, "pothole", 42, [], [validAnalysis()]]) {
      expect(aiAnalysisSchema.safeParse(value).success).toBe(false);
    }
  });

  it("discards fields the model was not asked for (such as a priority or a numeric probability)", () => {
    const result = aiAnalysisSchema.safeParse(validAnalysis({ priority: "critical", probability: 0.97, severity: "high" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Object.keys(result.data).sort()).toEqual([...REQUIRED_FIELDS].sort());
    }
  });
});

describe("GEMINI_RESPONSE_SCHEMA", () => {
  it("requires exactly the fields the Zod schema validates", () => {
    expect([...GEMINI_RESPONSE_SCHEMA.required].sort()).toEqual(Object.keys(aiAnalysisSchema.shape).sort());
    expect(Object.keys(GEMINI_RESPONSE_SCHEMA.properties).sort()).toEqual(Object.keys(aiAnalysisSchema.shape).sort());
  });

  it("offers the model only enum values the Zod schema accepts", () => {
    const { category, descriptionConsistency, imageQuality, confidence } = GEMINI_RESPONSE_SCHEMA.properties;
    for (const value of category.enum) expect(aiAnalysisSchema.safeParse(validAnalysis({ category: value })).success).toBe(true);
    for (const value of descriptionConsistency.enum) {
      expect(aiAnalysisSchema.safeParse(validAnalysis({ descriptionConsistency: value })).success).toBe(true);
    }
    for (const value of imageQuality.enum) expect(aiAnalysisSchema.safeParse(validAnalysis({ imageQuality: value })).success).toBe(true);
    for (const value of confidence.enum) expect(aiAnalysisSchema.safeParse(validAnalysis({ confidence: value })).success).toBe(true);
  });
});
