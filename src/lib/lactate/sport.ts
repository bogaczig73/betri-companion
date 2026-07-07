/**
 * Sport adapter for the lactate engine.
 *
 * The engine (analyze.ts) works purely in an **ascending** intensity space
 * (higher number = harder effort). Different sports record intensity in
 * different, sometimes-descending units, so each sport declares how to convert
 * the recorded value ↔ the engine's ascending intensity, plus how to display it.
 *
 *   - bike:  recorded value is power in watts — already ascending, 1:1.
 *   - run:   recorded value is pace in seconds/km — DEscending, so we convert
 *            to speed (km/h) for the engine and back to pace for display.
 *   - swim:  recorded value is pace in seconds/100 m — same treatment as run.
 *   - strength: no meaningful lactate-threshold protocol; not offered.
 *
 * The `value` stored per step (lactate_steps.intensity_value) is always the
 * recorded, sport-native unit: watts for bike, seconds for run/swim.
 */

import type { Sport } from "@/db/schema";

export type LactateSport = Extract<Sport, "run" | "bike" | "swim">;

export const LACTATE_SPORTS: LactateSport[] = ["run", "bike", "swim"];

export function isLactateSport(sport: Sport): sport is LactateSport {
  return sport === "run" || sport === "bike" || sport === "swim";
}

export interface SportIntensity {
  /** Label for the recorded input column, e.g. "Power" or "Pace". */
  valueLabel: string;
  /** Short unit shown next to the input, e.g. "W", "/km", "/100m". */
  valueUnit: string;
  /** Whether higher recorded value = harder (power) or easier (pace). */
  higherIsHarder: boolean;
  /** Recorded value (W or sec) → engine intensity (ascending). */
  toIntensity: (value: number) => number;
  /** Engine intensity → recorded value (W or sec). */
  fromIntensity: (intensity: number) => number;
  /** Human-readable recorded value, e.g. "245 W" or "4:12/km". */
  formatValue: (value: number) => string;
  /** Axis/marker label for an engine intensity. */
  formatIntensity: (intensity: number) => string;
}

function paceString(seconds: number, unit: string): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}${unit}`;
}

const RUN: SportIntensity = {
  valueLabel: "Pace",
  valueUnit: "/km",
  higherIsHarder: false,
  // pace (sec/km) → speed (km/h)
  toIntensity: (sec) => 3600 / sec,
  fromIntensity: (kmh) => 3600 / kmh,
  formatValue: (sec) => paceString(sec, "/km"),
  formatIntensity: (kmh) => paceString(3600 / kmh, "/km"),
};

const SWIM: SportIntensity = {
  valueLabel: "Pace",
  valueUnit: "/100m",
  higherIsHarder: false,
  // pace (sec/100m) → speed (m/s), engine just needs "ascending"
  toIntensity: (sec) => 100 / sec,
  fromIntensity: (ms) => 100 / ms,
  formatValue: (sec) => paceString(sec, "/100m"),
  formatIntensity: (ms) => paceString(100 / ms, "/100m"),
};

const BIKE: SportIntensity = {
  valueLabel: "Power",
  valueUnit: "W",
  higherIsHarder: true,
  toIntensity: (w) => w,
  fromIntensity: (w) => w,
  formatValue: (w) => `${Math.round(w)} W`,
  formatIntensity: (w) => `${Math.round(w)} W`,
};

const BY_SPORT: Record<LactateSport, SportIntensity> = {
  run: RUN,
  swim: SWIM,
  bike: BIKE,
};

export function sportIntensity(sport: LactateSport): SportIntensity {
  return BY_SPORT[sport];
}
