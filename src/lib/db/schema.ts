import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { CREW_SPECIALIZATIONS, INCIDENT_CATEGORIES } from "@/lib/domain/categories";
import {
  ASSET_IMPORTANCE,
  ASSET_TYPES,
  ASSIGNMENT_STATUSES,
  CREW_STATUSES,
  EXPOSURE_LEVELS,
  INCIDENT_STATUSES,
  PRIORITY_BANDS,
  REPORTED_DURATIONS,
  SEVERITY_LEVELS,
  USER_ROLES,
} from "@/lib/domain/types";
import type { AiAnalysis } from "@/lib/ai/schema";
import type { DuplicateComponents } from "@/lib/engines/duplicates";
import type { PriorityFactor } from "@/lib/engines/priority";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => timestamptz("created_at").notNull().defaultNow();

export const incidentCategoryEnum = pgEnum("incident_category", INCIDENT_CATEGORIES);
export const incidentStatusEnum = pgEnum("incident_status", INCIDENT_STATUSES);
export const priorityBandEnum = pgEnum("priority_band", PRIORITY_BANDS);
export const severityLevelEnum = pgEnum("severity_level", SEVERITY_LEVELS);
export const exposureLevelEnum = pgEnum("exposure_level", EXPOSURE_LEVELS);
export const reportedDurationEnum = pgEnum("reported_duration", REPORTED_DURATIONS);
export const userRoleEnum = pgEnum("user_role", USER_ROLES);
export const analysisStatusEnum = pgEnum("analysis_status", ["pending", "completed", "failed", "not_configured"]);
export const imageKindEnum = pgEnum("image_kind", ["report", "completion"]);
export const observationSourceEnum = pgEnum("observation_source", ["reporter", "coordinator", "crew"]);
export const duplicateStatusEnum = pgEnum("duplicate_status", ["pending", "confirmed", "rejected"]);
export const duplicateDecisionEnum = pgEnum("duplicate_decision", ["confirmed", "rejected", "reopened"]);
export const assetTypeEnum = pgEnum("asset_type", ASSET_TYPES);
export const assetImportanceEnum = pgEnum("asset_importance", ASSET_IMPORTANCE);
export const crewSpecializationEnum = pgEnum("crew_specialization", CREW_SPECIALIZATIONS);
export const crewStatusEnum = pgEnum("crew_status", CREW_STATUSES);
export const assignmentStatusEnum = pgEnum("assignment_status", ASSIGNMENT_STATUSES);
export const actorKindEnum = pgEnum("actor_kind", ["system", "citizen", "coordinator", "crew"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  /** Evaluation accounts are labelled in the interface. */
  isEvaluation: boolean("is_evaluation").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    /** Public, random, non-sequential reference such as CIV-7K2M9QXD. */
    reference: text("reference").notNull().unique(),
    /** SHA-256 of the citizen's access code. The code itself is never stored. */
    trackingTokenHash: text("tracking_token_hash").notNull().unique(),
    /** Client-generated key that makes a retried submission idempotent. */
    submissionKey: uuid("submission_key").notNull().unique(),
    category: incidentCategoryEnum("category").notNull(),
    reportedCategory: incidentCategoryEnum("reported_category").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    address: text("address"),
    obstructsAccess: boolean("obstructs_access"),
    reportedDuration: reportedDurationEnum("reported_duration").notNull().default("unknown"),
    status: incidentStatusEnum("status").notNull().default("submitted"),
    priorityBand: priorityBandEnum("priority_band").notNull().default("awaiting_review"),
    priorityScore: real("priority_score"),
    priorityOverridden: boolean("priority_overridden").notNull().default(false),
    confirmedSeverity: severityLevelEnum("confirmed_severity"),
    exposureLevel: exposureLevelEnum("exposure_level"),
    /** Set when a coordinator confirms this report duplicates an earlier one. */
    duplicateOfId: uuid("duplicate_of_id"),
    analysisStatus: analysisStatusEnum("analysis_status").notNull().default("pending"),
    /** Incremented on every update; used for optimistic concurrency control. */
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("incidents_location_idx").on(table.latitude, table.longitude),
    index("incidents_status_idx").on(table.status),
    index("incidents_priority_idx").on(table.priorityBand),
    index("incidents_created_idx").on(table.createdAt),
    check("incidents_latitude_range", sql`${table.latitude} between -90 and 90`),
    check("incidents_longitude_range", sql`${table.longitude} between -180 and 180`),
  ],
);

/** Personal information is kept apart from the incident so it can be erased independently. */
export const reporterContacts = pgTable("reporter_contacts", {
  incidentId: uuid("incident_id").primaryKey().references(() => incidents.id, { onDelete: "cascade" }),
  name: text("name"),
  email: text("email"),
  phone: text("phone"),
  createdAt: createdAt(),
});

export const incidentImages = pgTable(
  "incident_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    kind: imageKindEnum("kind").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    contentType: text("content_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index("incident_images_incident_idx").on(table.incidentId)],
);

export const aiAnalyses = pgTable(
  "ai_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    succeeded: boolean("succeeded").notNull(),
    model: text("model").notNull(),
    includedImage: boolean("included_image").notNull(),
    result: jsonb("result").$type<AiAnalysis>(),
    errorCode: text("error_code"),
    durationMs: integer("duration_ms").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("ai_analyses_incident_idx").on(table.incidentId)],
);

/** Internal notes, additional information from the reporter, and crew field notes. */
export const incidentObservations = pgTable(
  "incident_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    source: observationSourceEnum("source").notNull(),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index("incident_observations_incident_idx").on(table.incidentId)],
);

export const duplicateCandidates = pgTable(
  "duplicate_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The earlier report of the pair. */
    primaryIncidentId: uuid("primary_incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    /** The later report of the pair. */
    laterIncidentId: uuid("later_incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    score: real("score").notNull(),
    distanceMeters: real("distance_meters").notNull(),
    hoursApart: real("hours_apart").notNull(),
    components: jsonb("components").$type<DuplicateComponents>().notNull(),
    explanation: text("explanation").notNull(),
    status: duplicateStatusEnum("status").notNull().default("pending"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("duplicate_candidates_pair_idx").on(table.primaryIncidentId, table.laterIncidentId),
    index("duplicate_candidates_status_idx").on(table.status),
    check("duplicate_candidates_distinct", sql`${table.primaryIncidentId} <> ${table.laterIncidentId}`),
  ],
);

export const duplicateReviews = pgTable("duplicate_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  candidateId: uuid("candidate_id").notNull().references(() => duplicateCandidates.id, { onDelete: "cascade" }),
  decision: duplicateDecisionEnum("decision").notNull(),
  reason: text("reason"),
  reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const infrastructureAssets = pgTable(
  "infrastructure_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    assetType: assetTypeEnum("asset_type").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    importance: assetImportanceEnum("importance").notNull().default("standard"),
    /** Where this record came from, entered by the person registering it. */
    source: text("source").notNull(),
    verified: boolean("verified").notNull().default(false),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("infrastructure_assets_location_idx").on(table.latitude, table.longitude),
    check("infrastructure_assets_latitude_range", sql`${table.latitude} between -90 and 90`),
    check("infrastructure_assets_longitude_range", sql`${table.longitude} between -180 and 180`),
  ],
);

export const priorityAssessments = pgTable(
  "priority_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    score: real("score"),
    band: priorityBandEnum("band").notNull(),
    factors: jsonb("factors").$type<PriorityFactor[]>().notNull(),
    explanation: text("explanation").notNull(),
    limitations: jsonb("limitations").$type<string[]>().notNull(),
    isOverride: boolean("is_override").notNull().default(false),
    overrideReason: text("override_reason"),
    previousBand: priorityBandEnum("previous_band"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index("priority_assessments_incident_idx").on(table.incidentId, table.createdAt)],
);

export const maintenanceCrews = pgTable(
  "maintenance_crews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    name: text("name").notNull(),
    specialization: crewSpecializationEnum("specialization").notNull(),
    status: crewStatusEnum("status").notNull().default("available"),
    baseLabel: text("base_label").notNull(),
    baseLatitude: doublePrecision("base_latitude").notNull(),
    baseLongitude: doublePrecision("base_longitude").notNull(),
    capacity: integer("capacity").notNull().default(2),
    shiftNotes: text("shift_notes"),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("maintenance_crews_name_idx").on(table.organizationId, table.name),
    check("maintenance_crews_capacity_range", sql`${table.capacity} between 1 and 20`),
  ],
);

export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: uuid("crew_id").notNull().references(() => maintenanceCrews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.crewId, table.userId] })],
);

export interface AssignmentRationale {
  reasons: string[];
  straightLineKm: number;
  travelMinutes: number;
  queuePosition: number;
  /** "recommendation" when the coordinator took the engine's top-ranked crew. */
  origin: "recommendation" | "manual" | "plan";
}

export const crewAssignments = pgTable(
  "crew_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    crewId: uuid("crew_id").notNull().references(() => maintenanceCrews.id),
    status: assignmentStatusEnum("status").notNull(),
    rationale: jsonb("rationale").$type<AssignmentRationale>().notNull(),
    declineReason: text("decline_reason"),
    completionNotes: text("completion_notes"),
    assistanceRequested: boolean("assistance_requested").notNull().default(false),
    assistanceNote: text("assistance_note"),
    createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("crew_assignments_crew_idx").on(table.crewId, table.status),
    // At most one live assignment per incident.
    uniqueIndex("crew_assignments_one_active_idx")
      .on(table.incidentId)
      .where(sql`${table.status} in ('proposed', 'assigned', 'accepted', 'in_progress', 'completed')`),
  ],
);

export const incidentStatusHistory = pgTable(
  "incident_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    fromStatus: incidentStatusEnum("from_status"),
    toStatus: incidentStatusEnum("to_status").notNull(),
    reason: text("reason"),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index("incident_status_history_incident_idx").on(table.incidentId, table.createdAt)],
);

export const publicUpdates = pgTable(
  "public_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    incidentId: uuid("incident_id").notNull().references(() => incidents.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    authorUserId: uuid("author_user_id").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (table) => [index("public_updates_incident_idx").on(table.incidentId)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull().references(() => organizations.id),
    actorKind: actorKindEnum("actor_kind").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    /** For incident-related events, the incident the event belongs to. */
    incidentId: uuid("incident_id"),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_events_incident_idx").on(table.incidentId, table.createdAt),
    index("audit_events_created_idx").on(table.createdAt),
  ],
);

/** Fixed-window request counters used for rate limiting across serverless instances. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamptz("window_start").notNull(),
    count: integer("count").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.bucket, table.windowStart] })],
);

export type Incident = typeof incidents.$inferSelect;
export type MaintenanceCrew = typeof maintenanceCrews.$inferSelect;
export type InfrastructureAsset = typeof infrastructureAssets.$inferSelect;
export type CrewAssignment = typeof crewAssignments.$inferSelect;
export type User = typeof users.$inferSelect;
