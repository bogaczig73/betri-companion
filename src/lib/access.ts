import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import { coachAthletes, users, workouts, type User, type Workout } from "@/db/schema";

// Central authorization point: a user can access an athlete's data if they
// are that athlete, or a coach linked to them. When real auth lands this
// stays the single permission check for athlete-scoped resources.
export async function canAccessAthlete(
  actingUser: User,
  athleteId: string,
): Promise<boolean> {
  if (actingUser.id === athleteId) return true;
  if (actingUser.role !== "coach") return false;
  const link = await db
    .select({ id: coachAthletes.id })
    .from(coachAthletes)
    .where(
      and(
        eq(coachAthletes.coachId, actingUser.id),
        eq(coachAthletes.athleteId, athleteId),
        isNull(coachAthletes.deletedAt),
      ),
    )
    .limit(1);
  return link.length > 0;
}

export async function getAthletesForCoach(coachId: string): Promise<User[]> {
  const links = await db
    .select({ athleteId: coachAthletes.athleteId })
    .from(coachAthletes)
    .where(and(eq(coachAthletes.coachId, coachId), isNull(coachAthletes.deletedAt)));
  if (links.length === 0) return [];
  return db
    .select()
    .from(users)
    .where(
      and(
        inArray(
          users.id,
          links.map((l) => l.athleteId),
        ),
        isNull(users.deletedAt),
      ),
    );
}

export async function getCoachesForAthlete(athleteId: string): Promise<User[]> {
  const links = await db
    .select({ coachId: coachAthletes.coachId })
    .from(coachAthletes)
    .where(
      and(eq(coachAthletes.athleteId, athleteId), isNull(coachAthletes.deletedAt)),
    );
  if (links.length === 0) return [];
  return db
    .select()
    .from(users)
    .where(
      and(
        inArray(
          users.id,
          links.map((l) => l.coachId),
        ),
        isNull(users.deletedAt),
      ),
    );
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkoutsForAthlete(
  athleteId: string,
): Promise<Workout[]> {
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.athleteId, athleteId), isNull(workouts.deletedAt)))
    .orderBy(desc(workouts.date), desc(workouts.createdAt));
}

// Both bounds inclusive — the calendar passes the first and last day of the
// visible grid, which can spill into the neighbouring months.
export async function getWorkoutsInRange(
  athleteId: string,
  fromDate: string,
  toDate: string,
): Promise<Workout[]> {
  return db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.athleteId, athleteId),
        gte(workouts.date, fromDate),
        lte(workouts.date, toDate),
        isNull(workouts.deletedAt),
      ),
    )
    .orderBy(asc(workouts.date), asc(workouts.createdAt));
}

export async function getWorkoutById(id: string): Promise<Workout | null> {
  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, id), isNull(workouts.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}
