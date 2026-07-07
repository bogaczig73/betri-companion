CREATE TYPE "public"."workout_source" AS ENUM('manual', 'plan', 'fit_upload', 'strava', 'garmin', 'apple_health');--> statement-breakpoint
CREATE TYPE "public"."workout_status" AS ENUM('planned', 'completed');--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"created_by_id" uuid,
	"sport" "sport" NOT NULL,
	"status" "workout_status" DEFAULT 'planned' NOT NULL,
	"source" "workout_source" DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"title" text NOT NULL,
	"date" date NOT NULL,
	"description" text,
	"planned_duration_sec" integer,
	"planned_distance_m" integer,
	"actual_duration_sec" integer,
	"actual_distance_m" integer,
	"avg_hr" integer,
	"max_hr" integer,
	"avg_power_w" integer,
	"rpe" integer,
	"load" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workouts_athlete_date_idx" ON "workouts" USING btree ("athlete_id","date");