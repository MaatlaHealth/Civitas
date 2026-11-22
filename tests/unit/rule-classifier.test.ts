import { describe, expect, it } from "vitest";
import { classifyByRules } from "@/lib/ai/rule-classifier";

describe("classifyByRules", () => {
  it("agrees with the reporter when the text supports the chosen category", () => {
    const result = classifyByRules("pothole", "Huge pothole", "A crater has opened in the asphalt near the taxi rank");
    expect(result.suggestedCategory).toBe("pothole");
    expect(result.agreesWithReporter).toBe(true);
    expect(result.matchedKeywords).toEqual(["pothole", "crater", "asphalt"]);
  });

  it("returns no suggestion, and does not contradict the reporter, when no keyword matches", () => {
    expect(classifyByRules("streetlight", "Problem here", "Something looks wrong on my road")).toEqual({
      suggestedCategory: null,
      matchedKeywords: [],
      agreesWithReporter: true,
    });
  });

  it("flags a report whose text points to a different category", () => {
    const result = classifyByRules("pothole", "Water everywhere", "A burst pipe is gushing onto the road");
    expect(result.suggestedCategory).toBe("water_leak");
    expect(result.agreesWithReporter).toBe(false);
    expect(result.matchedKeywords).toEqual(["burst", "pipe", "gushing"]);
  });

  it("prefers the reporter's category whenever the text supports it at all, even if another category matches more", () => {
    // flooding: "flood", "flooded", "submerged" (3 matches); pothole: "pothole" (1 match)
    const result = classifyByRules("pothole", "Flooded road", "The street is submerged and there is a pothole under the water");
    expect(result.suggestedCategory).toBe("pothole");
    expect(result.agreesWithReporter).toBe(true);
    expect(result.matchedKeywords).toEqual(["pothole"]);
  });

  it("suggests the category with the most keyword matches when the reporter's has none", () => {
    // exposed_electrical: "exposed", "cable", "sparks" (3); streetlight: "lamp post" (1)
    const result = classifyByRules("sidewalk", "Danger", "Exposed cable throwing sparks beside the lamp post");
    expect(result.suggestedCategory).toBe("exposed_electrical");
    expect(result.matchedKeywords).toEqual(["exposed", "cable", "sparks"]);
    expect(result.agreesWithReporter).toBe(false);
  });

  it("breaks a tie in favour of the category listed first", () => {
    // One match each for water_leak ("hydrant") and structural ("bridge"); water_leak comes first.
    const result = classifyByRules("other", "Hydrant", "Next to the bridge");
    expect(result.suggestedCategory).toBe("water_leak");
    expect(result.matchedKeywords).toEqual(["hydrant"]);
  });

  it("is case-insensitive and reads both title and description", () => {
    expect(classifyByRules("other", "STREETLIGHT OUT", "nothing else to say").suggestedCategory).toBe("streetlight");
    expect(classifyByRules("other", "Nothing to say", "The Sewer is OVERFLOWING").suggestedCategory).toBe("blocked_drain");
  });

  it("matches multi-word keywords", () => {
    const result = classifyByRules("streetlight", "Dark corner", "The light is out and it is dark at night");
    expect(result.agreesWithReporter).toBe(true);
    expect(result.matchedKeywords).toEqual(["light is out", "dark at night"]);
  });

  it("can never 'agree' with an 'other' report once any keyword matches, because 'other' has no keywords", () => {
    const result = classifyByRules("other", "Rubbish pile", "Garbage dumped on the corner");
    expect(result.suggestedCategory).toBe("illegal_dumping");
    expect(result.agreesWithReporter).toBe(false);
  });

  it.each([
    ["pothole", "Pothole", "Deep pothole in the road surface"],
    ["water_leak", "Leak", "Water leaking from a burst pipe"],
    ["blocked_drain", "Drain", "The stormwater drain is blocked"],
    ["flooding", "Flood", "The underpass is flooded"],
    ["structural", "Bridge", "A crack in the retaining wall of the bridge"],
    ["streetlight", "Light", "The streetlight has failed"],
    ["exposed_electrical", "Wires", "Live wire hanging from a pole"],
    ["sidewalk", "Paving", "Broken paving on the sidewalk"],
    ["illegal_dumping", "Dumping", "Builders' rubble dumped on the verge"],
  ] as const)("supports a typical %s report", (category, title, description) => {
    const result = classifyByRules(category, title, description);
    expect(result.suggestedCategory).toBe(category);
    expect(result.agreesWithReporter).toBe(true);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it("only returns keywords that actually occur in the text", () => {
    const title = "Leaking hydrant";
    const description = "Water spraying across the pavement";
    const text = `${title} ${description}`.toLowerCase();
    const result = classifyByRules("water_leak", title, description);
    for (const keyword of result.matchedKeywords) expect(text).toContain(keyword);
  });

  // Regression (was a bug in src/lib/ai/rule-classifier.ts:33,39): keywords are matched as raw
  // substrings rather than whole words, so "started" contains the pothole
  // keyword "tar" and an unrelated report is flagged as a probable pothole
  // that disagrees with the reporter. (Likewise "bleak" → "leak",
  // "curbside"/"kerbside" are fine, but "unexposed" → "exposed", etc.)
  it("does not match a keyword inside an unrelated longer word ('started' is not 'tar')", () => {
    const result = classifyByRules("other", "Noise from a cabinet", "It started humming last night");
    expect(result.suggestedCategory).toBeNull();
    expect(result.agreesWithReporter).toBe(true);
  });
});
