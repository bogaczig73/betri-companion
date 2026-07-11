CREATE TYPE "public"."threshold_source" AS ENUM('manual', 'lactate_test', 'import');--> statement-breakpoint
CREATE TABLE "athlete_thresholds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"set_by_id" uuid,
	"source" "threshold_source" DEFAULT 'manual' NOT NULL,
	"lactate_test_id" uuid,
	"effective_date" date NOT NULL,
	"max_hr" integer,
	"ftp_w" integer,
	"bike_lthr" integer,
	"bike_lt1_w" integer,
	"run_threshold_pace_sec_per_km" integer,
	"run_lthr" integer,
	"run_threshold_power_w" integer,
	"run_lt1_pace_sec_per_km" integer,
	"css_pace_sec_per_100m" integer,
	"swim_lthr" integer,
	"zone_overrides" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "athlete_thresholds" ADD CONSTRAINT "athlete_thresholds_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_thresholds" ADD CONSTRAINT "athlete_thresholds_set_by_id_users_id_fk" FOREIGN KEY ("set_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_thresholds" ADD CONSTRAINT "athlete_thresholds_lactate_test_id_lactate_tests_id_fk" FOREIGN KEY ("lactate_test_id") REFERENCES "public"."lactate_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_thresholds_athlete_date_idx" ON "athlete_thresholds" USING btree ("athlete_id","effective_date");