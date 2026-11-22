import { INCIDENT_CATEGORIES, type IncidentCategory } from "@/lib/domain/categories";

/**
 * Deterministic keyword classifier. It runs on every report whether or not
 * the AI service is available, and exists to flag reports whose text points
 * to a different category than the one the reporter chose. It never changes
 * the category by itself; a coordinator decides.
 */
const CATEGORY_KEYWORDS: Record<IncidentCategory, readonly string[]> = {
  pothole: ["pothole", "potholes", "crater", "tar", "road surface", "sinkhole", "asphalt"],
  water_leak: ["leak", "leaking", "burst", "pipe", "hydrant", "water meter", "gushing", "spraying"],
  blocked_drain: ["drain", "blocked", "stormwater", "manhole", "sewer", "sewage", "overflowing"],
  flooding: ["flood", "flooded", "flooding", "submerged", "standing water", "water level"],
  structural: ["bridge", "culvert", "retaining wall", "collapsed", "collapse", "crack in", "structure"],
  streetlight: ["streetlight", "street light", "lamp post", "light is out", "lights are out", "dark at night"],
  exposed_electrical: ["exposed", "cable", "cables", "wires", "live wire", "electrical box", "power line", "sparks"],
  sidewalk: ["sidewalk", "pavement", "paving", "walkway", "kerb", "curb", "footpath"],
  illegal_dumping: ["dumping", "dumped", "rubble", "rubbish", "garbage", "waste", "litter"],
  other: [],
};

export interface RuleClassification {
  /** Null when no keyword matched. */
  suggestedCategory: IncidentCategory | null;
  matchedKeywords: string[];
  agreesWithReporter: boolean;
}

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word (or whole-phrase) match, so "started" does not match the keyword "tar". */
function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeForRegex(keyword)}\\b`).test(text);
}

export function classifyByRules(reportedCategory: IncidentCategory, title: string, description: string): RuleClassification {
  const text = `${title} ${description}`.toLowerCase();
  let best: { category: IncidentCategory; matches: string[] } | null = null;
  for (const category of INCIDENT_CATEGORIES) {
    const matches = CATEGORY_KEYWORDS[category].filter((keyword) => containsKeyword(text, keyword));
    if (matches.length > 0 && (!best || matches.length > best.matches.length)) best = { category, matches };
  }
  if (!best) return { suggestedCategory: null, matchedKeywords: [], agreesWithReporter: true };

  // Prefer the reporter's choice when the text supports it at all.
  const reporterMatches = CATEGORY_KEYWORDS[reportedCategory].filter((keyword) => containsKeyword(text, keyword));
  if (reporterMatches.length > 0) {
    return { suggestedCategory: reportedCategory, matchedKeywords: reporterMatches, agreesWithReporter: true };
  }
  return { suggestedCategory: best.category, matchedKeywords: best.matches, agreesWithReporter: false };
}
