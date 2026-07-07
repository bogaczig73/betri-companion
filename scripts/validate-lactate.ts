/**
 * Lactate engine regression check — run with:
 *   npx tsx scripts/validate-lactate.ts
 *
 * Asserts the ported engine reproduces the `lactater` package's documented demo
 * outputs (cycling, ascending power). Doc numbers are rounded, so a tolerance is
 * allowed. This is the primary scientific-validity fixture for the module.
 */

import { analyze } from "../src/lib/lactate/analyze";
import type { Stage } from "../src/lib/lactate/types";

const baseline = { intensity: 0, lactate: 0.93, heartRate: 96 };
const demo: Stage[] = [
  { intensity: 50, lactate: 0.98, heartRate: 114 },
  { intensity: 75, lactate: 1.23, heartRate: 134 },
  { intensity: 100, lactate: 1.88, heartRate: 154 },
  { intensity: 125, lactate: 2.8, heartRate: 170 },
  { intensity: 150, lactate: 4.21, heartRate: 182 },
  { intensity: 175, lactate: 6.66, heartRate: 193 },
  { intensity: 191, lactate: 8.64, heartRate: 198 },
];

// method -> [expected intensity (W), expected lactate, expected HR]
const expected: Record<string, [number, number, number]> = {
  "Log-log": [83.4, 1.4, 140],
  "OBLA 2.0": [105, 2, 153],
  "OBLA 2.5": [118, 2.5, 160],
  "OBLA 3.0": [129, 3, 167],
  "OBLA 3.5": [137, 3.5, 171],
  "OBLA 4.0": [145, 4, 176],
  "Bsln + 0.5": [82.5, 1.43, 139],
  "Bsln + 1.0": [104, 1.93, 152],
  "Bsln + 1.5": [117, 2.43, 159],
  Dmax: [132, 3.1, 168],
  ModDmax: [140, 3.6, 173],
  "Exp-Dmax": [135, 3.3, 170],
  "Log-Poly-ModDmax": [143, 3.8, 175],
  "Log-Exp-ModDmax": [146, 4, 177],
  LTP1: [88.8, 1.5, 143],
  LTP2: [148, 4.1, 178],
  LTratio: [71.2, 1.2, 132],
};

const ITOL = 4; // watts

const { results, warnings } = analyze(demo, {
  fit: "3rd degree polynomial",
  baselineLactate: baseline.lactate,
  baselineIntensity: baseline.intensity,
  includeBaseline: true,
});

const got = new Map(results.map((r) => [r.method, r]));
let pass = 0;
let fail = 0;
const pad = (s: string, n: number) => s.padEnd(n);

console.log(pad("method", 20), pad("got I", 9), pad("exp I", 9), "Δ", "  status");
console.log("-".repeat(60));
for (const [method, [ei, el, ehr]] of Object.entries(expected)) {
  const r = got.get(method);
  if (!r || Number.isNaN(r.intensity)) {
    console.log(pad(method, 20), pad("—", 9), pad(String(ei), 9), "", "  MISSING");
    fail++;
    continue;
  }
  const di = Math.abs(r.intensity - ei);
  const ok = di <= ITOL;
  console.log(
    pad(method, 20),
    pad(r.intensity.toFixed(1), 9),
    pad(String(ei), 9),
    di.toFixed(1).padStart(5),
    ok ? "  ok" : "  FAIL",
    `  (lac ${r.lactate.toFixed(2)} vs ${el}, hr ${r.heartRate?.toFixed(0) ?? "—"} vs ${ehr})`,
  );
  if (ok) pass++;
  else fail++;
}
console.log("-".repeat(60));
console.log(`pass ${pass}  fail ${fail}  (tolerance ±${ITOL} W)`);
if (warnings.length) console.log("warnings:", warnings);
if (fail > 0) process.exit(1);
