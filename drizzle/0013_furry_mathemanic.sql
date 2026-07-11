CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_id" uuid NOT NULL,
	"sport" "sport" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"planned_duration_sec" integer,
	"planned_distance_m" integer,
	"structure" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workout_templates_creator_idx" ON "workout_templates" USING btree ("created_by_id");