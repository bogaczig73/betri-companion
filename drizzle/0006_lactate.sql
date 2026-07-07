CREATE TABLE "lactate_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"stage_number" integer NOT NULL,
	"intensity_value" integer,
	"lactate_milli" integer,
	"heart_rate" integer,
	"duration_sec" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lactate_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"conducted_by_id" uuid,
	"sport" "sport" NOT NULL,
	"test_date" date NOT NULL,
	"title" text,
	"notes" text,
	"baseline_lactate_milli" integer,
	"baseline_intensity_value" integer,
	"include_baseline" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "lactate_steps" ADD CONSTRAINT "lactate_steps_test_id_lactate_tests_id_fk" FOREIGN KEY ("test_id") REFERENCES "public"."lactate_tests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lactate_tests" ADD CONSTRAINT "lactate_tests_athlete_id_users_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lactate_tests" ADD CONSTRAINT "lactate_tests_conducted_by_id_users_id_fk" FOREIGN KEY ("conducted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lactate_steps_test_idx" ON "lactate_steps" USING btree ("test_id","stage_number");--> statement-breakpoint
CREATE INDEX "lactate_tests_athlete_idx" ON "lactate_tests" USING btree ("athlete_id","test_date");