"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { sportEnum, workouts, workoutTemplates } from "@/db/schema";
import { canAccessAthlete, getWorkoutById } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import { getTemplateById } from "@/lib/templates";
import { structureField, totalDurationSec } from "@/lib/structure";

async function requireActingUser() {
  const actingUser = await getActingUser();
  if (!actingUser) throw new Error("No acting user");
  return actingUser;
}

// Templates are personal: only the creator can edit or delete.
async function ownTemplate(templateId: string) {
  const template = await getTemplateById(z.uuid().parse(templateId));
  if (!template) throw new Error("Template not found");
  const actingUser = await requireActingUser();
  if (template.createdById !== actingUser.id) {
    throw new Error("Not your template");
  }
  return { template, actingUser };
}

const templateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  sport: z.enum(sportEnum.enumValues),
  description: z.string().trim().max(5000).optional(),
  plannedDurationMin: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().positive().max(24 * 60).optional(),
  ),
  plannedDistanceKm: z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z.number().positive().max(1000).optional(),
  ),
  structureJson: structureField,
});

export type TemplateFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function toColumns(input: z.infer<typeof templateInput>) {
  return {
    name: input.name,
    sport: input.sport,
    description: input.description || null,
    plannedDurationSec: input.plannedDurationMin
      ? Math.round(input.plannedDurationMin * 60)
      : input.structureJson
        ? totalDurationSec(input.structureJson)
        : null,
    plannedDistanceM: input.plannedDistanceKm
      ? Math.round(input.plannedDistanceKm * 1000)
      : null,
    structure: input.structureJson,
  };
}

export async function createTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const parsed = templateInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const actingUser = await requireActingUser();
  await db.insert(workoutTemplates).values({
    ...toColumns(parsed.data),
    createdById: actingUser.id,
  });
  revalidatePath("/templates");
  redirect("/templates");
}

export async function updateTemplate(
  templateId: string,
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const { template } = await ownTemplate(templateId);
  const parsed = templateInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  await db
    .update(workoutTemplates)
    .set(toColumns(parsed.data))
    .where(eq(workoutTemplates.id, template.id));
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deleteTemplate(templateId: string) {
  const { template } = await ownTemplate(templateId);
  await db
    .update(workoutTemplates)
    .set({ deletedAt: new Date() })
    .where(eq(workoutTemplates.id, template.id));
  revalidatePath("/templates");
  redirect("/templates");
}

// One-click snapshot of an existing workout's prescription as a template.
export async function saveWorkoutAsTemplate(workoutId: string) {
  const workout = await getWorkoutById(z.uuid().parse(workoutId));
  if (!workout) throw new Error("Workout not found");
  const actingUser = await requireActingUser();
  if (!(await canAccessAthlete(actingUser, workout.athleteId))) {
    throw new Error("Not allowed");
  }
  await db.insert(workoutTemplates).values({
    createdById: actingUser.id,
    name: workout.title,
    sport: workout.sport,
    description: workout.description,
    plannedDurationSec: workout.plannedDurationSec,
    plannedDistanceM: workout.plannedDistanceM,
    structure: workout.structure,
  });
  revalidatePath("/templates");
}

// Instantiate a template as a planned workout (calendar quick-add). Values
// are copied — later template edits never touch created workouts.
export async function createWorkoutFromTemplate(
  templateId: string,
  athleteId: string,
  date: string,
): Promise<{ error?: string }> {
  const template = await getTemplateById(z.uuid().parse(templateId));
  if (!template) return { error: "Template not found" };
  const parsedDate = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .parse(date);
  const actingUser = await requireActingUser();
  if (template.createdById !== actingUser.id) {
    return { error: "Not your template" };
  }
  if (!(await canAccessAthlete(actingUser, z.uuid().parse(athleteId)))) {
    return { error: "Not allowed" };
  }
  await db.insert(workouts).values({
    athleteId,
    createdById: actingUser.id,
    sport: template.sport,
    status: "planned",
    source: "manual",
    title: template.name,
    date: parsedDate,
    description: template.description,
    plannedDurationSec: template.plannedDurationSec,
    plannedDistanceM: template.plannedDistanceM,
    structure: template.structure,
  });
  revalidatePath("/", "layout");
  return {};
}
