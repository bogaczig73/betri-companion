/**
 * One-off TrainingPeaks export import — run with:
 *   npm run import:tp            (uses the first coach)
 *   npm run import:tp -- --coach coach@example.com
 *
 * Creates/updates the test athlete Radana Rampáčková from the export in
 * inspiration/: FIT activity files (histograms + time-in-zones via the normal
 * FIT pipeline), workouts.csv (coach titles/descriptions, planned values, TSS,
 * TrainingPeaks zone minutes for sessions without a FIT file) and metrics.csv
 * (daily wellness). Idempotent: FIT files dedupe by SHA-256, CSV rows match
 * existing workouts by date+sport, metrics upsert on (athlete, date, kind).
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";

const ATHLETE_NAME = "Radana Rampáčková";
const ATHLETE_EMAIL = "radana@betri.test";
const EXPORT_DIR = "inspiration";

async function main() {
  const { and, asc, eq, isNull } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    athleteDailyMetrics,
    athleteThresholds,
    coachAthletes,
    users,
    workouts,
  } = await import("../src/db/schema");
  const { processFitFile } = await import("../src/lib/fit");
  const { recomputeTimeInZonesForAthlete } = await import(
    "../src/lib/time-in-zones"
  );
  type Sport = import("../src/db/schema").Sport;
  type TimeInZones = import("../src/lib/zones").TimeInZones;

  // ---------------------------------------------------------------------
  // Coach + athlete
  // ---------------------------------------------------------------------

  const coachEmailFlag = process.argv.indexOf("--coach");
  const coachEmail =
    coachEmailFlag > -1 ? process.argv[coachEmailFlag + 1] : null;

  const coaches = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "coach"), isNull(users.deletedAt)))
    .orderBy(asc(users.createdAt));
  const coach = coachEmail
    ? coaches.find((c) => c.email === coachEmail)
    : coaches[0];
  if (!coach) throw new Error(`No coach found${coachEmail ? ` for ${coachEmail}` : ""}`);

  let [athlete] = await db
    .select()
    .from(users)
    .where(eq(users.email, ATHLETE_EMAIL))
    .limit(1);
  if (!athlete) {
    [athlete] = await db
      .insert(users)
      .values({
        name: ATHLETE_NAME,
        email: ATHLETE_EMAIL,
        role: "athlete",
        timezone: "Europe/Prague",
      })
      .returning();
    console.log(`Created athlete ${ATHLETE_NAME} (${athlete.id})`);
  } else {
    console.log(`Athlete ${ATHLETE_NAME} exists (${athlete.id})`);
  }

  const [link] = await db
    .select()
    .from(coachAthletes)
    .where(
      and(
        eq(coachAthletes.coachId, coach.id),
        eq(coachAthletes.athleteId, athlete.id),
      ),
    )
    .limit(1);
  if (!link) {
    await db
      .insert(coachAthletes)
      .values({ coachId: coach.id, athleteId: athlete.id });
    console.log(`Linked to coach ${coach.name}`);
  }

  // ---------------------------------------------------------------------
  // FIT pass
  // ---------------------------------------------------------------------

  const fitDir = readdirSync(EXPORT_DIR).find((d) =>
    d.startsWith("WorkoutFileExport"),
  );
  if (!fitDir) throw new Error(`No WorkoutFileExport dir under ${EXPORT_DIR}/`);
  const dir = join(EXPORT_DIR, fitDir);
  const entries = readdirSync(dir);
  const fitFiles = entries.filter((f) => f.toLowerCase().endsWith(".fit"));
  // .gz variants only when the uncompressed sibling is missing; SHA dedupe
  // catches any remaining duplicates anyway.
  const gzOnly = entries.filter(
    (f) =>
      f.toLowerCase().endsWith(".fit.gz") &&
      !entries.includes(f.slice(0, -3)),
  );

  const fitStats = { imported: 0, duplicate: 0, error: 0 };
  const errors: string[] = [];
  for (const file of [...fitFiles, ...gzOnly]) {
    const raw = readFileSync(join(dir, file));
    const bytes = file.toLowerCase().endsWith(".gz") ? gunzipSync(raw) : raw;
    const result = await processFitFile({
      bytes: bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
      fileName: basename(file),
      athleteId: athlete.id,
      uploadedById: coach.id,
    });
    fitStats[result.status]++;
    if (result.status === "error") errors.push(`${file}: ${result.message}`);
  }
  console.log(
    `FIT: ${fitStats.imported} imported, ${fitStats.duplicate} duplicates, ${fitStats.error} errors`,
  );
  for (const e of errors) console.log(`  ! ${e}`);

  // ---------------------------------------------------------------------
  // Thresholds from device settings (so zone math has an anchor)
  // ---------------------------------------------------------------------

  const existingThresholds = await db
    .select({ id: athleteThresholds.id })
    .from(athleteThresholds)
    .where(
      and(
        eq(athleteThresholds.athleteId, athlete.id),
        isNull(athleteThresholds.deletedAt),
      ),
    )
    .limit(1);
  if (existingThresholds.length === 0) {
    // Device settings observed in the export: bike FTP 300 W, run threshold
    // power 351 W, max HR 185. The device uses %maxHR zones, so LTHR is
    // estimated at ~90 % of max HR — flagged in notes for the coach to fix
    // after a proper test.
    const estimatedLthr = Math.round(185 * 0.9);
    await db.insert(athleteThresholds).values({
      athleteId: athlete.id,
      setById: coach.id,
      source: "import",
      effectiveDate: "2026-06-01",
      maxHr: 185,
      ftpW: 300,
      bikeLthr: estimatedLthr,
      runThresholdPowerW: 351,
      runLthr: estimatedLthr,
      swimLthr: estimatedLthr,
      notes:
        "Imported from Garmin device settings in the TrainingPeaks export. LTHR estimated as 90 % of device max HR — replace after a lactate test.",
    });
    console.log("Thresholds: seeded from device settings (LTHR estimated)");
  } else {
    console.log("Thresholds: already present, left untouched");
  }

  const recomputed = await recomputeTimeInZonesForAthlete(athlete.id);
  console.log(`Time-in-zones recomputed for ${recomputed} workouts`);

  // ---------------------------------------------------------------------
  // workouts.csv pass
  // ---------------------------------------------------------------------

  const csvRows = parseCsv(readFileSync(join(EXPORT_DIR, "workouts.csv"), "utf8"));
  const sportMap: Record<string, Sport> = {
    Swim: "swim",
    Run: "run",
    Bike: "bike",
    Brick: "bike",
    Strength: "strength",
  };

  const existing = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.athleteId, athlete.id), isNull(workouts.deletedAt)));
  const matched = new Set<string>();
  const byKey = new Map<string, typeof existing>();
  for (const w of existing) {
    const key = `${w.date}|${w.sport}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(w);
  }

  const csvStats = { enriched: 0, inserted: 0, skipped: 0 };
  for (const row of csvRows) {
    const sport = sportMap[row.WorkoutType];
    const date = row.WorkoutDay;
    if (!sport || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      csvStats.skipped++;
      continue;
    }
    const isBrick = row.WorkoutType === "Brick";
    const title = isBrick ? `[Brick] ${row.Title}` : row.Title || "Session";

    const num = (v: string): number | null => {
      const n = Number(v);
      return v !== "" && Number.isFinite(n) ? n : null;
    };
    const actualDurationSec = num(row.TimeTotalInHours)
      ? Math.round(num(row.TimeTotalInHours)! * 3600)
      : null;
    const actualDistanceM = num(row.DistanceInMeters)
      ? Math.round(num(row.DistanceInMeters)!)
      : null;
    const zoneMinutes = (prefix: "HRZone" | "PWRZone"): number[] | null => {
      const mins: number[] = [];
      for (let z = 1; z <= 10; z++) {
        mins.push(num(row[`${prefix}${z}Minutes`] ?? "") ?? 0);
      }
      while (mins.length > 0 && mins[mins.length - 1] === 0) mins.pop();
      return mins.some((m) => m > 0)
        ? mins.map((m) => Math.round(m * 60))
        : null;
    };
    const hrZones = zoneMinutes("HRZone");
    const pwrZones = zoneMinutes("PWRZone");
    const csvTiz: TimeInZones | null =
      hrZones || pwrZones
        ? {
            source: "tp_csv",
            ...(hrZones ? { hr: hrZones } : {}),
            ...(pwrZones ? { power: pwrZones } : {}),
          }
        : null;

    const notes = [row.CoachComments, row.AthleteComments]
      .filter(Boolean)
      .join("\n");

    const shared = {
      title,
      description: row.WorkoutDescription || null,
      plannedDurationSec: num(row.PlannedDuration)
        ? Math.round(num(row.PlannedDuration)! * 3600)
        : null,
      plannedDistanceM: num(row.PlannedDistanceInMeters)
        ? Math.round(num(row.PlannedDistanceInMeters)!)
        : null,
      rpe: num(row.Rpe) ? Math.round(num(row.Rpe)!) : null,
      notes: notes || null,
    };

    // Match a workout the FIT pass (or a previous run) already created:
    // same date+sport, closest by distance when the day has several.
    const candidates = (byKey.get(`${date}|${sport}`) ?? []).filter(
      (w) => !matched.has(w.id),
    );
    const target =
      candidates.length > 1 && actualDistanceM
        ? [...candidates].sort(
            (a, b) =>
              Math.abs((a.actualDistanceM ?? 0) - actualDistanceM) -
              Math.abs((b.actualDistanceM ?? 0) - actualDistanceM),
          )[0]
        : candidates[0];

    if (target) {
      matched.add(target.id);
      await db
        .update(workouts)
        .set({
          ...shared,
          load: target.load ?? (num(row.TSS) ? Math.round(num(row.TSS)!) : null),
          timeInZones: target.timeInZones ?? csvTiz,
        })
        .where(eq(workouts.id, target.id));
      csvStats.enriched++;
    } else {
      const completed = actualDurationSec != null || actualDistanceM != null;
      await db.insert(workouts).values({
        athleteId: athlete.id,
        createdById: coach.id,
        sport,
        status: completed ? "completed" : "planned",
        source: "tp_import",
        date,
        ...shared,
        actualDurationSec,
        actualDistanceM,
        avgHr: num(row.HeartRateAverage)
          ? Math.round(num(row.HeartRateAverage)!)
          : null,
        maxHr: num(row.HeartRateMax) ? Math.round(num(row.HeartRateMax)!) : null,
        avgPowerW: num(row.PowerAverage)
          ? Math.round(num(row.PowerAverage)!)
          : null,
        load: num(row.TSS) ? Math.round(num(row.TSS)!) : null,
        timeInZones: csvTiz,
      });
      csvStats.inserted++;
    }
  }
  console.log(
    `CSV workouts: ${csvStats.enriched} enriched, ${csvStats.inserted} inserted, ${csvStats.skipped} skipped`,
  );

  // ---------------------------------------------------------------------
  // metrics.csv pass
  // ---------------------------------------------------------------------

  const metricRows = parseCsv(
    readFileSync(join(EXPORT_DIR, "metrics.csv"), "utf8"),
  );
  const kindMap: Record<string, string> = {
    "Body Battery": "body_battery",
    "Stress Level": "stress",
    Pulse: "resting_hr",
    Menstruation: "menstruation",
    Sickness: "sickness",
  };
  let metricCount = 0;
  for (const row of metricRows) {
    const kind = kindMap[row.Type];
    const date = row.Timestamp?.slice(0, 10);
    if (!kind || !date) continue;
    // "Min : 20 / Max : 89 / Avg : 50" or a bare number.
    const value: Record<string, number> = {};
    if (row.Value.includes(":")) {
      for (const part of row.Value.split("/")) {
        const [label, v] = part.split(":").map((s) => s.trim());
        const n = Number(v);
        if (label && Number.isFinite(n)) value[label.toLowerCase()] = n;
      }
    } else {
      const n = Number(row.Value);
      if (Number.isFinite(n)) value.value = n;
    }
    if (Object.keys(value).length === 0) continue;
    await db
      .insert(athleteDailyMetrics)
      .values({ athleteId: athlete.id, date, kind, value })
      .onConflictDoUpdate({
        target: [
          athleteDailyMetrics.athleteId,
          athleteDailyMetrics.date,
          athleteDailyMetrics.kind,
        ],
        set: { value },
      });
    metricCount++;
  }
  console.log(`Metrics: ${metricCount} upserted`);
  console.log("Done.");
}

// Minimal CSV parser handling quoted fields with embedded commas/newlines
// and doubled quotes; returns rows keyed by header names.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
