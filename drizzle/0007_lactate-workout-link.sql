ALTER TABLE "lactate_tests" ADD COLUMN "workout_id" uuid;--> statement-breakpoint
ALTER TABLE "lactate_tests" ADD CONSTRAINT "lactate_tests_workout_id_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."workouts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lactate_tests_workout_idx" ON "lactate_tests" USING btree ("workout_id");