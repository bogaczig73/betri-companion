/**
 * TSS estimation — pure, client-safe.
 *
 * TSS = hours × IF² × 100, where IF is intensity relative to threshold.
 * Planned load comes from the workout structure (each step's target midpoint
 * is its IF). Actual load falls back through: device-reported `load` →
 * power IF → pace IF → HR time-in-zones weights.
 */

import type { Sport, Workout } from "@/db/schema";
import { bucketValue } from "@/lib/fit-histograms";
import {
  flattenSteps,
  stepDurationSec,
  type StructureStep,
  type WorkoutStructure,
} from "@/lib/structure";
import {
  HR_FRACTIONS,
  PACE_SPEED_FRACTIONS,
  pickThresholdsForDate,
  POWER_FRACTIONS,
  thresholdPowerForSport,
  thresholdSpeedForSport,
  ZONE_COUNT,
  type ThresholdValues,
  type TimeInZones,
} from "@/lib/zones";

/** Per-workout load pair, computed in RSC pages and passed to the calendar. */
export type WorkoutTss = { planned?: number; actual?: number };

/**
 * Planned vs actual load per workout (actual = device TSS or estimate under
 * the thresholds in force on the workout date).
 */
export function buildTssMap(
  workouts: (ActualTssInput & {
    id: string;
    date: string;
    status: string;
    structure: WorkoutStructure | null;
    plannedDurationSec: number | null;
  })[],
  thresholdHistory: (ThresholdValues & { effectiveDate: string })[],
): Record<string, WorkoutTss> {
  const map: Record<string, WorkoutTss> = {};
  for (const w of workouts) {
    const entry: WorkoutTss = {};
    const planned = estimatePlannedTss(w.structure, w.plannedDurationSec);
    if (planned != null) entry.planned = planned;
    if (w.status === "completed") {
      const actual = estimateActualTss(
        w,
        pickThresholdsForDate(thresholdHistory, w.date),
      );
      if (actual) entry.actual = actual.tss;
    }
    if (entry.planned != null || entry.actual != null) map[w.id] = entry;
  }
  return map;
}

export type TssEstimate = {
  tss: number;
  /** device = reported by the recording device (not an estimate). */
  method: "device" | "power" | "pace" | "hr";
};

export const TSS_METHOD_LABELS: Record<TssEstimate["method"], string> = {
  device: "reported by the device",
  power: "estimated from average power",
  pace: "estimated from average pace",
  hr: "estimated from heart-rate time in zones",
};

// Guard against nonsense from stale thresholds (IF 2 = 400 TSS/h).
const MAX_IF = 2;

// Untargeted steps: same per-kind intensities the profile chart assumes.
const KIND_IF: Record<StructureStep["kind"], number> = {
  warmup: 0.5,
  active: 0.75,
  recovery: 0.4,
  cooldown: 0.45,
  rest: 0.15,
};

// %ftp / %pace / %lthr targets are all "fraction of threshold", which is IF
// (close enough for %lthr); RPE 10 ≈ threshold effort.
function stepIf(step: StructureStep): number {
  if (!step.target) return KIND_IF[step.kind];
  const mid = (step.target.min + step.target.max) / 2;
  const pct = step.target.metric === "rpe" ? mid * 10 : mid;
  return Math.min(pct / 100, MAX_IF);
}

/**
 * Prescribed load from the structure; a structureless workout with a planned
 * duration gets a flat moderate-endurance IF of 0.7.
 */
export function estimatePlannedTss(
  structure: WorkoutStructure | null,
  plannedDurationSec?: number | null,
): number | null {
  if (!structure) {
    if (!plannedDurationSec) return null;
    return Math.round((plannedDurationSec / 3600) * 0.7 ** 2 * 100);
  }
  let tss = 0;
  for (const step of flattenSteps(structure)) {
    tss += (stepDurationSec(step) / 3600) * stepIf(step) ** 2 * 100;
  }
  return Math.round(tss);
}

// Zone cut points as threshold fractions, per target metric. rpe maps via
// stepIf (rpe×10 ≈ % threshold) and uses the power bands.
const METRIC_FRACTIONS: Record<string, number[]> = {
  "%ftp": POWER_FRACTIONS,
  "%lthr": HR_FRACTIONS,
  "%pace": PACE_SPEED_FRACTIONS,
  rpe: POWER_FRACTIONS,
};

/**
 * Projected seconds per zone (Z1–Z5) for a planned workout, from its
 * structure's targets — no thresholds needed since targets are already
 * threshold-relative.
 */
export function projectedZoneSeconds(structure: WorkoutStructure): number[] {
  const seconds = new Array(ZONE_COUNT).fill(0);
  for (const step of flattenSteps(structure)) {
    const fraction = stepIf(step);
    const cuts = step.target
      ? METRIC_FRACTIONS[step.target.metric]
      : POWER_FRACTIONS;
    let zone = 0;
    while (zone < cuts.length && fraction >= cuts[zone]) zone++;
    seconds[zone] += stepDurationSec(step);
  }
  return seconds;
}

// ponytail: coarse TSS/hour per HR zone (Z1→Z5), the last-resort fallback;
// replace with a TRIMP-style curve if hrTSS accuracy ever matters.
const HR_ZONE_TSS_PER_HOUR = [30, 55, 70, 90, 120];

type ActualTssInput = Pick<
  Workout,
  "load" | "actualDurationSec" | "actualDistanceM" | "avgPowerW"
> & {
  sport: Sport;
  timeInZones: TimeInZones | null;
  powerHistogram?: Record<string, number> | null;
};

// Normalized-Power stand-in: 4th-power mean of the stored power distribution.
// The histogram loses ordering (no 30 s smoothing), so it reads a touch high
// vs true NP — far closer than average power on variable rides.
function histogramNp(histogram: Record<string, number>): number | null {
  let sum4 = 0;
  let total = 0;
  for (const [key, sec] of Object.entries(histogram)) {
    sum4 += bucketValue("power", key) ** 4 * sec;
    total += sec;
  }
  return total > 0 ? (sum4 / total) ** 0.25 : null;
}

/**
 * Actual training load: device-reported when present, otherwise estimated
 * from normalized power (histogram) → average power → pace → HR zones.
 */
export function estimateActualTss(
  w: ActualTssInput,
  thresholds: ThresholdValues | null,
): TssEstimate | null {
  if (w.load != null) return { tss: w.load, method: "device" };

  const hours = w.actualDurationSec ? w.actualDurationSec / 3600 : null;
  if (hours && thresholds) {
    const ftp = thresholdPowerForSport(thresholds, w.sport);
    const histNp = w.powerHistogram ? histogramNp(w.powerHistogram) : null;
    // Bike power is spiky: with ordering lost the 4th-power mean overshoots
    // true NP about as much as average power undershoots it (checked against
    // TrainingPeaks TSS on real rides), so split the difference. Run power is
    // device-smoothed and the histogram alone tracks NP well.
    const power =
      w.sport === "bike" && histNp && w.avgPowerW
        ? (histNp + w.avgPowerW) / 2
        : (histNp ?? w.avgPowerW);
    if (power && ftp) {
      const intensity = Math.min(power / ftp, MAX_IF);
      return { tss: Math.round(hours * intensity ** 2 * 100), method: "power" };
    }
    const thresholdSpeed = thresholdSpeedForSport(thresholds, w.sport);
    if (w.actualDistanceM && w.actualDurationSec && thresholdSpeed) {
      const speed = w.actualDistanceM / w.actualDurationSec;
      const intensity = Math.min(speed / thresholdSpeed, MAX_IF);
      return { tss: Math.round(hours * intensity ** 2 * 100), method: "pace" };
    }
  }

  const hrSeconds = w.timeInZones?.hr;
  if (hrSeconds && hrSeconds.some((s) => s > 0)) {
    const tss = hrSeconds.reduce(
      (sum, sec, i) =>
        sum +
        (sec / 3600) *
          HR_ZONE_TSS_PER_HOUR[
            Math.min(i, HR_ZONE_TSS_PER_HOUR.length - 1)
          ],
      0,
    );
    return { tss: Math.round(tss), method: "hr" };
  }
  return null;
}
