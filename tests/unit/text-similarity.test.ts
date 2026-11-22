import { describe, expect, it } from "vitest";
import { descriptionSimilarity, tokenize } from "@/lib/engines/text-similarity";

const sorted = (set: Set<string>): string[] => [...set].sort();

describe("tokenize", () => {
  it("lower-cases, strips punctuation and drops stop words and short tokens", () => {
    expect(sorted(tokenize("The BIG pothole, on Main Rd!"))).toEqual(["big", "main", "pothole"]);
  });

  it("returns an empty set for empty, whitespace-only or stop-word-only text", () => {
    expect(tokenize("").size).toBe(0);
    expect(tokenize("   \n\t ").size).toBe(0);
    expect(tokenize("it is on the at a of").size).toBe(0);
  });

  it("strips -ing, -ed and plural -s suffixes so word forms collapse", () => {
    expect(sorted(tokenize("leaking leaks"))).toEqual(["leak"]);
    expect(sorted(tokenize("flooding flooded floods"))).toEqual(["flood"]);
    expect(sorted(tokenize("pipes"))).toEqual(["pipe"]);
  });

  it("does not strip suffixes from words that are too short or end in -ss", () => {
    expect(sorted(tokenize("glass"))).toEqual(["glass"]);
    expect(sorted(tokenize("bus"))).toEqual(["bus"]);
    expect(sorted(tokenize("king"))).toEqual(["king"]);
    expect(sorted(tokenize("shed"))).toEqual(["shed"]);
  });

  it("deduplicates repeated words", () => {
    expect(tokenize("water water water everywhere").size).toBe(2);
  });

  it("keeps digits", () => {
    expect(tokenize("corner of 12th avenue").has("12th")).toBe(true);
  });

  // Regression (was a bug in src/lib/engines/text-similarity.ts:27-29): NFKD decomposes "é" into
  // "e" + U+0301, and the following replace turns the combining mark into a
  // space, so an accented letter in the middle of a word splits the word
  // ("résumé" → "re", "sume") instead of folding it to "resume".
  it("folds diacritics without splitting the word", () => {
    expect(sorted(tokenize("résumé"))).toEqual(["resume"]);
  });
});

describe("descriptionSimilarity", () => {
  it("is 1 for identical text", () => {
    expect(descriptionSimilarity("Burst pipe flooding the street", "Burst pipe flooding the street")).toBe(1);
  });

  it("ignores case, punctuation, word order and word form", () => {
    expect(descriptionSimilarity("Leaking pipes!", "pipe LEAK")).toBe(1);
  });

  it("is 0 when no vocabulary is shared", () => {
    expect(descriptionSimilarity("deep pothole road", "streetlamp flickers nightly")).toBe(0);
  });

  it("is 0 when either text has no usable tokens", () => {
    expect(descriptionSimilarity("", "burst pipe")).toBe(0);
    expect(descriptionSimilarity("burst pipe", "the of a")).toBe(0);
    expect(descriptionSimilarity("", "")).toBe(0);
  });

  it("computes the Jaccard index: |A∩B| / |A∪B|", () => {
    // A = {burst, pipe, leak, water}, B = {water, pipe, burst} → 3 / 4
    expect(descriptionSimilarity("burst pipe leaking water", "water pipe burst")).toBeCloseTo(0.75, 10);
    // A = {deep, pothole}, B = {pothole, main, road} → 1 / 4
    expect(descriptionSimilarity("deep pothole", "pothole on main road")).toBeCloseTo(0.25, 10);
  });

  it("is symmetric", () => {
    const a = "Water gushing from a broken hydrant";
    const b = "Hydrant broken, road covered in water";
    expect(descriptionSimilarity(a, b)).toBe(descriptionSimilarity(b, a));
  });

  it("stays within [0, 1]", () => {
    const value = descriptionSimilarity("pothole pothole pothole road", "road pothole crack");
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});
