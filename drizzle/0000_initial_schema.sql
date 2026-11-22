CREATE TYPE "public"."actor_kind" AS ENUM('system', 'citizen', 'coordinator', 'crew');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'completed', 'failed', 'not_configured');--> statement-breakpoint
CREATE TYPE "public"."asset_importance" AS ENUM('standard', 'important', 'critical');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('hospital', 'school', 'water_pumping_station', 'substation', 'bridge', 'major_intersection', 'emergency_facility');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('proposed', 'assigned', 'accepted', 'in_progress', 'completed', 'verified', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."crew_specialization" AS ENUM('road_maintenance', 'water_infrastructure', 'drainage', 'electrical', 'general_maintenance', 'structural_inspection');--> statement-breakpoint
CREATE TYPE "public"."crew_status" AS ENUM('available', 'unavailable', 'off_shift');--> statement-breakpoint
CREATE TYPE "public"."duplicate_decision" AS ENUM('confirmed', 'rejected', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."duplicate_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."exposure_level" AS ENUM('low', 'moderate', 'high');--> statement-breakpoint
CREATE TYPE "public"."image_kind" AS ENUM('report', 'completion');--> statement-breakpoint
CREATE TYPE "public"."incident_category" AS ENUM('pothole', 'water_leak', 'blocked_drain', 'flooding', 'structural', 'streetlight', 'exposed_electrical', 'sidewalk', 'illegal_dumping', 'other');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('submitted', 'awaiting_review', 'verified', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."observation_source" AS ENUM('reporter', 'coordinator', 'crew');--> statement-breakpoint
CREATE TYPE "public"."priority_band" AS ENUM('critical', 'high', 'moderate', 'low', 'awaiting_review');--> statement-breakpoint
CREATE TYPE "public"."reported_duration" AS ENUM('unknown', 'today', 'days', 'weeks', 'longer');--> statement-breakpoint
CREATE TYPE "public"."severity_level" AS ENUM('low', 'moderate', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('coordinator', 'crew');--> statement-breakpoint
CREATE TABLE "ai_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"succeeded" boolean NOT NULL,
	"model" text NOT NULL,
	"included_image" boolean NOT NULL,
	"result" jsonb,
	"error_code" text,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"incident_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"crew_id" uuid NOT NULL,
	"status" "assignment_status" NOT NULL,
	"rationale" jsonb NOT NULL,
	"decline_reason" text,
	"completion_notes" text,
	"assistance_requested" boolean DEFAULT false NOT NULL,
	"assistance_note" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"crew_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "crew_members_crew_id_user_id_pk" PRIMARY KEY("crew_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_incident_id" uuid NOT NULL,
	"later_incident_id" uuid NOT NULL,
	"score" real NOT NULL,
	"distance_meters" real NOT NULL,
	"hours_apart" real NOT NULL,
	"components" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"status" "duplicate_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_candidates_distinct" CHECK ("duplicate_candidates"."primary_incident_id" <> "duplicate_candidates"."later_incident_id")
);
--> statement-breakpoint
CREATE TABLE "duplicate_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"decision" "duplicate_decision" NOT NULL,
	"reason" text,
	"reviewer_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"kind" "image_kind" NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incident_images_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "incident_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"source" "observation_source" NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"from_status" "incident_status",
	"to_status" "incident_status" NOT NULL,
	"reason" text,
	"actor_kind" "actor_kind" NOT NULL,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"tracking_token_hash" text NOT NULL,
	"submission_key" uuid NOT NULL,
	"category" "incident_category" NOT NULL,
	"reported_category" "incident_category" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"address" text,
	"obstructs_access" boolean,
	"reported_duration" "reported_duration" DEFAULT 'unknown' NOT NULL,
	"status" "incident_status" DEFAULT 'submitted' NOT NULL,
	"priority_band" "priority_band" DEFAULT 'awaiting_review' NOT NULL,
	"priority_score" real,
	"priority_overridden" boolean DEFAULT false NOT NULL,
	"confirmed_severity" "severity_level",
	"exposure_level" "exposure_level",
	"duplicate_of_id" uuid,
	"analysis_status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_reference_unique" UNIQUE("reference"),
	CONSTRAINT "incidents_tracking_token_hash_unique" UNIQUE("tracking_token_hash"),
	CONSTRAINT "incidents_submission_key_unique" UNIQUE("submission_key"),
	CONSTRAINT "incidents_latitude_range" CHECK ("incidents"."latitude" between -90 and 90),
	CONSTRAINT "incidents_longitude_range" CHECK ("incidents"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "infrastructure_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"asset_type" "asset_type" NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"importance" "asset_importance" DEFAULT 'standard' NOT NULL,
	"source" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infrastructure_assets_latitude_range" CHECK ("infrastructure_assets"."latitude" between -90 and 90),
	CONSTRAINT "infrastructure_assets_longitude_range" CHECK ("infrastructure_assets"."longitude" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "maintenance_crews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"specialization" "crew_specialization" NOT NULL,
	"status" "crew_status" DEFAULT 'available' NOT NULL,
	"base_label" text NOT NULL,
	"base_latitude" double precision NOT NULL,
	"base_longitude" double precision NOT NULL,
	"capacity" integer DEFAULT 2 NOT NULL,
	"shift_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_crews_capacity_range" CHECK ("maintenance_crews"."capacity" between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "priority_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"score" real,
	"band" "priority_band" NOT NULL,
	"factors" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"limitations" jsonb NOT NULL,
	"is_override" boolean DEFAULT false NOT NULL,
	"override_reason" text,
	"previous_band" "priority_band",
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "reporter_contacts" (
	"incident_id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"is_evaluation" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_crew_id_maintenance_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."maintenance_crews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_assignments" ADD CONSTRAINT "crew_assignments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_crew_id_maintenance_crews_id_fk" FOREIGN KEY ("crew_id") REFERENCES "public"."maintenance_crews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_primary_incident_id_incidents_id_fk" FOREIGN KEY ("primary_incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_candidates" ADD CONSTRAINT "duplicate_candidates_later_incident_id_incidents_id_fk" FOREIGN KEY ("later_incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_candidate_id_duplicate_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."duplicate_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_reviews" ADD CONSTRAINT "duplicate_reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_images" ADD CONSTRAINT "incident_images_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_images" ADD CONSTRAINT "incident_images_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_observations" ADD CONSTRAINT "incident_observations_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_observations" ADD CONSTRAINT "incident_observations_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_status_history" ADD CONSTRAINT "incident_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructure_assets" ADD CONSTRAINT "infrastructure_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_crews" ADD CONSTRAINT "maintenance_crews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_updates" ADD CONSTRAINT "public_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_updates" ADD CONSTRAINT "public_updates_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporter_contacts" ADD CONSTRAINT "reporter_contacts_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_analyses_incident_idx" ON "ai_analyses" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "audit_events_incident_idx" ON "audit_events" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_created_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crew_assignments_crew_idx" ON "crew_assignments" USING btree ("crew_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crew_assignments_one_active_idx" ON "crew_assignments" USING btree ("incident_id") WHERE "crew_assignments"."status" in ('proposed', 'assigned', 'accepted', 'in_progress', 'completed');--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_candidates_pair_idx" ON "duplicate_candidates" USING btree ("primary_incident_id","later_incident_id");--> statement-breakpoint
CREATE INDEX "duplicate_candidates_status_idx" ON "duplicate_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incident_images_incident_idx" ON "incident_images" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_observations_incident_idx" ON "incident_observations" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_status_history_incident_idx" ON "incident_status_history" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "incidents_location_idx" ON "incidents" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "incidents_priority_idx" ON "incidents" USING btree ("priority_band");--> statement-breakpoint
CREATE INDEX "incidents_created_idx" ON "incidents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "infrastructure_assets_location_idx" ON "infrastructure_assets" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_crews_name_idx" ON "maintenance_crews" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "priority_assessments_incident_idx" ON "priority_assessments" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE INDEX "public_updates_incident_idx" ON "public_updates" USING btree ("incident_id");