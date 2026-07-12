CREATE TYPE "public"."race_type" AS ENUM('sprint', 'olympic', 'half_ironman', 'ironman');--> statement-breakpoint
ALTER TABLE "training_plans" ADD COLUMN "race_date" date;--> statement-breakpoint
ALTER TABLE "training_plans" ADD COLUMN "race_type" "race_type";--> statement-breakpoint
ALTER TABLE "training_plans" ADD COLUMN "generator_params" jsonb;