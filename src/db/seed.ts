import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import { eq } from "drizzle-orm";

import { coachAthletes, users, workouts, type NewWorkout } from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema: { users, coachAthletes, workouts } });

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function seedWorkouts(coachId: string, athleteId: string) {
  const existing = await db
    .select({ id: workouts.id })
    .from(workouts)
    .where(eq(workouts.athleteId, athleteId))
    .limit(1);
  if (existing.length > 0) return 0;

  const rows: NewWorkout[] = [
    {
      athleteId,
      createdById: coachId,
      sport: "run",
      status: "completed",
      title: "Easy long run",
      date: isoDaysFromNow(-3),
      plannedDurationSec: 90 * 60,
      plannedDistanceM: 16000,
      actualDurationSec: 92 * 60,
      actualDistanceM: 16400,
      avgHr: 142,
      maxHr: 158,
      rpe: 4,
      load: 95,
      notes: "Felt smooth, negative split.",
    },
    {
      athleteId,
      createdById: coachId,
      sport: "bike",
      status: "completed",
      title: "Sweet spot 3x15",
      date: isoDaysFromNow(-1),
      description: "3x15min @ 88-93% FTP, 5min recoveries",
      plannedDurationSec: 80 * 60,
      actualDurationSec: 82 * 60,
      actualDistanceM: 41000,
      avgHr: 151,
      maxHr: 172,
      avgPowerW: 236,
      rpe: 7,
      load: 88,
    },
    {
      athleteId,
      createdById: coachId,
      sport: "strength",
      status: "planned",
      title: "Gym: core + posterior chain",
      date: isoDaysFromNow(1),
      description: "Deadlift 4x6, split squat 3x8/side, plank series",
      plannedDurationSec: 45 * 60,
    },
    {
      athleteId,
      createdById: coachId,
      sport: "swim",
      status: "planned",
      title: "Threshold 10x200",
      date: isoDaysFromNow(2),
      description: "10x200 @ CSS pace, 20s rest",
      plannedDurationSec: 60 * 60,
      plannedDistanceM: 3000,
    },
  ];
  await db.insert(workouts).values(rows);
  return rows.length;
}

async function seed() {
  const seedUsers = [
    {
      name: "Petra Novak",
      email: "petra.coach@example.com",
      role: "coach" as const,
      timezone: "Europe/Prague",
    },
    {
      name: "Jonas Berg",
      email: "jonas.athlete@example.com",
      role: "athlete" as const,
      timezone: "Europe/Prague",
    },
    {
      name: "Emma Ruiz",
      email: "emma.athlete@example.com",
      role: "athlete" as const,
      timezone: "Europe/Madrid",
    },
  ];

  const inserted = await db
    .insert(users)
    .values(seedUsers)
    .onConflictDoNothing({ target: users.email })
    .returning();

  if (inserted.length > 0) {
    const coach = inserted.find((u) => u.role === "coach")!;
    const athletes = inserted.filter((u) => u.role === "athlete");
    await db
      .insert(coachAthletes)
      .values(athletes.map((a) => ({ coachId: coach.id, athleteId: a.id })))
      .onConflictDoNothing();
    console.log(
      `Seeded ${inserted.length} users: coach ${coach.name} with athletes ${athletes
        .map((a) => a.name)
        .join(", ")}`,
    );
  } else {
    console.log("Seed users already exist.");
  }

  // Demo workouts for the first athlete (skipped if they already have any).
  const allUsers = await db.select().from(users);
  const coach = allUsers.find((u) => u.role === "coach");
  const firstAthlete = allUsers.find((u) => u.role === "athlete");
  if (coach && firstAthlete) {
    const count = await seedWorkouts(coach.id, firstAthlete.id);
    console.log(
      count > 0
        ? `Seeded ${count} workouts for ${firstAthlete.name}`
        : `Workouts already exist for ${firstAthlete.name}.`,
    );
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
