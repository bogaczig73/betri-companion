/**
 * Presentation adapter over the pure engine, generalized across sports.
 *
 * Callers pass recorded steps in sport-native units (watts for bike, seconds
 * for run/swim). We convert to the engine's ascending intensity, run every
 * threshold method, then translate each result's intensity back to the recorded
 * unit for display. Pure and client-safe.
 */

import { analyze, LactateInputError } from "./analyze";
import { sportIntensity, type LactateSport } from "./sport";
import type { AnalyzeOptions, Result } from "./types";

export interface StepInput {
  /** Sport-native recorded intensity: watts (bike) or seconds (run/swim). */
  value: number | null;
  lactate: number | null;
  heartRate?: number | null;
}

export interface LactateBaseline {
  /** Sport-native recorded value (watts or seconds). */
  value: number | null;
  lactate: number | null;
  includeBaseline: boolean;
}

export interface SportResult extends Result {
  /** Recorded-unit value at the threshold (watts or seconds); null if unreached. */
  value: number | null;
  /** Preformatted, e.g. "245 W" or "4:12/km". */
  valueLabel: string;
}

export interface Consensus {
  intensity: number;
  value: number;
  valueLabel: string;
  lactate: number;
  heartRate: number | null;
}

export interface CurvePoint {
  intensity: number;
  value: number;
  valueLabel: string;
  lactate: number;
  heartRate: number | null;
}

export interface LactateAnalysis {
  results: SportResult[];
  lt1: Consensus | null;
  lt2: Consensus | null;
  points: CurvePoint[];
  warnings: string[];
  /** Number of usable (value + lactate) steps. */
  usable: number;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarise(
  sport: LactateSport,
  results: SportResult[],
): Consensus | null {
  const si = sportIntensity(sport);
  const valid = results.filter((r) => Number.isFinite(r.intensity));
  if (valid.length === 0) return null;
  const intensity = median(valid.map((r) => r.intensity));
  const hrs = valid
    .map((r) => r.heartRate)
    .filter((h): h is number => h != null);
  const value = si.fromIntensity(intensity);
  return {
    intensity,
    value,
    valueLabel: si.formatValue(value),
    lactate: median(valid.map((r) => r.lactate)),
    heartRate: hrs.length ? Math.round(median(hrs)) : null,
  };
}

export function analyzeLactate(
  sport: LactateSport,
  steps: StepInput[],
  baseline: LactateBaseline | null,
  options: Pick<AnalyzeOptions, "fit" | "loglogRestrainer"> = {},
): LactateAnalysis {
  const si = sportIntensity(sport);
  const rows = steps.filter(
    (s) => s.value != null && s.value > 0 && s.lactate != null,
  );
  const points: CurvePoint[] = rows
    .map((s) => {
      const value = s.value as number;
      return {
        intensity: si.toIntensity(value),
        value,
        valueLabel: si.formatValue(value),
        lactate: s.lactate as number,
        heartRate: s.heartRate ?? null,
      };
    })
    .sort((a, b) => a.intensity - b.intensity);

  const out: LactateAnalysis = {
    results: [],
    lt1: null,
    lt2: null,
    points,
    warnings: [],
    usable: rows.length,
  };
  if (points.length < 3) {
    out.warnings.push(
      "Need at least 3 steps with both intensity and lactate to compute thresholds.",
    );
    return out;
  }

  // Two steps at the same intensity (e.g. a duplicate power) make the curve
  // ill-defined; the engine rejects them. Surface that as a warning instead of
  // throwing so the page still renders the entered points.
  const distinct = new Set(points.map((p) => p.intensity));
  if (distinct.size < points.length) {
    out.warnings.push(
      "Two or more steps share the same intensity — thresholds need strictly increasing intensity. Adjust the duplicates.",
    );
    return out;
  }

  const baseIncluded =
    baseline?.includeBaseline &&
    baseline.value != null &&
    baseline.value > 0 &&
    baseline.lactate != null;

  let results: Result[];
  let warnings: string[];
  try {
    ({ results, warnings } = analyze(
      points.map((p) => ({
        intensity: p.intensity,
        lactate: p.lactate,
        heartRate: p.heartRate,
      })),
      {
        fit: options.fit,
        loglogRestrainer: options.loglogRestrainer,
        baselineLactate: baseline?.lactate ?? undefined,
        baselineIntensity: baseIncluded
          ? si.toIntensity(baseline!.value as number)
          : undefined,
        includeBaseline: Boolean(baseIncluded),
      },
    ));
  } catch (e) {
    out.warnings.push(
      e instanceof LactateInputError
        ? e.message
        : "Could not compute thresholds from these steps.",
    );
    return out;
  }

  out.results = results.map((r) => {
    const value = Number.isFinite(r.intensity)
      ? si.fromIntensity(r.intensity)
      : null;
    return {
      ...r,
      value,
      valueLabel: value != null ? si.formatValue(value) : "—",
    };
  });
  out.warnings = warnings;
  out.lt1 = summarise(sport, out.results.filter((r) => r.estimates === "LT1"));
  out.lt2 = summarise(sport, out.results.filter((r) => r.estimates === "LT2"));
  return out;
}
