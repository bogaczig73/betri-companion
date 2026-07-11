/**
 * Derive workout templates from an athlete's recurring prescriptions — run:
 *   npx tsx scripts/derive-templates.ts [athlete-email]
 *
 * Groups the athlete's workouts by sport+title, keeps groups appearing >= 2
 * times (skipping device-generated FIT titles), and creates a template per
 * group for the athlete's coach: median planned duration/distance, the most
 * common description, and the structure if any instance has one. Idempotent:
 * an existing template with the same coach+sport+name is left alone.
 */
import { config } from "dotenv";

config({ path: ".env.local" });

const ATHLETE_EMAIL = process.argv[2] ?? "radana@betri.test";

// Auto-titles from FIT imports (device sport names) — not prescriptions.
const DEVICE_TITLES =
  /^(Running|Road Cycling|Lap Swimming|Open Water Swimming|Swim|Run|Bike|Strength)( [\d.,]+ ?(km|m|min))?$/i;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const { and, eq, isNull } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { coachAthletes, users, workouts, workoutTemplates } = await import(
    "../src/db/schema"
  );

  const [athlete] = await db
    .select()
    .from(users)
    .where(eq(users.email, ATHLETE_EMAIL));
  if (!athlete) throw new Error(`No user with email ${ATHLETE_EMAIL}`);

  const [link] = await db
    .select()
    .from(coachAthletes)
    .where(
      and(
        eq(coachAthletes.athleteId, athlete.id),
        isNull(coachAthletes.deletedAt),
      ),
    );
  if (!link) throw new Error(`${athlete.name} has no linked coach`);
  const coachId = link.coachId;

  const rows = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.athleteId, athlete.id), isNull(workouts.deletedAt)));

  const groups = new Map<string, typeof rows>();
  for (const w of rows) {
    const title = w.title.trim();
    if (DEVICE_TITLES.test(title)) continue;
    const key = `${w.sport}|${title}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(w);
  }

  const existing = await db
    .select()
    .from(workoutTemplates)
    .where(
      and(
        eq(workoutTemplates.createdById, coachId),
        isNull(workoutTemplates.deletedAt),
      ),
    );

  let created = 0;
  let skipped = 0;
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const [sport, name] = [group[0].sport, key.slice(key.indexOf("|") + 1)];
    if (existing.some((t) => t.sport === sport && t.name === name)) {
      skipped++;
      continue;
    }

    // Most common description wins; ties break toward the longest.
    const descCounts = new Map<string, number>();
    for (const w of group) {
      if (w.description) {
        descCounts.set(
          w.description,
          (descCounts.get(w.description) ?? 0) + 1,
        );
      }
    }
    const description =
      [...descCounts.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].length - a[0].length,
      )[0]?.[0] ?? null;

    await db.insert(workoutTemplates).values({
      createdById: coachId,
      sport,
      name,
      description,
      plannedDurationSec: median(
        group
          .map((w) => w.plannedDurationSec ?? w.actualDurationSec)
          .filter((v): v is number => v != null),
      ),
      plannedDistanceM: median(
        group
          .map((w) => w.plannedDistanceM ?? w.actualDistanceM)
          .filter((v): v is number => v != null),
      ),
      structure: group.find((w) => w.structure)?.structure ?? null,
    });
    console.log(`created  ${sport.padEnd(8)} ${name}  (from ${group.length} workouts)`);
    created++;
  }
  console.log(`\n${created} created, ${skipped} already existed`);
}

main().then(() => process.exit(0));
