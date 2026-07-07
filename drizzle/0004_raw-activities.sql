CREATE TYPE "public"."provider" AS ENUM('fit_upload', 'strava', 'garmin', 'apple_health');--> statement-breakpoint
CREATE TABLE "raw_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"uploaded_by_id" uuid,
	"provider" "provider" NOT NULL,
	"external_id" text NOT NULL,
	"file_name" text,
	"payload" jsonb NOT NULL,
	"workout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "raw_activities" ADD CONSTRAINT "raw_activities_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_activities" ADD CONSTRAINT "raw_activities_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_activities" ADD CONSTRAINT "raw_activities_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "raw_activities_dedupe" ON "raw_activities" USING btree ("athlete_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "raw_activities_athlete_idx" ON "raw_activities" USING btree ("athlete_id");