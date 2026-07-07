/**
 * Lactate-threshold calculation engine. Pure, framework-free; safe to import on
 * the server or the client.
 *
 * The core (analyze/methods/fit/bspline) is ported verbatim from the `lactater`
 * R package reference and validated against its documented demo outputs — see
 * scripts/validate-lactate.ts (17/17 methods within ±4 W). The sport adapter
 * (sport.ts, analysis.ts) generalizes the running-only reference to run/bike/
 * swim.
 */

export { analyze, LactateInputError, type AnalyzeOutput } from "./analyze";
export type {
  AnalyzeOptions,
  Estimates,
  Fitting,
  MethodCategory,
  PolyDegree,
  Result,
  Stage,
} from "./types";
export { mmolToMilli, milliToMmol } from "./units";
export {
  LACTATE_SPORTS,
  isLactateSport,
  sportIntensity,
  type LactateSport,
  type SportIntensity,
} from "./sport";
export {
  analyzeLactate,
  summarise,
  type Consensus,
  type CurvePoint,
  type LactateAnalysis,
  type LactateBaseline,
  type SportResult,
  type StepInput,
} from "./analysis";
