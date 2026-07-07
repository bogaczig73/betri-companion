/**
 * Lactate-threshold calculation engine — shared types.
 *
 * Pure, framework-free. The engine works in a single, **ascending** intensity
 * space (higher intensity = harder effort). For running, where the app stores
 * pace (seconds/km, which *decreases* as effort rises), callers must convert to
 * a speed-like intensity before handing data to the engine — see `intensity.ts`.
 *
 * This mirrors the `lactater` R package; see the spec and the saved reference
 * fixture for the methodology and expected outputs.
 */

/** One step of the incremental protocol. Intensity is unit-agnostic. */
export interface Stage {
  /** Ascending across the test (power W, speed km/h, …). */
  intensity: number;
  /** mmol/L, drawn at end of stage. */
  lactate: number;
  /** Averaged bpm for the stage; optional. */
  heartRate?: number | null;
}

export type Fitting =
  | "3rd degree polynomial"
  | "4th degree polynomial"
  | "B-spline"
  | "exponential";

export type Estimates = "LT1" | "LT2";

export type MethodCategory =
  | "Log-log"
  | "OBLA"
  | "Bsln+"
  | "Dmax"
  | "LTP"
  | "LTratio";

/** One computed threshold. One record per method so the UI can tabulate. */
export interface Result {
  methodCategory: MethodCategory;
  /** e.g. "OBLA 4.0", "ModDmax", "LTP2". */
  method: string;
  fitting: Fitting;
  estimates: Estimates;
  /** Intensity in the engine's ascending space. */
  intensity: number;
  /** Lactate (mmol/L) at that intensity. */
  lactate: number;
  /** Interpolated from raw stages; null if unavailable. */
  heartRate: number | null;
  warnings: string[];
}

export type PolyDegree = "3rd degree polynomial" | "4th degree polynomial";

export interface AnalyzeOptions {
  /** Polynomial degree for the methods that use a polynomial fit. */
  fit?: PolyDegree;
  /** Feed a synthetic baseline point into the fit. */
  includeBaseline?: boolean;
  /** Resting/warm-up lactate; defaults to the first stage's lactate. */
  baselineLactate?: number | null;
  /** Intensity of the baseline point (needed only when includeBaseline). */
  baselineIntensity?: number | null;
  /** Restrict the log-log breakpoint search to the lower fraction (0..1]. */
  loglogRestrainer?: number;
}
