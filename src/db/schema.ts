import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { WorkoutStructure } from "@/lib/structure";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum("user_role", ["coach", "athlete"]);

// "strength" covers gym / strength-training sessions alongside the three
// triathlon disciplines. Add new sports here; downstream code must not assume
// exactly three sports.
export const sportEnum = pgEnum("sport", ["run", "bike", "swim", "strength"]);

export const unitSystemEnum = pgEnum("unit_system", ["metric", "imperial"]);

export const workoutStatusEnum = pgEnum("workout_status", [
  "planned",
  "completed",
]);

// Where a workout came from. "manual" = typed in by coach/athlete, "plan" =
// materialized from a training plan (Phase 2), the rest are ingestion sources
// (Phase 3+).
export const workoutSourceEnum = pgEnum("workout_source", [
  "manual",
  "plan",
  "fit_upload",
  "strava",
  "garmin",
  "apple_health",
]);

// ---------------------------------------------------------------------------
// Shared column helpers
// ---------------------------------------------------------------------------

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
  // Soft delete: rows with deletedAt set are excluded from normal queries.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

// ---------------------------------------------------------------------------
// Users & coach–athlete relationships
// ---------------------------------------------------------------------------

// No auth yet, but this table is shaped so Auth.js/Clerk can attach to it
// later (stable UUID id + unique email) without a refactor.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").unique(),
  role: userRoleEnum("role").notNull(),
  timezone: text("timezone").notNull().default("UTC"),
  units: unitSystemEnum("units").notNull().default("metric"),
  ...timestamps,
});

export const coachAthletes = pgTable(
  "coach_athletes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    coachId: uuid("coach_id")
      .notNull()
      .references(() => users.id),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (t) => [uniqueIndex("coach_athlete_unique").on(t.coachId, t.athleteId)],
);

export const periodizationPhaseEnum = pgEnum("periodization_phase", [
  "base",
  "build",
  "peak",
  "taper",
  "recovery",
  "race",
]);

// ---------------------------------------------------------------------------
// Training plans
// ---------------------------------------------------------------------------

// A plan is a reusable structure (weeks × sessions), independent of dates.
// isTemplate marks it as a library template; assigning a plan to an athlete
// pins it to a start date and materializes Workout rows.
export const trainingPlans = pgTable("training_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => users.id),
  isTemplate: boolean("is_template").notNull().default(false),
  ...timestamps,
});

export const planWeeks = pgTable(
  "plan_weeks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => trainingPlans.id),
    weekNumber: integer("week_number").notNull(), // 1-based
    phase: periodizationPhaseEnum("phase"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("plan_weeks_plan_idx").on(t.planId)],
);

export const plannedSessions = pgTable(
  "planned_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    weekId: uuid("week_id")
      .notNull()
      .references(() => planWeeks.id),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Monday … 6 = Sunday
    sport: sportEnum("sport").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    plannedDurationSec: integer("planned_duration_sec"),
    plannedDistanceM: integer("planned_distance_m"),
    // Structured workout (steps/repeats with intensity targets); see
    // src/lib/structure.ts for the schema.
    structure: jsonb("structure").$type<WorkoutStructure>(),
    ...timestamps,
  },
  (t) => [index("planned_sessions_week_idx").on(t.weekId)],
);

export const planAssignments = pgTable(
  "plan_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => trainingPlans.id),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id),
    assignedById: uuid("assigned_by_id").references(() => users.id),
    startDate: date("start_date").notNull(), // day that week 1 / day 0 lands on
    ...timestamps,
  },
  (t) => [index("plan_assignments_athlete_idx").on(t.athleteId)],
);

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

// One row per session, planned or completed. Planned and actual metrics are
// separate columns so a planned workout can be reconciled against synced data
// later without losing the prescription. All measures are SI: seconds,
// meters, watts.
export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id),
    createdById: uuid("created_by_id").references(() => users.id),
    sport: sportEnum("sport").notNull(),
    status: workoutStatusEnum("status").notNull().default("planned"),
    source: workoutSourceEnum("source").notNull().default("manual"),
    // Provider activity id once integrations land (Phase 3+).
    externalId: text("external_id"),
    // Trace back to the plan that materialized this workout (source: "plan").
    planAssignmentId: uuid("plan_assignment_id").references(
      () => planAssignments.id,
    ),
    plannedSessionId: uuid("planned_session_id").references(
      () => plannedSessions.id,
    ),
    title: text("title").notNull(),
    date: date("date").notNull(),
    // Prescription / instructions (what the coach wants done).
    description: text("description"),
    plannedDurationSec: integer("planned_duration_sec"),
    plannedDistanceM: integer("planned_distance_m"),
    // Structured workout prescription (see src/lib/structure.ts).
    structure: jsonb("structure").$type<WorkoutStructure>(),
    // Actuals, filled when completed.
    actualDurationSec: integer("actual_duration_sec"),
    actualDistanceM: integer("actual_distance_m"),
    avgHr: integer("avg_hr"),
    maxHr: integer("max_hr"),
    avgPowerW: integer("avg_power_w"),
    rpe: integer("rpe"), // 1–10
    load: integer("load"), // TSS-like training load
    notes: text("notes"), // athlete/coach post-workout notes
    ...timestamps,
  },
  (t) => [index("workouts_athlete_date_idx").on(t.athleteId, t.date)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CoachAthlete = typeof coachAthletes.$inferSelect;
export type Sport = (typeof sportEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type WorkoutStatus = (typeof workoutStatusEnum.enumValues)[number];
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type PlanWeek = typeof planWeeks.$inferSelect;
export type PlannedSession = typeof plannedSessions.$inferSelect;
export type PlanAssignment = typeof planAssignments.$inferSelect;
export type PeriodizationPhase =
  (typeof periodizationPhaseEnum.enumValues)[number];
