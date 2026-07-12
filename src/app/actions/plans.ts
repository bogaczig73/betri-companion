"use server";

import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import {
  periodizationPhaseEnum,
  planAssignments,
  plannedSessions,
  planWeeks,
  raceTypeEnum,
  sportEnum,
  trainingPlans,
  workouts,
  type NewWorkout,
  type User,
} from "@/db/schema";
import { canAccessAthlete } from "@/lib/access";
import { getActingUser } from "@/lib/acting-user";
import {
  generatePlan,
  RACE_TYPES,
  type GeneratorParams,
} from "@/lib/plan-generator";
import { getPlanById } from "@/lib/plans";
import { structureField, totalDurationSec } from "@/lib/structure";

// All plan mutations are owner-only: the coach who created a plan manages it.
async function authorizePlanOwner(planId: string) {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") {
    throw new Error("Only coaches manage plans");
  }
  const plan = await getPlanById(planId);
  if (!plan) throw new Error("Plan not found");
  if (plan.createdById !== actingUser.id) {
    throw new Error("Not your plan");
  }
  return { actingUser, plan };
}

async function requireCoach(): Promise<User> {
  const actingUser = await getActingUser();
  if (!actingUser || actingUser.role !== "coach") {
    throw new Error("Only coaches manage plans");
  }
  return actingUser;
}

function revalidatePlan(planId: string) {
  revalidatePath("/plans");
  revalidatePath(`/plans/${planId}`);
}

// ---------------------------------------------------------------------------
// Plan CRUD
// ---------------------------------------------------------------------------

const createPlanInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  numWeeks: z.coerce.number().int().min(1).max(52).default(4),
  isTemplate: z.coerce.boolean().default(false),
});

export async function createPlan(formData: FormData) {
  const actingUser = await requireCoach();
  const input = createPlanInput.parse(Object.fromEntries(formData));

  const [plan] = await db
    .insert(trainingPlans)
    .values({
      name: input.name,
      description: input.description || null,
      createdById: actingUser.id,
      isTemplate: input.isTemplate,
    })
    .returning();

  await db.insert(planWeeks).values(
    Array.from({ length: input.numWeeks }, (_, i) => ({
      planId: plan.id,
      weekNumber: i + 1,
    })),
  );

  revalidatePath("/plans");
  redirect(`/plans/${plan.id}`);
}

const updatePlanInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
});

export async function updatePlan(planId: string, formData: FormData) {
  const id = z.uuid().parse(planId);
  await authorizePlanOwner(id);
  const input = updatePlanInput.parse(Object.fromEntries(formData));
  await db
    .update(trainingPlans)
    .set({ name: input.name, description: input.description || null })
    .where(eq(trainingPlans.id, id));
  revalidatePlan(id);
}

export async function deletePlan(planId: string) {
  const id = z.uuid().parse(planId);
  await authorizePlanOwner(id);
  // Soft delete the plan shell only. Workouts already materialized on
  // athletes' calendars stay — they are real scheduled sessions.
  await db
    .update(trainingPlans)
    .set({ deletedAt: new Date() })
    .where(eq(trainingPlans.id, id));
  revalidatePath("/plans");
  redirect("/plans");
}

// ---------------------------------------------------------------------------
// Weeks
// ---------------------------------------------------------------------------

export async function addWeek(planId: string) {
  const id = z.uuid().parse(planId);
  await authorizePlanOwner(id);
  const [{ maxWeek }] = await db
    .select({ maxWeek: max(planWeeks.weekNumber) })
    .from(planWeeks)
    .where(and(eq(planWeeks.planId, id), isNull(planWeeks.deletedAt)));
  await db
    .insert(planWeeks)
    .values({ planId: id, weekNumber: (maxWeek ?? 0) + 1 });
  revalidatePlan(id);
}

export async function removeWeek(weekId: string) {
  const id = z.uuid().parse(weekId);
  const week = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.id, id), isNull(planWeeks.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!week) throw new Error("Week not found");
  await authorizePlanOwner(week.planId);

  await db.update(planWeeks).set({ deletedAt: new Date() }).where(eq(planWeeks.id, id));
  // Renumber the remaining weeks to stay contiguous.
  const remaining = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.planId, week.planId), isNull(planWeeks.deletedAt)))
    .orderBy(planWeeks.weekNumber);
  for (const [i, w] of remaining.entries()) {
    if (w.weekNumber !== i + 1) {
      await db
        .update(planWeeks)
        .set({ weekNumber: i + 1 })
        .where(eq(planWeeks.id, w.id));
    }
  }
  revalidatePlan(week.planId);
}

const phaseInput = z.enum(periodizationPhaseEnum.enumValues).nullable();

export async function setWeekPhase(weekId: string, phase: string | null) {
  const id = z.uuid().parse(weekId);
  const parsedPhase = phaseInput.parse(phase || null);
  const week = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.id, id), isNull(planWeeks.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!week) throw new Error("Week not found");
  await authorizePlanOwner(week.planId);
  await db.update(planWeeks).set({ phase: parsedPhase }).where(eq(planWeeks.id, id));
  revalidatePlan(week.planId);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : Number(v)),
    schema.optional(),
  );

const sessionInput = z.object({
  sport: z.enum(sportEnum.enumValues),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  plannedDurationMin: optionalNumber(z.number().positive().max(24 * 60)),
  plannedDistanceKm: optionalNumber(z.number().positive().max(1000)),
  structureJson: structureField,
});

function toSessionColumns(input: z.infer<typeof sessionInput>) {
  const structure = input.structureJson;
  return {
    sport: input.sport,
    title: input.title,
    description: input.description || null,
    // Explicit duration wins; otherwise derive it from the structure.
    plannedDurationSec: input.plannedDurationMin
      ? Math.round(input.plannedDurationMin * 60)
      : structure
        ? totalDurationSec(structure)
        : null,
    plannedDistanceM: input.plannedDistanceKm
      ? Math.round(input.plannedDistanceKm * 1000)
      : null,
    structure,
  };
}

export async function addSession(
  weekId: string,
  dayOfWeek: number,
  formData: FormData,
) {
  const id = z.uuid().parse(weekId);
  const day = z.number().int().min(0).max(6).parse(dayOfWeek);
  const week = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.id, id), isNull(planWeeks.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!week) throw new Error("Week not found");
  await authorizePlanOwner(week.planId);

  const input = sessionInput.parse(Object.fromEntries(formData));
  await db.insert(plannedSessions).values({
    weekId: id,
    dayOfWeek: day,
    ...toSessionColumns(input),
  });
  revalidatePlan(week.planId);
}

async function getSessionWithPlan(sessionId: string) {
  const session = await db
    .select()
    .from(plannedSessions)
    .where(and(eq(plannedSessions.id, sessionId), isNull(plannedSessions.deletedAt)))
    .limit(1)
    .then((r) => r[0]);
  if (!session) throw new Error("Session not found");
  const week = await db
    .select()
    .from(planWeeks)
    .where(eq(planWeeks.id, session.weekId))
    .limit(1)
    .then((r) => r[0]);
  return { session, planId: week.planId };
}

export async function updateSession(sessionId: string, formData: FormData) {
  const id = z.uuid().parse(sessionId);
  const { planId } = await getSessionWithPlan(id);
  await authorizePlanOwner(planId);
  const input = sessionInput.parse(Object.fromEntries(formData));
  await db
    .update(plannedSessions)
    .set(toSessionColumns(input))
    .where(eq(plannedSessions.id, id));
  revalidatePlan(planId);
}

export async function deleteSession(sessionId: string) {
  const id = z.uuid().parse(sessionId);
  const { planId } = await getSessionWithPlan(id);
  await authorizePlanOwner(planId);
  await db
    .update(plannedSessions)
    .set({ deletedAt: new Date() })
    .where(eq(plannedSessions.id, id));
  revalidatePlan(planId);
}

// ---------------------------------------------------------------------------
// Duplicate (templates) & assign
// ---------------------------------------------------------------------------

export async function duplicatePlan(planId: string, asTemplate: boolean) {
  const id = z.uuid().parse(planId);
  const { actingUser, plan } = await authorizePlanOwner(id);

  const weeks = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.planId, id), isNull(planWeeks.deletedAt)))
    .orderBy(planWeeks.weekNumber);

  const [copy] = await db
    .insert(trainingPlans)
    .values({
      name: asTemplate ? `${plan.name} (template)` : plan.name,
      description: plan.description,
      createdById: actingUser.id,
      isTemplate: asTemplate,
    })
    .returning();

  for (const week of weeks) {
    const [newWeek] = await db
      .insert(planWeeks)
      .values({
        planId: copy.id,
        weekNumber: week.weekNumber,
        phase: week.phase,
        notes: week.notes,
      })
      .returning();
    const sessions = await db
      .select()
      .from(plannedSessions)
      .where(
        and(eq(plannedSessions.weekId, week.id), isNull(plannedSessions.deletedAt)),
      );
    if (sessions.length > 0) {
      await db.insert(plannedSessions).values(
        sessions.map((s) => ({
          weekId: newWeek.id,
          dayOfWeek: s.dayOfWeek,
          sport: s.sport,
          title: s.title,
          description: s.description,
          plannedDurationSec: s.plannedDurationSec,
          plannedDistanceM: s.plannedDistanceM,
          structure: s.structure,
        })),
      );
    }
  }

  revalidatePath("/plans");
  redirect(`/plans/${copy.id}`);
}

const assignInput = z.object({
  athleteId: z.uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
});

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function assignPlan(planId: string, formData: FormData) {
  const id = z.uuid().parse(planId);
  const { actingUser } = await authorizePlanOwner(id);
  const input = assignInput.parse(Object.fromEntries(formData));

  if (!(await canAccessAthlete(actingUser, input.athleteId))) {
    throw new Error("Not your athlete");
  }

  const weeks = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.planId, id), isNull(planWeeks.deletedAt)));
  const weekIds = weeks.map((w) => w.id);
  const planSessions =
    weekIds.length === 0
      ? []
      : await db
          .select()
          .from(plannedSessions)
          .where(
            and(
              inArray(plannedSessions.weekId, weekIds),
              isNull(plannedSessions.deletedAt),
            ),
          );

  if (planSessions.length === 0) {
    throw new Error("Plan has no sessions to assign");
  }

  const [assignment] = await db
    .insert(planAssignments)
    .values({
      planId: id,
      athleteId: input.athleteId,
      assignedById: actingUser.id,
      startDate: input.startDate,
    })
    .returning();

  const weekNumberById = new Map(weeks.map((w) => [w.id, w.weekNumber]));
  const rows: NewWorkout[] = planSessions.map((s) => ({
    athleteId: input.athleteId,
    createdById: actingUser.id,
    sport: s.sport,
    status: "planned" as const,
    source: "plan" as const,
    title: s.title,
    description: s.description,
    date: addDays(
      input.startDate,
      (weekNumberById.get(s.weekId)! - 1) * 7 + s.dayOfWeek,
    ),
    plannedDurationSec: s.plannedDurationSec,
    plannedDistanceM: s.plannedDistanceM,
    structure: s.structure,
    planAssignmentId: assignment.id,
    plannedSessionId: s.id,
  }));
  await db.insert(workouts).values(rows);

  revalidatePath("/", "layout");
  revalidatePlan(id);
}

// ---------------------------------------------------------------------------
// Generator (P8): create a full plan from race date + params
// ---------------------------------------------------------------------------

const generateInput = z.object({
  name: z.string().trim().max(200).optional(),
  raceType: z.enum(raceTypeEnum.enumValues),
  raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Race date is required"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date is required"),
  startWeeklyHours: z.coerce.number().min(2).max(30),
  rampPct: z.coerce.number().min(2).max(15).default(8),
  buildRecoveryPattern: z.enum(["3:1", "2:1"]).default("3:1"),
  swimPerWeek: z.coerce.number().int().min(0).max(5).default(2),
  bikePerWeek: z.coerce.number().int().min(0).max(5).default(3),
  runPerWeek: z.coerce.number().int().min(0).max(5).default(3),
  strengthPerWeek: z.coerce.number().int().min(0).max(3).default(1),
  longSessionDay: z.coerce.number().int().min(0).max(6).default(5),
});

export type GeneratePlanState = { error?: string };

export async function createGeneratedPlan(
  _prev: GeneratePlanState,
  formData: FormData,
): Promise<GeneratePlanState> {
  const actingUser = await requireCoach();

  const parsed = generateInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const input = parsed.data;

  const params: GeneratorParams = {
    raceType: input.raceType,
    raceDate: input.raceDate,
    startDate: input.startDate,
    startWeeklyHours: input.startWeeklyHours,
    rampPct: input.rampPct,
    buildRecoveryPattern: input.buildRecoveryPattern,
    sessionsPerWeek: {
      swim: input.swimPerWeek,
      bike: input.bikePerWeek,
      run: input.runPerWeek,
      strength: input.strengthPerWeek,
    },
    longSessionDay: input.longSessionDay,
  };

  let generated: ReturnType<typeof generatePlan>;
  try {
    generated = generatePlan(params);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Generation failed" };
  }

  const label = RACE_TYPES[input.raceType].label;
  const [plan] = await db
    .insert(trainingPlans)
    .values({
      name: input.name || `${label} — ${input.raceDate}`,
      description: `Generated ${generated.totalWeeks}-week plan toward ${label} on ${input.raceDate}. Edit freely.`,
      createdById: actingUser.id,
      raceDate: input.raceDate,
      raceType: input.raceType,
      generatorParams: params,
    })
    .returning();

  const weekRows = await db
    .insert(planWeeks)
    .values(
      generated.weeks.map((w) => ({
        planId: plan.id,
        weekNumber: w.weekNumber,
        phase: w.phase,
        notes: w.notes,
      })),
    )
    .returning();
  const weekIdByNumber = new Map(weekRows.map((w) => [w.weekNumber, w.id]));

  await db.insert(plannedSessions).values(
    generated.weeks.flatMap((w) =>
      w.sessions.map((s) => ({
        weekId: weekIdByNumber.get(w.weekNumber)!,
        dayOfWeek: s.dayOfWeek,
        sport: s.sport,
        title: s.title,
        description: s.description,
        plannedDurationSec: s.plannedDurationSec,
        structure: s.structure,
      })),
    ),
  );

  revalidatePath("/plans");
  redirect(`/plans/${plan.id}`);
}
