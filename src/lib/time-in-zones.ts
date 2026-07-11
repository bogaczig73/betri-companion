import { and, eq, isNull, or, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { workouts, type Sport, type Workout } from "@/db/schema";
import { bucketValue } from "@/lib/fit-histograms";
import { getThresholdHistory } from "@/lib/thresholds";
import {
  pickThresholdsForDate,
  zoneIndex,
  zoneSet,
  ZONE_COUNT,
  type ThresholdValues,
  type TimeInZones,
} from "@/lib/zones";

type WorkoutHistograms = Pick<
  Workout,
  "hrHistogram" | "powerHistogram" | "speedHistogram"
>;

/**
 * Seconds per zone from stored histograms + a threshold profile. Pure aside
 * from types. Returns null when no metric could be resolved (no thresholds or
 * no histogram data).
 */
export function computeTimeInZones(
  histograms: WorkoutHistograms,
  thresholds: ThresholdValues,
  sport: Sport,
  source: TimeInZones["source"],
): TimeInZones | null {
  const out: TimeInZones = { source };
  let any = false;

  const bin = (
    metric: "hr" | "power" | "pace",
    histogram: Record<string, number> | null,
    histogramMetric: "hr" | "power" | "speed",
  ) => {
    if (!histogram) return;
    const zones = zoneSet(thresholds, sport, metric);
    if (!zones) return;
    const seconds = new Array(ZONE_COUNT).fill(0);
    for (const [key, sec] of Object.entries(histogram)) {
      seconds[zoneIndex(zones, bucketValue(histogramMetric, key))] += sec;
    }
    out[metric] = seconds;
    any = true;
  };

  bin("hr", histograms.hrHistogram, "hr");
  bin("power", histograms.powerHistogram, "power");
  // Pace zones only make sense for run/swim; bike speed varies with terrain.
  if (sport === "run" || sport === "swim") {
    bin("pace", histograms.speedHistogram, "speed");
  }

  return any ? out : null;
}

/**
 * Re-derive the timeInZones cache for every histogram-bearing workout of an
 * athlete, using the thresholds effective at each workout's date. Called
 * after threshold saves; tp_csv-sourced zone data has no histograms and is
 * left untouched.
 */
export async function recomputeTimeInZonesForAthlete(
  athleteId: string,
): Promise<number> {
  const history = await getThresholdHistory(athleteId);
  if (history.length === 0) return 0;

  const rows = await db
    .select()
    .from(workouts)
    .where(
      and(
        eq(workouts.athleteId, athleteId),
        isNull(workouts.deletedAt),
        or(
          isNotNull(workouts.hrHistogram),
          isNotNull(workouts.powerHistogram),
          isNotNull(workouts.speedHistogram),
        ),
      ),
    );

  let updated = 0;
  for (const w of rows) {
    const thresholds = pickThresholdsForDate(history, w.date);
    if (!thresholds) continue;
    const next = computeTimeInZones(w, thresholds, w.sport, "recompute");
    if (!next) continue;
    if (sameZones(next, w.timeInZones)) continue;
    await db
      .update(workouts)
      .set({ timeInZones: next })
      .where(eq(workouts.id, w.id));
    updated++;
  }
  return updated;
}

// Key-order-insensitive equality (jsonb reorders keys); the recompute source
// tag is ignored so an unchanged split isn't rewritten on every run.
function sameZones(a: TimeInZones, b: TimeInZones | null): boolean {
  if (!b) return false;
  for (const metric of ["hr", "power", "pace"] as const) {
    const av = a[metric];
    const bv = b[metric];
    if (!av !== !bv) return false;
    if (av && bv && (av.length !== bv.length || av.some((v, i) => v !== bv[i]))) {
      return false;
    }
  }
  return true;
}
