ALTER TABLE "workouts" ADD COLUMN "hr_histogram" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "power_histogram" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "speed_histogram" jsonb;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "time_in_zones" jsonb;