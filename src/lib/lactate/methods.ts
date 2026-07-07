/**
 * Threshold methods, matched to the `lactater` reference (validated against its
 * documented demo). Key structural facts reverse-engineered from that package:
 *
 *  - OBLA, Bsln+ and the Dmax family fit on the **baseline-excluded** data.
 *  - Log-log and LTP fit on the **baseline-included** curve, sampled densely,
 *    then run continuous segmented (Muggeo) regression for the breakpoint(s).
 *  - "Log-Poly/Log-Exp-ModDmax" start their chord at the **Log-log threshold**
 *    (the "Log" prefix), not at a log transform.
 */

import {
  argmax,
  argmin,
  type Curve,
  interpHr,
  interpolateCurve,
  perpDistance,
  segmented1,
  segmented2,
  solveRising,
} from "./fit";
import type {
  Estimates,
  Fitting,
  MethodCategory,
  Result,
  Stage,
} from "./types";

export interface Ctx {
  /** Baseline-excluded stages, sorted ascending (used for raw geometry + HR). */
  stages: Stage[];
  xs: number[];
  ys: number[];
  /** Baseline-excluded fits. */
  polyExcl: Curve;
  expExcl: Curve;
  /** Baseline-included data + polynomial fit (== excluded if no baseline). */
  inclXs: number[];
  inclYs: number[];
  polyIncl: Curve;
  fitting: Fitting;
  baselineLactate: number;
}

function mk(
  category: MethodCategory,
  method: string,
  fitting: Fitting,
  estimates: Estimates,
  intensity: number,
  lactate: number,
  stages: Stage[],
  warnings: string[] = [],
): Result {
  return {
    methodCategory: category,
    method,
    fitting,
    estimates,
    intensity,
    lactate,
    heartRate: interpHr(stages, intensity),
    warnings,
  };
}

// ---------- OBLA (fixed absolute concentrations) ----------

export function obla(ctx: Ctx): Result[] {
  const { xs, polyExcl, stages, fitting } = ctx;
  const lo = xs[0];
  const hi = xs[xs.length - 1];
  return [2.0, 2.5, 3.0, 3.5, 4.0].map((target) => {
    const x = solveRising(polyExcl, target, lo, hi);
    return mk("OBLA", `OBLA ${target.toFixed(1)}`, fitting,
      target < 3 ? "LT1" : "LT2", x ?? NaN, target, stages,
      x == null ? ["target never reached in range"] : []);
  });
}

// ---------- Bsln+ (fixed delta above baseline) ----------

export function bslnPlus(ctx: Ctx): Result[] {
  const { xs, polyExcl, stages, fitting, baselineLactate } = ctx;
  const lo = xs[0];
  const hi = xs[xs.length - 1];
  return [0.5, 1.0, 1.5].map((delta) => {
    const target = baselineLactate + delta;
    const x = solveRising(polyExcl, target, lo, hi);
    return mk("Bsln+", `Bsln + ${delta.toFixed(1)}`, fitting, "LT1",
      x ?? NaN, target, stages,
      x == null ? ["target never reached in range"] : []);
  });
}

// ---------- Log-log (segmented regression, 1 breakpoint) ----------

/** Returns the threshold intensity (also reused by the Dmax log-variants). */
export function logLogIntensity(ctx: Ctx, restrainer: number): number | null {
  const { inclXs, polyIncl } = ctx;
  const lo = inclXs[0];
  const hi = inclXs[inclXs.length - 1];
  const dense = interpolateCurve(polyIncl, lo, hi, (hi - lo) / 1900);
  // log-log space; drop non-positive intensity/lactate.
  const lx: number[] = [];
  const ly: number[] = [];
  const limit = Math.ceil(restrainer * dense.xs.length);
  for (let i = 0; i < limit; i++) {
    if (dense.xs[i] > 0 && dense.ys[i] > 0) {
      lx.push(Math.log(dense.xs[i]));
      ly.push(Math.log(dense.ys[i]));
    }
  }
  if (lx.length < 4) return null;
  const psi = segmented1(lx, ly, lx[Math.floor(lx.length / 2)]);
  return Math.exp(psi);
}

export function logLog(ctx: Ctx, restrainer: number): Result | null {
  const x = logLogIntensity(ctx, restrainer);
  if (x == null || !Number.isFinite(x)) return null;
  return mk("Log-log", "Log-log", ctx.fitting, "LT1", x,
    ctx.polyIncl.eval(x), ctx.stages,
    ["sensitive to first points — visually verify"]);
}

// ---------- LTP (two lactate turning points) ----------

export function ltp(ctx: Ctx): Result[] {
  const { inclXs, polyIncl, stages, fitting } = ctx;
  if (inclXs.length < 5) return [];
  const lo = inclXs[0];
  const hi = inclXs[inclXs.length - 1];
  const dense = interpolateCurve(polyIncl, lo, hi, (hi - lo) / 1900);
  const n = dense.xs.length;
  const [p1, p2] = segmented2(
    dense.xs, dense.ys,
    dense.xs[Math.floor(n / 3)],
    dense.xs[Math.floor((2 * n) / 3)],
  );
  const out: Result[] = [];
  if (Number.isFinite(p1))
    out.push(mk("LTP", "LTP1", fitting, "LT1", p1, polyIncl.eval(p1), stages,
      ["breakpoint detection — visually verify"]));
  if (Number.isFinite(p2))
    out.push(mk("LTP", "LTP2", fitting, "LT2", p2, polyIncl.eval(p2), stages,
      ["breakpoint detection — visually verify"]));
  return out;
}

// ---------- Dmax family ----------

/** First stage index whose *next* stage rises >= 0.4 mmol/L (point before jump). */
function moddmaxStartIdx(ys: number[]): number {
  for (let i = 0; i < ys.length - 1; i++) if (ys[i + 1] - ys[i] >= 0.4) return i;
  return 0;
}

function dmaxResult(
  ctx: Ctx,
  method: string,
  fitting: Fitting,
  curve: Curve,
  startX: number,
  startY: number,
): Result {
  const endX = ctx.xs[ctx.xs.length - 1];
  const endY = ctx.ys[ctx.ys.length - 1];
  const at = argmax(
    (x) => perpDistance(x, curve.eval(x), startX, startY, endX, endY),
    startX,
    endX,
  );
  return mk("Dmax", method, fitting, "LT2", at, curve.eval(at), ctx.stages);
}

export function dmaxFamily(ctx: Ctx, loglogIntensity: number | null): Result[] {
  const { xs, ys, polyExcl, expExcl, fitting } = ctx;
  const out: Result[] = [
    dmaxResult(ctx, "Dmax", fitting, polyExcl, xs[0], ys[0]),
  ];
  const rise = moddmaxStartIdx(ys);
  out.push(dmaxResult(ctx, "ModDmax", fitting, polyExcl, xs[rise], ys[rise]));
  out.push(dmaxResult(ctx, "Exp-Dmax", "exponential", expExcl, xs[0], ys[0]));

  // Log-variants: chord starts at the Log-log threshold.
  if (loglogIntensity != null && loglogIntensity > xs[0] &&
    loglogIntensity < xs[xs.length - 1]) {
    out.push(dmaxResult(ctx, "Log-Poly-ModDmax", fitting, polyExcl,
      loglogIntensity, polyExcl.eval(loglogIntensity)));
    out.push(dmaxResult(ctx, "Log-Exp-ModDmax", "exponential", expExcl,
      loglogIntensity, expExcl.eval(loglogIntensity)));
  }
  return out;
}

// ---------- LTratio (minimum lactate/intensity ratio) ----------

export function ltRatio(ctx: Ctx, curve: Curve): Result {
  const { inclXs, stages } = ctx;
  const lo = Math.max(inclXs.find((x) => x > 0) ?? inclXs[0], 1e-6);
  const hi = inclXs[inclXs.length - 1];
  const at = argmin((x) => curve.eval(x) / x, lo, hi);
  return mk("LTratio", "LTratio", "B-spline", "LT1", at, curve.eval(at), stages);
}
