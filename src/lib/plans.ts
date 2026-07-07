import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  planAssignments,
  plannedSessions,
  planWeeks,
  trainingPlans,
  users,
  type PlanAssignment,
  type PlannedSession,
  type PlanWeek,
  type TrainingPlan,
} from "@/db/schema";

export type PlanWeekWithSessions = PlanWeek & { sessions: PlannedSession[] };

export type PlanDetail = TrainingPlan & {
  weeks: PlanWeekWithSessions[];
  assignments: (PlanAssignment & { athleteName: string })[];
};

export async function getPlansForCoach(coachId: string): Promise<TrainingPlan[]> {
  return db
    .select()
    .from(trainingPlans)
    .where(
      and(
        eq(trainingPlans.createdById, coachId),
        isNull(trainingPlans.deletedAt),
      ),
    )
    .orderBy(desc(trainingPlans.createdAt));
}

export async function getPlanById(id: string): Promise<TrainingPlan | null> {
  const rows = await db
    .select()
    .from(trainingPlans)
    .where(and(eq(trainingPlans.id, id), isNull(trainingPlans.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getPlanDetail(id: string): Promise<PlanDetail | null> {
  const plan = await getPlanById(id);
  if (!plan) return null;

  const weeks = await db
    .select()
    .from(planWeeks)
    .where(and(eq(planWeeks.planId, id), isNull(planWeeks.deletedAt)))
    .orderBy(asc(planWeeks.weekNumber));

  const sessions =
    weeks.length === 0
      ? []
      : await db
          .select()
          .from(plannedSessions)
          .where(
            and(
              inArray(
                plannedSessions.weekId,
                weeks.map((w) => w.id),
              ),
              isNull(plannedSessions.deletedAt),
            ),
          )
          .orderBy(asc(plannedSessions.createdAt));

  const assignments = await db
    .select({
      assignment: planAssignments,
      athleteName: users.name,
    })
    .from(planAssignments)
    .innerJoin(users, eq(users.id, planAssignments.athleteId))
    .where(
      and(eq(planAssignments.planId, id), isNull(planAssignments.deletedAt)),
    )
    .orderBy(desc(planAssignments.createdAt));

  return {
    ...plan,
    weeks: weeks.map((w) => ({
      ...w,
      sessions: sessions.filter((s) => s.weekId === w.id),
    })),
    assignments: assignments.map(({ assignment, athleteName }) => ({
      ...assignment,
      athleteName,
    })),
  };
}
