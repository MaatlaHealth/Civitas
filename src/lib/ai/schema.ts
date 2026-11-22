import { z } from "zod";
import { INCIDENT_CATEGORIES } from "@/lib/domain/categories";

const shortList = z.array(z.string().trim().min(1).max(300)).max(8);

/**
 * The only shape Civitas accepts from the language model. Anything else is
 * treated as a failed analysis. Confidence is a coarse label on purpose: the
 * model is not asked for, and is not trusted to give, numeric probabilities.
 */
export const aiAnalysisSchema = z.object({
  category: z.enum(INCIDENT_CATEGORIES),
  observations: shortList,
  descriptionConsistency: z.enum(["consistent", "partially_consistent", "inconsistent", "not_assessable"]),
  possibleHazards: shortList,
  imageQuality: z.enum(["good", "fair", "poor", "no_image"]),
  missingInformation: shortList,
  reviewQuestions: shortList,
  confidence: z.enum(["low", "medium", "high"]),
  requiresHumanReview: z.boolean(),
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

/** The same shape expressed in the JSON-schema subset the Gemini API accepts. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING", enum: [...INCIDENT_CATEGORIES] },
    observations: { type: "ARRAY", items: { type: "STRING" } },
    descriptionConsistency: {
      type: "STRING",
      enum: ["consistent", "partially_consistent", "inconsistent", "not_assessable"],
    },
    possibleHazards: { type: "ARRAY", items: { type: "STRING" } },
    imageQuality: { type: "STRING", enum: ["good", "fair", "poor", "no_image"] },
    missingInformation: { type: "ARRAY", items: { type: "STRING" } },
    reviewQuestions: { type: "ARRAY", items: { type: "STRING" } },
    confidence: { type: "STRING", enum: ["low", "medium", "high"] },
    requiresHumanReview: { type: "BOOLEAN" },
  },
  required: [
    "category",
    "observations",
    "descriptionConsistency",
    "possibleHazards",
    "imageQuality",
    "missingInformation",
    "reviewQuestions",
    "confidence",
    "requiresHumanReview",
  ],
} as const;
