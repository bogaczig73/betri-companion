/**
 * Orchestrator: preprocess stages, build the per-method fits, run every method,
 * and return one flat list of `Result` records. Pure and deterministic.
 *
 * Baseline handling mirrors `lactater`: OBLA/Bsln+/Dmax fit on baseline-excluded
 * data; Log-log/LTP/LTratio fit on the baseline-included curve when a baseline
 * is supplied and `includeBaseline` is set.
 */

import { bsplineCurve } from "./bspline";
import { degreeOf, expCurve, polyCurve } from "./fit";
import {
  bslnPlus,
  type Ctx,
  dmaxFamily,
  logLog,
  logLogIntensity,
  ltp,
  ltRatio,
  obla,
} from "./methods";
import type { AnalyzeOptions, Result, Stage } from "./types";

export interface AnalyzeOutput {
  results: Result[];
  /** Test-level warnings (data sufficiency, etc.). */
  warnings: string[];
  /** Baseline-excluded stages actually used (sorted). */
  stages: Stage[];
}

export class LactateInputError extends Error {}

export function analyze(
  input: Stage[],
  options: AnalyzeOptions = {},
): AnalyzeOutput {
  const fit = options.fit ?? "3rd degree polynomial";
  const degree = degreeOf(fit);
  const restrainer = options.loglogRestrainer ?? 1;

  // 1. Sort ascending; 2. validate strictly increasing intensity.
  const stages = [...input].sort((a, b) => a.intensity - b.intensity);
  for (let i = 1; i < stages.length; i++) {
    if (stages[i].intensity <= stages[i - 1].intensity) {
      throw new LactateInputError(
        `Intensities must strictly increase; found ${stages[i - 1].intensity} then ${stages[i].intensity}.`,
      );
    }
  }

  const warnings: string[] = [];
  if (stages.length < 4) {
    warnings.push("Fewer than 4 stages — results are unreliable; 5+ recommended.");
  } else if (stages.length < 5) {
    warnings.push("Only 4 stages — Dmax-family and segmented methods may be unstable.");
  }
  if (stages.length < 3) return { results: [], warnings, stages };

  const xs = stages.map((s) => s.intensity);
  const ys = stages.map((s) => s.lactate);
  const baselineLactate = options.baselineLactate ?? ys[0];

  // 3. Baseline-included series (a synthetic point below the first stage).
  let inclXs = xs;
  let inclYs = ys;
  if (
    options.includeBaseline &&
    options.baselineIntensity != null &&
    options.baselineIntensity < xs[0]
  ) {
    inclXs = [options.baselineIntensity, ...xs];
    inclYs = [baselineLactate, ...ys];
  }

  const ctx: Ctx = {
    stages,
    xs,
    ys,
    polyExcl: polyCurve(xs, ys, degree),
    expExcl: expCurve(xs, ys),
    inclXs,
    inclYs,
    polyIncl: polyCurve(inclXs, inclYs, degree),
    fitting: fit,
    baselineLactate,
  };

  // Modest knot count for the LTratio spline, scaled to the data length.
  const knots = Math.max(1, Math.min(3, Math.floor((inclXs.length - 1) / 3)));

  const results: Result[] = [];
  results.push(...obla(ctx));
  results.push(...bslnPlus(ctx));

  // Log-log is computed once and reused by the Dmax log-variants.
  const llI = logLogIntensity(ctx, restrainer);
  const ll = logLog(ctx, restrainer);
  if (ll) results.push(ll);

  results.push(...dmaxFamily(ctx, llI));
  results.push(...ltp(ctx));
  results.push(ltRatio(ctx, bsplineCurve(inclXs, inclYs, knots)));

  return { results, warnings, stages };
}
