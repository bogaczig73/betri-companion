/**
 * Curve fitting and numerics for the lactate engine.
 *
 * Everything a method needs reduces to evaluating a fitted curve `L = f(I)` and
 * root-finding on it, so a fit is just a `Curve` (an `eval`). Root-finding and
 * derivatives are done numerically and uniformly, so polynomial / exponential /
 * spline fits are interchangeable to the methods that consume them.
 */

import type { PolyDegree } from "./types";

/** A fitted lactate curve. */
export interface Curve {
  eval: (intensity: number) => number;
}

// ---------- linear algebra ----------

/** Solve A·x = b by Gaussian elimination with partial pivoting. */
export function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // Augmented matrix (copy so we don't mutate inputs).
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const diag = M[col][col];
    if (Math.abs(diag) < 1e-12) continue; // singular-ish; leave as-is
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / diag;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(M[i][i]) < 1e-12 ? 0 : row[n] / M[i][i]));
}

// ---------- polynomial fit ----------

function polyval(coefs: number[], x: number): number {
  // Horner's method. coefs[0] + coefs[1]·x + …
  let acc = 0;
  for (let i = coefs.length - 1; i >= 0; i--) acc = acc * x + coefs[i];
  return acc;
}

/**
 * Ordinary least-squares polynomial fit via the normal equations.
 * x is internally normalised to ~[-1, 1] so the normal matrix stays well
 * conditioned even at degree 4; the normalisation is hidden behind `eval`.
 */
export function polyCurve(
  xs: number[],
  ys: number[],
  degree: number,
): Curve & { coefs: number[]; degree: number } {
  const n = xs.length;
  const deg = Math.min(degree, n - 1); // can't over-fit beyond n-1
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const span = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
  const xn = xs.map((x) => (x - mean) / span);

  // Normal equations: (VᵀV) c = Vᵀy, V = Vandermonde of xn.
  const m = deg + 1;
  const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const b: number[] = Array(m).fill(0);
  for (let i = 0; i < n; i++) {
    const powers: number[] = [1];
    for (let p = 1; p < 2 * m; p++) powers.push(powers[p - 1] * xn[i]);
    for (let r = 0; r < m; r++) {
      b[r] += powers[r] * ys[i];
      for (let c = 0; c < m; c++) A[r][c] += powers[r + c];
    }
  }
  const coefs = solveLinear(A, b);
  return {
    coefs,
    degree: deg,
    eval: (x: number) => polyval(coefs, (x - mean) / span),
  };
}

export function degreeOf(fit: PolyDegree): number {
  return fit === "4th degree polynomial" ? 4 : 3;
}

// ---------- exponential fit ----------

/**
 * Fit `L = a + b·e^(c·x)` by separable least squares: `c` is the only nonlinear
 * parameter, so we scan candidate `c`, solve `a, b` linearly for each, and keep
 * the lowest residual sum of squares. Robust, no iterative optimiser needed.
 */
export function expCurve(xs: number[], ys: number[]): Curve {
  const n = xs.length;
  const range = Math.max(...xs) - Math.min(...xs) || 1;

  let best = { a: ys[0], b: 0, c: 1 / range, rss: Infinity };
  // c scales inversely with the x-range; scan a broad geometric grid.
  const scan = (lo: number, hi: number, steps: number) => {
    for (let s = 0; s <= steps; s++) {
      const c = lo * Math.pow(hi / lo, s / steps);
      // Linear fit y = a + b·u, u = e^(c·x).
      let su = 0,
        suu = 0,
        sy = 0,
        suy = 0;
      for (let i = 0; i < n; i++) {
        const u = Math.exp(c * (xs[i] - xs[0]));
        su += u;
        suu += u * u;
        sy += ys[i];
        suy += u * ys[i];
      }
      const det = n * suu - su * su;
      if (Math.abs(det) < 1e-12) continue;
      const a = (sy * suu - su * suy) / det;
      const b = (n * suy - su * sy) / det;
      let rss = 0;
      for (let i = 0; i < n; i++) {
        const pred = a + b * Math.exp(c * (xs[i] - xs[0]));
        rss += (pred - ys[i]) ** 2;
      }
      if (rss < best.rss) best = { a, b, c, rss };
    }
  };
  scan(0.02 / range, 50 / range, 400);
  // Refine around the winner.
  scan(best.c * 0.5, best.c * 2, 200);

  const { a, b, c } = best;
  const x0 = xs[0];
  return { eval: (x: number) => a + b * Math.exp(c * (x - x0)) };
}

// ---------- operations on a fitted curve ----------

/**
 * Find the intensity where `curve(I) = target` within `[lo, hi]`.
 * On a rising lactate curve the relevant crossing is the highest-intensity one,
 * so we scan left→right and keep the last sign change, then bisect. Returns
 * null when the target is never reached in range (no extrapolation).
 */
export function solveRising(
  curve: Curve,
  target: number,
  lo: number,
  hi: number,
  steps = 1000,
): number | null {
  const f = (x: number) => curve.eval(x) - target;
  let root: number | null = null;
  let prevX = lo;
  let prevF = f(lo);
  if (prevF === 0) root = lo;
  for (let i = 1; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const fx = f(x);
    if (prevF === 0 || fx === 0 || prevF * fx < 0) {
      // Bisect within [prevX, x].
      let a = prevX,
        b = x,
        fa = prevF;
      for (let k = 0; k < 60; k++) {
        const mid = (a + b) / 2;
        const fm = f(mid);
        if (fa * fm <= 0) b = mid;
        else {
          a = mid;
          fa = fm;
        }
      }
      root = (a + b) / 2; // keep last (highest-intensity) crossing
    }
    prevX = x;
    prevF = fx;
  }
  return root;
}

/** argmax of `score` over a fine grid of `[lo, hi]`. */
export function argmax(
  score: (x: number) => number,
  lo: number,
  hi: number,
  steps = 1000,
): number {
  let bestX = lo;
  let bestV = -Infinity;
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps;
    const v = score(x);
    if (v > bestV) {
      bestV = v;
      bestX = x;
    }
  }
  return bestX;
}

/** argmin of `score` over a fine grid of `[lo, hi]`. */
export function argmin(
  score: (x: number) => number,
  lo: number,
  hi: number,
  steps = 1000,
): number {
  return argmax((x) => -score(x), lo, hi, steps);
}

/** Perpendicular distance from (x0,y0) to the line through (x1,y1)-(x2,y2). */
export function perpDistance(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const num = Math.abs((y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1);
  const den = Math.hypot(y2 - y1, x2 - x1) || 1;
  return num / den;
}

// ---------- segmented (broken-line) regression ----------

/** OLS for an explicit design matrix; returns coefficients. */
function olsDesign(design: number[][], y: number[]): number[] {
  const m = design[0].length;
  const A: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const b: number[] = Array(m).fill(0);
  for (let i = 0; i < design.length; i++) {
    for (let r = 0; r < m; r++) {
      b[r] += design[i][r] * y[i];
      for (let c = 0; c < m; c++) A[r][c] += design[i][r] * design[i][c];
    }
  }
  return solveLinear(A, b);
}

/**
 * Muggeo's iterative estimator for a single breakpoint (mirrors R's `segmented`,
 * npsi=1). Model: y = β0 + β1·x + β2·(x-ψ)+ ; ψ is updated by γ/β where γ is the
 * coefficient of the indicator term. Converges to the local optimum near `init`.
 */
export function segmented1(xs: number[], ys: number[], init: number): number {
  const loB = xs[1] ?? xs[0];
  const hiB = xs[xs.length - 2] ?? xs[xs.length - 1];
  let psi = init;
  for (let it = 0; it < 300; it++) {
    const design = xs.map((x) => [1, x, Math.max(0, x - psi), x > psi ? -1 : 0]);
    const co = olsDesign(design, ys);
    const beta = co[2];
    const gamma = co[3];
    if (Math.abs(beta) < 1e-12) break;
    const next = psi + gamma / beta;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - psi) < 1e-7) {
      psi = next;
      break;
    }
    psi = Math.min(Math.max(next, loB), hiB);
  }
  return psi;
}

/** Muggeo's estimator for two breakpoints (R's `segmented`, npsi=2). */
export function segmented2(
  xs: number[],
  ys: number[],
  init1: number,
  init2: number,
): [number, number] {
  const loB = xs[1] ?? xs[0];
  const hiB = xs[xs.length - 2] ?? xs[xs.length - 1];
  let p1 = init1;
  let p2 = init2;
  for (let it = 0; it < 400; it++) {
    const design = xs.map((x) => [
      1, x,
      Math.max(0, x - p1), x > p1 ? -1 : 0,
      Math.max(0, x - p2), x > p2 ? -1 : 0,
    ]);
    const co = olsDesign(design, ys);
    const [b1, g1, b2, g2] = [co[2], co[3], co[4], co[5]];
    let n1 = Math.abs(b1) < 1e-12 ? p1 : p1 + g1 / b1;
    let n2 = Math.abs(b2) < 1e-12 ? p2 : p2 + g2 / b2;
    n1 = Math.min(Math.max(n1, loB), hiB);
    n2 = Math.min(Math.max(n2, loB), hiB);
    if (Math.abs(n1 - p1) < 1e-6 && Math.abs(n2 - p2) < 1e-6) {
      p1 = n1;
      p2 = n2;
      break;
    }
    p1 = n1;
    p2 = n2;
  }
  return p1 <= p2 ? [p1, p2] : [p2, p1];
}

/** Sample a fitted curve at a fine, uniform step over [lo, hi]. */
export function interpolateCurve(
  curve: Curve,
  lo: number,
  hi: number,
  step = 0.1,
): { xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) {
    xs.push(x);
    ys.push(curve.eval(x));
  }
  return { xs, ys };
}

/** Heart rate at an intensity by linear interpolation of raw stages. */
export function interpHr(
  stages: { intensity: number; heartRate?: number | null }[],
  x: number,
): number | null {
  const pts = stages
    .filter((s) => s.heartRate != null)
    .map((s) => ({ x: s.intensity, hr: s.heartRate as number }))
    .sort((a, b) => a.x - b.x);
  if (pts.length === 0) return null;
  if (x <= pts[0].x) return pts[0].hr;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].hr;
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i].x) {
      const t = (x - pts[i - 1].x) / (pts[i].x - pts[i - 1].x);
      return pts[i - 1].hr + t * (pts[i].hr - pts[i - 1].hr);
    }
  }
  return pts[pts.length - 1].hr;
}
