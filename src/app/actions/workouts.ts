"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import {
  sportEnum,
  workouts,
  workoutStatusEnum,
} from "@/db/schema";
import { canAccessAthlete, getWorkoutById } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { structureField, totalDurationSec } from "@/lib/structure";

// Form fields arrive as strings; "" means "not provided". Durations are
// entered in minutes and stored in seconds; distances entered in km (meters
// for swim handled client-side as km too) and stored in meters.
const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );

const workoutInput = z.object({
  athleteId: z.uuid(),
  sport: z.enum(sportEnum.enumValues),
  status: z.enum(workoutStatusEnum.enumValues),
  title: z.string().trim().min(1, "Title is required").max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date is required"),
  description: z.string().trim().max(5000).optional(),
  plannedDurationMin: optionalNumber(z.number().positive().max(24 * 60)),
  plannedDistanceKm: optionalNumber(z.number().positive().max(1000)),
  actualDurationMin: optionalNumber(z.number().positive().max(24 * 60)),
  actualDistanceKm: optionalNumber(z.number().positive().max(1000)),
  avgHr: optionalNumber(z.number().int().min(30).max(250)),
  maxHr: optionalNumber(z.number().int().min(30).max(250)),
  avgPowerW: optionalNumber(z.number().int().positive().max(2000)),
  rpe: optionalNumber(z.number().int().min(1).max(10)),
  load: optionalNumber(z.number().int().min(0).max(1000)),
  notes: z.string().trim().max(5000).optional(),
  structureJson: structureField,
});

export type WorkoutFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function toWorkoutColumns(input: z.infer<typeof workoutInput>) {
  return {
    athleteId: input.athleteId,
    sport: input.sport,
    status: input.status,
    title: input.title,
    date: input.date,
    description: input.description || null,
    structure: input.structureJson,
    // Explicit duration wins; otherwise derive it from the structure.
    plannedDurationSec: input.plannedDurationMin
      ? Math.round(input.plannedDurationMin * 60)
      : input.structureJson
        ? totalDurationSec(input.structureJson)
        : null,
    plannedDistanceM: input.plannedDistanceKm
      ? Math.round(input.plannedDistanceKm * 1000)
      : null,
    actualDurationSec: input.actualDurationMin
      ? Math.round(input.actualDurationMin * 60)
      : null,
    actualDistanceM: input.actualDistanceKm
      ? Math.round(input.actualDistanceKm * 1000)
      : null,
    avgHr: input.avgHr ?? null,
    maxHr: input.maxHr ?? null,
    avgPowerW: input.avgPowerW ?? null,
    rpe: input.rpe ?? null,
    load: input.load ?? null,
    notes: input.notes || null,
  };
}

async function authorizeAthleteAccess(athleteId: string) {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  if (!(await canAccessAthlete(actingUser, athleteId))) {
    throw new Error("Not allowed to manage workouts for this athlete");
  }
  return actingUser;
}

function redirectTarget(actingUserId: string, athleteId: string) {
  return actingUserId === athleteId ? "/" : `/athletes/${athleteId}`;
}

export async function createWorkout(
  _prev: WorkoutFormState,
  formData: FormData,
): Promise<WorkoutFormState> {
  const parsed = workoutInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const actingUser = await authorizeAthleteAccess(parsed.data.athleteId);

  await db.insert(workouts).values({
    ...toWorkoutColumns(parsed.data),
    createdById: actingUser.id,
    source: "manual",
  });

  revalidatePath("/", "layout");
  redirect(redirectTarget(actingUser.id, parsed.data.athleteId));
}

export async function updateWorkout(
  workoutId: string,
  _prev: WorkoutFormState,
  formData: FormData,
): Promise<WorkoutFormState> {
  const id = z.uuid().parse(workoutId);
  const existing = await getWorkoutById(id);
  if (!existing) return { error: "Workout not found" };

  const parsed = workoutInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  // The athlete a workout belongs to is immutable; ignore client value.
  parsed.data.athleteId = existing.athleteId;

  const actingUser = await authorizeAthleteAccess(existing.athleteId);

  await db
    .update(workouts)
    .set(toWorkoutColumns(parsed.data))
    .where(eq(workouts.id, id));

  revalidatePath("/", "layout");
  redirect(redirectTarget(actingUser.id, existing.athleteId));
}

export async function completeWorkout(workoutId: string) {
  const id = z.uuid().parse(workoutId);
  const existing = await getWorkoutById(id);
  if (!existing) throw new Error("Workout not found");
  if (existing.status === "completed") return;

  await authorizeAthleteAccess(existing.athleteId);

  // "Done as planned": prescription becomes the actuals unless actuals were
  // already recorded. Details can be edited afterwards on the workout page.
  await db
    .update(workouts)
    .set({
      status: "completed",
      actualDurationSec:
        existing.actualDurationSec ?? existing.plannedDurationSec,
      actualDistanceM: existing.actualDistanceM ?? existing.plannedDistanceM,
    })
    .where(eq(workouts.id, id));

  revalidatePath("/", "layout");
}

export async function deleteWorkout(workoutId: string) {
  const id = z.uuid().parse(workoutId);
  const existing = await getWorkoutById(id);
  if (!existing) throw new Error("Workout not found");

  const actingUser = await authorizeAthleteAccess(existing.athleteId);

  // Soft delete — history stays reprocessable.
  await db
    .update(workouts)
    .set({ deletedAt: new Date() })
    .where(and(eq(workouts.id, id)));

  revalidatePath("/", "layout");
  redirect(redirectTarget(actingUser.id, existing.athleteId));
}
