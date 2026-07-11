import { and, asc, eq, isNull, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  athleteThresholds,
  type AthleteThresholds,
  type NewAthleteThresholds,
} from "@/db/schema";
import {
  getTestDetail,
  stepsToInput,
  testBaseline,
  testSport,
} from "@/lib/lactate-data";
import { analyzeLactate } from "@/lib/lactate";
import { pickThresholdsForDate } from "@/lib/zones";

export async function getThresholdHistory(
  athleteId: string,
): Promise<AthleteThresholds[]> {
  return db
    .select()
    .from(athleteThresholds)
    .where(
      and(
        eq(athleteThresholds.athleteId, athleteId),
        isNull(athleteThresholds.deletedAt),
      ),
    )
    .orderBy(asc(athleteThresholds.effectiveDate), asc(athleteThresholds.createdAt));
}

/** Snapshot in force on `isoDate`, or null when the athlete has none. */
export async function getThresholdsForDate(
  athleteId: string,
  isoDate: string,
): Promise<AthleteThresholds | null> {
  const rows = await db
    .select()
    .from(athleteThresholds)
    .where(
      and(
        eq(athleteThresholds.athleteId, athleteId),
        isNull(athleteThresholds.deletedAt),
        lte(athleteThresholds.effectiveDate, isoDate),
      ),
    )
    .orderBy(asc(athleteThresholds.effectiveDate), asc(athleteThresholds.createdAt));
  return rows.at(-1) ?? null;
}

/** The athlete's current profile: the snapshot in force today (server time). */
export async function getCurrentThresholds(
  athleteId: string,
): Promise<AthleteThresholds | null> {
  const history = await getThresholdHistory(athleteId);
  const today = new Date().toISOString().slice(0, 10);
  return pickThresholdsForDate(history, today);
}

/**
 * Derive (or refresh) the threshold snapshot for a lactate test from its LT
 * consensus, carrying forward the other sports' values from the profile in
 * force at the test date. Called after every step/baseline change so the
 * athlete card always reflects the latest measurement. Removes the snapshot
 * again if the test no longer yields an LT2 (steps deleted, test deleted).
 */
export async function syncThresholdsFromTest(testId: string): Promise<void> {
  const [existing] = await db
    .select()
    .from(athleteThresholds)
    .where(
      and(
        eq(athleteThresholds.lactateTestId, testId),
        isNull(athleteThresholds.deletedAt),
      ),
    )
    .limit(1);

  // getTestDetail already excludes soft-deleted tests, so a deleted test
  // falls through to snapshot removal below.
  const detail = await getTestDetail(testId);
  const analysis = detail
    ? analyzeLactate(
        testSport(detail.test),
        stepsToInput(detail.steps),
        testBaseline(detail.test),
      )
    : null;

  if (!detail || !analysis?.lt2) {
    if (existing) {
      await db
        .update(athleteThresholds)
        .set({ deletedAt: new Date() })
        .where(eq(athleteThresholds.id, existing.id));
    }
    return;
  }

  const { test } = detail;
  const sport = testSport(test);
  const lt1 = analysis.lt1;
  const lt2 = analysis.lt2;

  // Carry forward the other sports' values from the profile in force at the
  // test date, excluding this test's own snapshot (which we're rewriting).
  const history = await getThresholdHistory(test.athleteId);
  const candidates = history.filter(
    (r) => r.lactateTestId !== testId && r.effectiveDate <= test.testDate,
  );
  const prior = candidates.at(-1) ?? null;

  const values: NewAthleteThresholds = {
    athleteId: test.athleteId,
    setById: test.conductedById,
    source: "lactate_test",
    lactateTestId: test.id,
    effectiveDate: test.testDate,
    maxHr: prior?.maxHr ?? null,
    ftpW: prior?.ftpW ?? null,
    bikeLthr: prior?.bikeLthr ?? null,
    bikeLt1W: prior?.bikeLt1W ?? null,
    runThresholdPaceSecPerKm: prior?.runThresholdPaceSecPerKm ?? null,
    runLthr: prior?.runLthr ?? null,
    runThresholdPowerW: prior?.runThresholdPowerW ?? null,
    runLt1PaceSecPerKm: prior?.runLt1PaceSecPerKm ?? null,
    cssPaceSecPer100m: prior?.cssPaceSecPer100m ?? null,
    swimLthr: prior?.swimLthr ?? null,
    zoneOverrides: prior?.zoneOverrides ?? null,
    notes: `Derived from lactate test${test.title ? ` “${test.title}”` : ""}`,
  };

  if (sport === "bike") {
    values.ftpW = Math.round(lt2.value);
    values.bikeLthr = lt2.heartRate ?? values.bikeLthr;
    values.bikeLt1W = lt1 ? Math.round(lt1.value) : values.bikeLt1W;
  } else if (sport === "run") {
    values.runThresholdPaceSecPerKm = Math.round(lt2.value);
    values.runLthr = lt2.heartRate ?? values.runLthr;
    values.runLt1PaceSecPerKm = lt1
      ? Math.round(lt1.value)
      : values.runLt1PaceSecPerKm;
  } else if (sport === "swim") {
    values.cssPaceSecPer100m = Math.round(lt2.value);
    values.swimLthr = lt2.heartRate ?? values.swimLthr;
  }

  if (existing) {
    await db
      .update(athleteThresholds)
      .set(values)
      .where(eq(athleteThresholds.id, existing.id));
  } else {
    await db.insert(athleteThresholds).values(values);
  }
}
