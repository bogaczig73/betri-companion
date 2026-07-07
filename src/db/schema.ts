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
  vector,
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
// Raw activities (ingested data before/after normalization)
// ---------------------------------------------------------------------------

export const providerEnum = pgEnum("provider", [
  "fit_upload",
  "strava",
  "garmin",
  "apple_health",
]);

// Raw payload from any ingestion source, kept so workouts can be reprocessed
// without re-syncing/re-uploading. externalId is the provider's activity id,
// or the file's SHA-256 for uploads (dedupe key per athlete+provider).
export const rawActivities = pgTable(
  "raw_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id),
    uploadedById: uuid("uploaded_by_id").references(() => users.id),
    provider: providerEnum("provider").notNull(),
    externalId: text("external_id").notNull(),
    fileName: text("file_name"),
    payload: jsonb("payload").notNull(),
    // Set once normalized into a workout.
    workoutId: uuid("workout_id").references(() => workouts.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("raw_activities_dedupe").on(
      t.athleteId,
      t.provider,
      t.externalId,
    ),
    index("raw_activities_athlete_idx").on(t.athleteId),
  ],
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

// ---------------------------------------------------------------------------
// Chat (coach ↔ athlete)
// ---------------------------------------------------------------------------

// One thread per coach–athlete pair, created lazily on first visit. Keeping
// coach/athlete as explicit columns (rather than a generic participants table)
// matches the product model; group chat would be a new table, not a refactor
// of this one.
export const chatThreads = pgTable(
  "chat_threads",
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
  (t) => [uniqueIndex("chat_threads_pair_unique").on(t.coachId, t.athleteId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("messages_thread_created_idx").on(t.threadId, t.createdAt)],
);

// A message can @-mention one or more of the athlete's workouts; mentioned
// workouts render as inline cards in the chat.
export const messageWorkoutMentions = pgTable(
  "message_workout_mentions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id),
    workoutId: uuid("workout_id")
      .notNull()
      .references(() => workouts.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("message_workout_mentions_unique").on(t.messageId, t.workoutId),
  ],
);

// ---------------------------------------------------------------------------
// Lactate testing
// ---------------------------------------------------------------------------

// An incremental step (graded exercise) test for one athlete in one sport.
// Threshold estimation happens in the pure engine at src/lib/lactate; nothing
// is precomputed here — the stored steps are the source of truth so results can
// be re-derived if methods change. Baseline (resting/warm-up) is stored on the
// test and optionally fed into the curve fit.
export const lactateTests = pgTable(
  "lactate_tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    athleteId: uuid("athlete_id")
      .notNull()
      .references(() => users.id),
    conductedById: uuid("conducted_by_id").references(() => users.id),
    // Only run | bike | swim have a meaningful lactate protocol; enforced in
    // the action layer, not the enum (which also carries "strength").
    sport: sportEnum("sport").notNull(),
    // Set when the samples were taken during a workout (field test); the
    // workout page then embeds this test's steps + analysis inline.
    workoutId: uuid("workout_id").references(() => workouts.id),
    testDate: date("test_date").notNull(),
    title: text("title"),
    notes: text("notes"),
    // Baseline point. intensityValue is sport-native: watts (bike) or seconds
    // per km / per 100m (run / swim), matching lactate_steps.intensity_value.
    baselineLactate: integer("baseline_lactate_milli"), // mmol/L × 1000
    baselineIntensityValue: integer("baseline_intensity_value"),
    includeBaseline: boolean("include_baseline").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("lactate_tests_athlete_idx").on(t.athleteId, t.testDate),
    index("lactate_tests_workout_idx").on(t.workoutId),
  ],
);

// One stage of the protocol. intensityValue is the recorded, sport-native
// intensity: integer watts for bike, integer seconds (per km / per 100m) for
// run / swim. Lactate is stored as milli-mmol/L (×1000) to keep an integer
// column while preserving two decimals.
export const lactateSteps = pgTable(
  "lactate_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testId: uuid("test_id")
      .notNull()
      .references(() => lactateTests.id),
    stageNumber: integer("stage_number").notNull(), // 1-based, ascending effort
    intensityValue: integer("intensity_value"),
    lactate: integer("lactate_milli"), // mmol/L × 1000
    heartRate: integer("heart_rate"),
    durationSec: integer("duration_sec"),
    ...timestamps,
  },
  (t) => [index("lactate_steps_test_idx").on(t.testId, t.stageNumber)],
);

// ---------------------------------------------------------------------------
// Science paper library (Phase 6)
// ---------------------------------------------------------------------------

// Pipeline state for a paper: "processing" while the PDF is being registered
// with the Anthropic Files API and metadata is being extracted, "ready" once
// usable in analysis, "failed" with statusMessage set (reprocessable).
export const paperStatusEnum = pgEnum("paper_status", [
  "processing",
  "ready",
  "failed",
]);

// One uploaded training-science PDF. The original lives in Vercel Blob
// (private store, served through an authenticated route); anthropicFileId is
// the same document registered with the Anthropic Files API so analysis calls
// can attach it natively with citations. Metadata (title/authors/abstract) is
// extracted by the model at upload time and is editable later. The library is
// shared across all users; sha256 is the global dedupe key.
export const sciencePapers = pgTable(
  "science_papers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id),
    title: text("title").notNull(), // falls back to filename until extracted
    authors: text("authors"), // free-form, comma-separated
    year: integer("year"),
    journal: text("journal"),
    abstract: text("abstract"),
    fileName: text("file_name").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    blobPathname: text("blob_pathname").notNull(),
    blobUrl: text("blob_url").notNull(),
    anthropicFileId: text("anthropic_file_id"),
    status: paperStatusEnum("status").notNull().default("processing"),
    statusMessage: text("status_message"),
    ...timestamps,
  },
  (t) => [uniqueIndex("science_papers_sha256_unique").on(t.sha256)],
);

// Dormant until the library outgrows catalog-based selection (~30–50 papers):
// chunked paper text with pgvector embeddings for similarity retrieval. The
// retrieval interface in src/lib/papers.ts is written so switching from
// catalog selection to embeddings is a data backfill, not a redesign.
export const paperChunks = pgTable(
  "paper_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paperId: uuid("paper_id")
      .notNull()
      .references(() => sciencePapers.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("paper_chunks_paper_chunk_unique").on(t.paperId, t.chunkIndex),
  ],
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
export type RawActivity = typeof rawActivities.$inferSelect;
export type Provider = (typeof providerEnum.enumValues)[number];
export type ChatThread = typeof chatThreads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageWorkoutMention = typeof messageWorkoutMentions.$inferSelect;
export type LactateTest = typeof lactateTests.$inferSelect;
export type LactateStep = typeof lactateSteps.$inferSelect;
export type SciencePaper = typeof sciencePapers.$inferSelect;
export type PaperStatus = (typeof paperStatusEnum.enumValues)[number];
export type PaperChunk = typeof paperChunks.$inferSelect;
