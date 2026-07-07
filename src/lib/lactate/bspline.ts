/**
 * Cubic B-spline regression fit, used as the default curve for LTratio (per the
 * `lactater` reference). A clamped cubic basis with a small number of interior
 * knots, fitted by least squares — smooth enough to suppress noise without the
 * wiggles that would create spurious threshold points.
 */

import { type Curve, solveLinear } from "./fit";

const DEGREE = 3;

/** Cox-de Boor: basis-function values N_{i,DEGREE}(x) for every control point. */
function basis(x: number, knots: number[]): number[] {
  const p = DEGREE;
  const m = knots.length - p - 1; // number of control points
  // Degree-0 basis.
  const N: number[] = new Array(knots.length - 1).fill(0);
  for (let i = 0; i < knots.length - 1; i++) {
    N[i] = x >= knots[i] && x < knots[i + 1] ? 1 : 0;
  }
  // Right boundary: include the final span so x === xmax is supported.
  if (x >= knots[knots.length - 1 - p]) {
    N[knots.length - 2 - p] = 1;
  }
  for (let d = 1; d <= p; d++) {
    for (let i = 0; i < knots.length - 1 - d; i++) {
      const denom1 = knots[i + d] - knots[i];
      const denom2 = knots[i + d + 1] - knots[i + 1];
      const term1 = denom1 > 0 ? ((x - knots[i]) / denom1) * N[i] : 0;
      const term2 =
        denom2 > 0 ? ((knots[i + d + 1] - x) / denom2) * N[i + 1] : 0;
      N[i] = term1 + term2;
    }
  }
  return N.slice(0, m);
}

/**
 * Fit a clamped cubic B-spline to (xs, ys) by least squares. `interior` is the
 * number of interior knots placed at data quantiles (default 1 → 5 control
 * points, a gentle smooth that matches the reference well for ~6-9 stages).
 */
export function bsplineCurve(
  xs: number[],
  ys: number[],
  interior = 1,
): Curve {
  const p = DEGREE;
  const xmin = xs[0];
  const xmax = xs[xs.length - 1];

  // Clamped knot vector: p+1 copies of each end, interior knots at quantiles.
  const knots: number[] = [];
  for (let i = 0; i <= p; i++) knots.push(xmin);
  for (let k = 1; k <= interior; k++) {
    const q = k / (interior + 1);
    const idx = q * (xs.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, xs.length - 1);
    knots.push(xs[lo] + (idx - lo) * (xs[hi] - xs[lo]));
  }
  for (let i = 0; i <= p; i++) knots.push(xmax);

  const m = knots.length - p - 1; // control points
  // Design matrix B (n x m); solve normal equations BᵀB c = Bᵀy.
  const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const b: number[] = Array(m).fill(0);
  for (let r = 0; r < xs.length; r++) {
    const N = basis(Math.min(xs[r], xmax), knots);
    for (let i = 0; i < m; i++) {
      b[i] += N[i] * ys[r];
      for (let j = 0; j < m; j++) A[i][j] += N[i] * N[j];
    }
  }
  // Tiny ridge term keeps the system solvable when control points are sparse.
  for (let i = 0; i < m; i++) A[i][i] += 1e-9;
  const c = solveLinear(A, b);

  return {
    eval: (x: number) => {
      const N = basis(Math.min(Math.max(x, xmin), xmax), knots);
      let acc = 0;
      for (let i = 0; i < m; i++) acc += c[i] * N[i];
      return acc;
    },
  };
}
