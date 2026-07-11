"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { lactateSteps, lactateTests, workouts } from "@/db/schema";
import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { isLactateSport, LACTATE_SPORTS, mmolToMilli } from "@/lib/lactate";
import { syncThresholdsFromTest } from "@/lib/thresholds";

async function authorize(athleteId: string) {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  if (!(await canAccessAthlete(actingUser, athleteId))) {
    throw new Error("Not allowed to manage lactate tests for this athlete");
  }
  return actingUser;
}

// Resolves the athlete for a test and checks access in one step.
async function authorizeTest(testId: string) {
  const [test] = await db
    .select({ athleteId: lactateTests.athleteId })
    .from(lactateTests)
    .where(and(eq(lactateTests.id, testId), isNull(lactateTests.deletedAt)))
    .limit(1);
  if (!test) throw new Error("Test not found");
  const actingUser = await authorize(test.athleteId);
  return { actingUser, athleteId: test.athleteId };
}

// ---------- Tests ----------

const createTestSchema = z.object({
  athleteId: z.uuid(),
  sport: z.enum(LACTATE_SPORTS),
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  title: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateTestState = { error?: string };

export async function createTest(
  _prev: CreateTestState,
  formData: FormData,
): Promise<CreateTestState> {
  const parsed = createTestSchema.safeParse({
    athleteId: formData.get("athleteId"),
    sport: formData.get("sport"),
    testDate: formData.get("testDate"),
    title: formData.get("title") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: z.prettifyError(parsed.error) };
  }
  const data = parsed.data;

  const actingUser = await authorize(data.athleteId);

  const [test] = await db
    .insert(lactateTests)
    .values({
      athleteId: data.athleteId,
      conductedById: actingUser.id,
      sport: data.sport,
      testDate: data.testDate,
      title: data.title || null,
      notes: data.notes || null,
    })
    .returning({ id: lactateTests.id });

  revalidatePath("/lactate");
  redirect(`/lactate/${test.id}`);
}

// Attaches a lactate test to a completed-or-planned workout (field samples
// taken during the session). Sport/date/athlete come from the workout; the
// workout page then embeds the step editor + analysis inline.
export async function addLactateToWorkout(workoutId: string) {
  const id = z.uuid().parse(workoutId);
  const [workout] = await db
    .select({
      id: workouts.id,
      athleteId: workouts.athleteId,
      sport: workouts.sport,
      date: workouts.date,
      title: workouts.title,
    })
    .from(workouts)
    .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
    .limit(1);
  if (!workout) throw new Error("Workout not found");
  if (!isLactateSport(workout.sport)) {
    throw new Error("Lactate testing applies to run, bike and swim only");
  }

  const actingUser = await authorize(workout.athleteId);

  // One attached test per workout; return quietly if it already exists.
  const [existing] = await db
    .select({ id: lactateTests.id })
    .from(lactateTests)
    .where(
      and(eq(lactateTests.workoutId, id), isNull(lactateTests.deletedAt)),
    )
    .limit(1);
  if (existing) return;

  await db.insert(lactateTests).values({
    athleteId: workout.athleteId,
    conductedById: actingUser.id,
    sport: workout.sport,
    workoutId: workout.id,
    testDate: workout.date,
    title: `${workout.title} · lactate`,
  });

  revalidatePath("/", "layout");
}

export async function deleteTest(testId: string) {
  await authorizeTest(testId);
  // Soft delete the test and its steps.
  await db
    .update(lactateTests)
    .set({ deletedAt: new Date() })
    .where(eq(lactateTests.id, testId));
  await db
    .update(lactateSteps)
    .set({ deletedAt: new Date() })
    .where(eq(lactateSteps.testId, testId));
  // Retract the threshold snapshot this test produced, if any.
  await syncThresholdsFromTest(testId);
  revalidatePath("/lactate");
  redirect("/lactate");
}

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );

const baselineSchema = z.object({
  baselineLactate: optionalNumber(z.number().min(0).max(40)),
  baselineIntensityValue: optionalNumber(z.number().int().min(1).max(100000)),
  includeBaseline: z.boolean(),
});

export async function setTestBaseline(
  testId: string,
  input: z.input<typeof baselineSchema>,
) {
  await authorizeTest(testId);
  const data = baselineSchema.parse(input);
  await db
    .update(lactateTests)
    .set({
      baselineLactate:
        data.baselineLactate != null ? mmolToMilli(data.baselineLactate) : null,
      baselineIntensityValue: data.baselineIntensityValue ?? null,
      includeBaseline: data.includeBaseline,
    })
    .where(eq(lactateTests.id, testId));
  await syncThresholdsFromTest(testId);
  revalidatePath(`/lactate/${testId}`);
}

// ---------- Steps ----------

const stepSchema = z.object({
  intensityValue: optionalNumber(z.number().int().min(1).max(100000)),
  lactate: optionalNumber(z.number().min(0).max(40)),
  heartRate: optionalNumber(z.number().int().min(20).max(260)),
  durationSec: optionalNumber(z.number().int().min(0).max(36000)),
});

export async function addStep(
  testId: string,
  input: z.input<typeof stepSchema>,
) {
  await authorizeTest(testId);
  const data = stepSchema.parse(input);

  const [{ maxStage }] = await db
    .select({
      maxStage: sql<number>`coalesce(max(${lactateSteps.stageNumber}), 0)::int`,
    })
    .from(lactateSteps)
    .where(and(eq(lactateSteps.testId, testId), isNull(lactateSteps.deletedAt)));

  await db.insert(lactateSteps).values({
    testId,
    stageNumber: maxStage + 1,
    intensityValue: data.intensityValue ?? null,
    lactate: data.lactate != null ? mmolToMilli(data.lactate) : null,
    heartRate: data.heartRate ?? null,
    durationSec: data.durationSec ?? null,
  });
  await syncThresholdsFromTest(testId);
  revalidatePath(`/lactate/${testId}`);
}

export async function updateStep(
  stepId: string,
  testId: string,
  input: z.input<typeof stepSchema>,
) {
  await authorizeTest(testId);
  const data = stepSchema.parse(input);
  await db
    .update(lactateSteps)
    .set({
      intensityValue: data.intensityValue ?? null,
      lactate: data.lactate != null ? mmolToMilli(data.lactate) : null,
      heartRate: data.heartRate ?? null,
      durationSec: data.durationSec ?? null,
    })
    .where(and(eq(lactateSteps.id, stepId), eq(lactateSteps.testId, testId)));
  await syncThresholdsFromTest(testId);
  revalidatePath(`/lactate/${testId}`);
}

export async function deleteStep(stepId: string, testId: string) {
  await authorizeTest(testId);
  await db
    .update(lactateSteps)
    .set({ deletedAt: new Date() })
    .where(and(eq(lactateSteps.id, stepId), eq(lactateSteps.testId, testId)));
  await syncThresholdsFromTest(testId);
  revalidatePath(`/lactate/${testId}`);
}
