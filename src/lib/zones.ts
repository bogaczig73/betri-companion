/**
 * Zones & thresholds — pure, client-safe.
 *
 * An athlete's thresholds live in athlete_thresholds as effective-dated
 * snapshots (see src/db/schema.ts). This module derives zone boundaries from
 * a snapshot and answers "which zone does this value fall in".
 *
 * Internally every metric works in an **ascending** space (higher = harder):
 * bpm for HR, watts for power, speed in m/s for pace (so run/swim pace is
 * converted; a faster pace is a higher speed). A zone set is 4 ascending cut
 * points splitting the space into 5 zones: Z1 < c0, Z2 [c0,c1), … Z5 >= c3.
 *
 * Default derivations:
 *   - HR:    Friel-style from LTHR — Z2 at 85%, Z3 at 90%, Z4 at 95%, Z5 at 100%.
 *   - Power: Coggan from FTP (Z5+ collapsed) — 55 / 76 / 91 / 106 % FTP.
 *   - Pace:  % of threshold speed — 75 / 85 / 93 / 100 %.
 *
 * A coach can pin explicit boundaries via zoneOverrides (same ascending
 * units); overrides win over derivation.
 */

import type { Sport } from "@/db/schema";

export const ZONE_COUNT = 5;

export const ZONE_LABELS = ["Z1", "Z2", "Z3", "Z4", "Z5"] as const;

// Z1 blue → Z5 red; fixed hexes so charts look identical in light/dark.
export const ZONE_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#f97316",
  "#ef4444",
] as const;

export type ZoneMetric = "hr" | "power" | "pace";

/** Seconds spent per zone (index 0 = Z1). Arrays may be longer than 5 for
 * imported data that used more zones (TrainingPeaks power has 7+). */
export type TimeInZones = {
  hr?: number[];
  power?: number[];
  pace?: number[];
  /** fit = computed from FIT records at import; tp_csv = imported zone
   * minutes (not recomputable); recompute = re-derived after a zone change. */
  source: "fit" | "tp_csv" | "recompute";
};

/** Explicit boundary pins: 4 ascending cut points per metric+sport, in the
 * metric's ascending unit (bpm / watts / speed m/s). */
export type ZoneOverrides = {
  hr?: Partial<Record<Sport, number[]>>;
  power?: Partial<Record<Sport, number[]>>;
  pace?: Partial<Record<Sport, number[]>>;
};

/** The subset of an athlete_thresholds row that zone math needs. The Drizzle
 * row type satisfies this structurally. */
export type ThresholdValues = {
  maxHr: number | null;
  ftpW: number | null;
  bikeLthr: number | null;
  bikeLt1W: number | null;
  runThresholdPaceSecPerKm: number | null;
  runLthr: number | null;
  runThresholdPowerW: number | null;
  runLt1PaceSecPerKm: number | null;
  cssPaceSecPer100m: number | null;
  swimLthr: number | null;
  zoneOverrides: ZoneOverrides | null;
};

/** 4 ascending cut points in the metric's ascending unit. */
export type ZoneSet = {
  metric: ZoneMetric;
  cuts: number[];
};

export const HR_FRACTIONS = [0.85, 0.9, 0.95, 1.0];
export const POWER_FRACTIONS = [0.55, 0.76, 0.91, 1.06];
export const PACE_SPEED_FRACTIONS = [0.75, 0.85, 0.93, 1.0];

export function lthrForSport(t: ThresholdValues, sport: Sport): number | null {
  switch (sport) {
    case "bike":
      return t.bikeLthr;
    case "run":
      return t.runLthr;
    case "swim":
      return t.swimLthr;
    default:
      return null;
  }
}

export function thresholdPowerForSport(
  t: ThresholdValues,
  sport: Sport,
): number | null {
  if (sport === "bike") return t.ftpW;
  if (sport === "run") return t.runThresholdPowerW;
  return null;
}

/** Threshold speed in m/s for pace-based sports. */
export function thresholdSpeedForSport(
  t: ThresholdValues,
  sport: Sport,
): number | null {
  if (sport === "run" && t.runThresholdPaceSecPerKm) {
    return 1000 / t.runThresholdPaceSecPerKm;
  }
  if (sport === "swim" && t.cssPaceSecPer100m) {
    return 100 / t.cssPaceSecPer100m;
  }
  return null;
}

function fromFractions(anchor: number, fractions: number[]): number[] {
  return fractions.map((f) => anchor * f);
}

/** Zone boundaries for one metric+sport, or null when the needed threshold
 * (or override) is missing. Overrides win when present and well-formed. */
export function zoneSet(
  t: ThresholdValues,
  sport: Sport,
  metric: ZoneMetric,
): ZoneSet | null {
  const override = t.zoneOverrides?.[metric]?.[sport];
  if (override && override.length === ZONE_COUNT - 1) {
    return { metric, cuts: override };
  }
  if (metric === "hr") {
    const lthr = lthrForSport(t, sport);
    return lthr ? { metric, cuts: fromFractions(lthr, HR_FRACTIONS) } : null;
  }
  if (metric === "power") {
    const anchor = thresholdPowerForSport(t, sport);
    return anchor
      ? { metric, cuts: fromFractions(anchor, POWER_FRACTIONS) }
      : null;
  }
  const speed = thresholdSpeedForSport(t, sport);
  return speed
    ? { metric, cuts: fromFractions(speed, PACE_SPEED_FRACTIONS) }
    : null;
}

/** 0-based zone index (0 = Z1 … 4 = Z5) for an ascending-unit value. */
export function zoneIndex(zones: ZoneSet, value: number): number {
  let i = 0;
  while (i < zones.cuts.length && value >= zones.cuts[i]) i++;
  return i;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

function paceString(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

/** Ascending-unit value → human string in the sport's native display unit.
 * Pace flips back from speed to min/km or min/100m. */
export function formatZoneValue(
  sport: Sport,
  metric: ZoneMetric,
  value: number,
): string {
  if (metric === "hr") return `${Math.round(value)} bpm`;
  if (metric === "power") return `${Math.round(value)} W`;
  if (sport === "swim") return `${paceString(100 / value)}/100m`;
  return `${paceString(1000 / value)}/km`;
}

export type ZoneRangeLabel = {
  zone: number; // 1-based
  label: string;
  color: string;
  /** e.g. "< 138 bpm", "138–146 bpm", "≥ 162 bpm" — pace ranges are shown
   * slowest-first in native pace units. */
  range: string;
};

/** Human-readable zone table for one metric+sport. */
export function describeZones(
  sport: Sport,
  zones: ZoneSet,
): ZoneRangeLabel[] {
  const { metric, cuts } = zones;
  const fmt = (v: number) => formatZoneValue(sport, metric, v);
  // Strip the unit for the low side of a range so "138–146 bpm" reads well.
  const bare = (v: number) => fmt(v).replace(/[^0-9:.]+$/, "").trim();
  const isPace = metric === "pace";
  return Array.from({ length: cuts.length + 1 }, (_, i) => {
    let range: string;
    if (i === 0) {
      // Z1: easier than the first cut. For pace "easier" = slower.
      range = isPace ? `slower than ${fmt(cuts[0])}` : `< ${fmt(cuts[0])}`;
    } else if (i === cuts.length) {
      range = isPace ? `faster than ${fmt(cuts[i - 1])}` : `≥ ${fmt(cuts[i - 1])}`;
    } else {
      // Middle zones: "138–146 bpm"; pace pairs read slowest → fastest
      // because ascending speed already orders them that way.
      range = `${bare(cuts[i - 1])}–${fmt(cuts[i])}`;
    }
    return {
      zone: i + 1,
      label: ZONE_LABELS[i] ?? `Z${i + 1}`,
      color: ZONE_COLORS[i] ?? ZONE_COLORS[ZONE_COLORS.length - 1],
      range,
    };
  });
}

// ---------------------------------------------------------------------------
// Snapshot selection
// ---------------------------------------------------------------------------

/** Latest snapshot in force on `isoDate` (effectiveDate <= isoDate). Falls
 * back to the earliest snapshot so pre-history workouts still get zones. */
export function pickThresholdsForDate<
  T extends { effectiveDate: string },
>(rows: T[], isoDate: string): T | null {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate),
  );
  let picked: T | null = null;
  for (const row of sorted) {
    if (row.effectiveDate <= isoDate) picked = row;
  }
  return picked ?? sorted[0];
}
