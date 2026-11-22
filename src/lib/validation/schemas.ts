import { z } from "zod";
import { CREW_SPECIALIZATIONS, INCIDENT_CATEGORIES } from "@/lib/domain/categories";
import {
  ASSET_IMPORTANCE,
  ASSET_TYPES,
  CREW_STATUSES,
  EXPOSURE_LEVELS,
  INCIDENT_STATUSES,
  PRIORITY_BANDS,
  REPORTED_DURATIONS,
  SEVERITY_LEVELS,
} from "@/lib/domain/types";
import { AppError } from "@/lib/errors";

/** Removes control characters and trims; HTML is escaped by React at render time. */
const cleanText = (value: string): string =>
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .transform(cleanText)
    .pipe(
      z
        .string()
        .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
        .max(max, `${label} must be at most ${max} characters.`),
    );

const optionalText = (max: number, label: string) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().max(max, `${label} must be at most ${max} characters.`))
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null);

const latitude = z.coerce
  .number({ error: "Select a location on the map." })
  .min(-90, "Latitude must be between -90 and 90.")
  .max(90, "Latitude must be between -90 and 90.");
const longitude = z.coerce
  .number({ error: "Select a location on the map." })
  .min(-180, "Longitude must be between -180 and 180.")
  .max(180, "Longitude must be between -180 and 180.");

const formBoolean = z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean());

export const reportSchema = z
  .object({
    submissionKey: z.uuid("The form session is invalid. Reload the page and try again."),
    category: z.enum(INCIDENT_CATEGORIES, "Choose an incident category."),
    title: text(5, 120, "Title"),
    description: text(20, 2000, "Description"),
    latitude,
    longitude,
    address: optionalText(200, "Address"),
    obstructsAccess: z.enum(["yes", "no", "unsure"]).default("unsure"),
    reportedDuration: z.enum(REPORTED_DURATIONS).default("unknown"),
    anonymous: formBoolean,
    reporterName: optionalText(100, "Name"),
    reporterEmail: z
      .union([z.literal(""), z.email("Enter a valid email address.")])
      .nullish()
      .transform((value) => value || null),
    reporterPhone: optionalText(30, "Phone number"),
    consent: formBoolean.refine((value) => value, "You must acknowledge the privacy notice to submit a report."),
  })
  .refine((value) => !(value.latitude === 0 && value.longitude === 0), {
    path: ["latitude"],
    message: "Select a location on the map.",
  });
export type ReportInput = z.infer<typeof reportSchema>;

export const trackingLookupSchema = z.object({
  reference: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.string().regex(/^CIV-[0-9A-Z]{8}$/, "Enter the reference in the form CIV-XXXXXXXX.")),
  accessCode: z
    .string()
    .transform((value) => value.trim().toUpperCase().replace(/[\s-]/g, ""))
    .pipe(z.string().regex(/^[0-9A-Z]{20}$/, "Enter the 20-character access code you were given.")),
});

export const reporterInformationSchema = trackingLookupSchema.extend({
  body: text(10, 1000, "Additional information"),
});

const version = z.coerce.number().int().positive();
const reason = text(10, 500, "Reason");

export const classificationSchema = z.object({
  incidentId: z.uuid(),
  version,
  category: z.enum(INCIDENT_CATEGORIES),
  confirmedSeverity: z.union([z.enum(SEVERITY_LEVELS), z.literal("")]).transform((value) => value || null),
  exposureLevel: z.union([z.enum(EXPOSURE_LEVELS), z.literal("")]).transform((value) => value || null),
});

export const statusChangeSchema = z.object({
  incidentId: z.uuid(),
  version,
  toStatus: z.enum(INCIDENT_STATUSES),
  reason: optionalText(500, "Reason"),
});

export const priorityOverrideSchema = z.object({
  incidentId: z.uuid(),
  version,
  band: z.enum(PRIORITY_BANDS.filter((band) => band !== "awaiting_review") as ["critical", "high", "moderate", "low"]),
  reason,
});

export const noteSchema = z.object({ incidentId: z.uuid(), body: text(3, 2000, "Note") });
export const publicUpdateSchema = z.object({ incidentId: z.uuid(), body: text(10, 1000, "Update") });

export const duplicateReviewSchema = z.object({
  candidateId: z.uuid(),
  decision: z.enum(["confirmed", "rejected", "reopened"]),
  reason: optionalText(500, "Reason"),
});

export const crewSchema = z.object({
  name: text(2, 80, "Crew name"),
  specialization: z.enum(CREW_SPECIALIZATIONS),
  status: z.enum(CREW_STATUSES),
  baseLabel: text(2, 120, "Operating base"),
  baseLatitude: latitude,
  baseLongitude: longitude,
  capacity: z.coerce.number().int().min(1, "Capacity must be at least 1.").max(20, "Capacity must be at most 20."),
  shiftNotes: optionalText(300, "Shift notes"),
});
export type CrewInput = z.infer<typeof crewSchema>;

export const assetSchema = z.object({
  name: text(2, 120, "Asset name"),
  assetType: z.enum(ASSET_TYPES),
  latitude,
  longitude,
  importance: z.enum(ASSET_IMPORTANCE),
  source: text(3, 300, "Source"),
  verified: formBoolean,
  notes: optionalText(500, "Notes"),
});
export type AssetInput = z.infer<typeof assetSchema>;

export const assignmentCreateSchema = z.object({
  incidentId: z.uuid(),
  crewId: z.uuid(),
  origin: z.enum(["recommendation", "manual", "plan"]),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password.").max(200),
});

/** Parses input, converting failures into a user-facing validation error with per-field messages. */
export function parseOrThrow<Schema extends z.ZodType>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "form";
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "The submitted information is invalid.";
  throw new AppError("validation", first, fieldErrors);
}

export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
