/**
 * Invariant checks for the plan generator — `npx tsx scripts/check-plan-generator.ts`.
 * Pure, no db. Fails loudly on any broken invariant.
 */
import assert from "node:assert/strict";

import {
  DEFAULT_PARAMS,
  generatePlan,
  isoWeekday,
  RACE_TYPES,
  type GeneratorParams,
  type RaceType,
} from "../src/lib/plan-generator";
import { workoutStructureSchema } from "../src/lib/structure";

function params(
  raceType: RaceType,
  startDate: string,
  raceDate: string,
  extra: Partial<GeneratorParams> = {},
): GeneratorParams {
  return { raceType, startDate, raceDate, ...DEFAULT_PARAMS, ...extra };
}

// Monday + N weeks - offset helpers (2026-07-13 is a Monday).
const START = "2026-07-13";
function raceDateAfterWeeks(weeks: number, dow = 5): string {
  const d = new Date(`${START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (weeks - 1) * 7 + dow);
  return d.toISOString().slice(0, 10);
}

const cases: [string, GeneratorParams, number][] = [
  ["quarter sprint", params("sprint", START, raceDateAfterWeeks(13)), 13],
  ["half-year olympic", params("olympic", START, raceDateAfterWeeks(26)), 26],
  ["half-year 70.3 (2:1)", params("half_ironman", START, raceDateAfterWeeks(24), { buildRecoveryPattern: "2:1" }), 24],
  ["full-year ironman", params("ironman", START, raceDateAfterWeeks(52)), 52],
  ["minimum 8wk sprint", params("sprint", START, raceDateAfterWeeks(8)), 8],
];

for (const [name, p, expectWeeks] of cases) {
  const { weeks, totalWeeks } = generatePlan(p);
  assert.equal(totalWeeks, expectWeeks, `${name}: week count`);
  assert.equal(weeks.length, expectWeeks, `${name}: weeks array`);
  assert.equal(weeks.at(-1)!.phase, "race", `${name}: last week is race week`);

  // Taper length by race type (capped on short horizons).
  const taper = weeks.filter((w) => w.phase === "taper").length;
  const expectedTaper = Math.min(
    RACE_TYPES[p.raceType].taperWeeks,
    Math.max(1, Math.floor((expectWeeks - 6) / 6)),
  );
  assert.equal(taper, expectedTaper, `${name}: taper weeks`);

  // Phase ordering: base/recovery ... build/recovery ... peak ... taper ... race.
  const order = { base: 0, recovery: 1, build: 1, peak: 2, taper: 3, race: 4 };
  let prev = -1;
  const firstBuild = weeks.findIndex((w) => w.phase === "build");
  for (const w of weeks) {
    const rank =
      w.phase === "recovery" ? prev : order[w.phase]; // recovery inherits position
    assert.ok(rank >= prev, `${name}: phase order broke at week ${w.weekNumber} (${w.phase})`);
    prev = rank;
  }
  if (firstBuild >= 0) {
    assert.ok(
      weeks.slice(firstBuild).every((w) => w.phase !== "base"),
      `${name}: no base after build`,
    );
  }

  // Recovery cadence inside the progressive span.
  const cycle = p.buildRecoveryPattern === "2:1" ? 3 : 4;
  const progressive = weeks.filter((w) =>
    ["base", "build", "recovery"].includes(w.phase),
  );
  progressive.forEach((w, i) => {
    assert.equal(
      w.phase === "recovery",
      i % cycle === cycle - 1,
      `${name}: recovery cadence at progressive week ${i + 1}`,
    );
  });

  // Volume: ramp bounded, capped, recovery dips.
  const cap = p.startWeeklyHours * RACE_TYPES[p.raceType].volumeCap;
  let lastProgressiveHours: number | null = null;
  for (const w of weeks) {
    assert.ok(w.targetHours <= cap + 0.26, `${name}: hours over cap in week ${w.weekNumber}`);
    if (w.phase === "base" || w.phase === "build") {
      if (lastProgressiveHours != null) {
        // 0.6h slack: both sides are rounded to the nearest half hour.
        assert.ok(
          w.targetHours <= lastProgressiveHours * (1 + p.rampPct / 100) + 0.6,
          `${name}: ramp exceeded at week ${w.weekNumber}`,
        );
      }
      lastProgressiveHours = w.targetHours;
    }
    if (w.phase === "recovery" && lastProgressiveHours) {
      assert.ok(w.targetHours < lastProgressiveHours, `${name}: recovery week not lighter`);
    }
  }

  // Sessions: valid days, valid structures, durations roughly match hours.
  for (const w of weeks) {
    assert.ok(w.sessions.length > 0, `${name}: empty week ${w.weekNumber}`);
    for (const s of w.sessions) {
      assert.ok(s.dayOfWeek >= 0 && s.dayOfWeek <= 6, `${name}: bad day`);
      assert.ok(s.plannedDurationSec > 0, `${name}: no duration`);
      if (s.structure) workoutStructureSchema.parse(s.structure);
    }
    if (w.phase !== "race") {
      const total = w.sessions.reduce((sum, s) => sum + s.plannedDurationSec, 0) / 3600;
      assert.ok(
        Math.abs(total - w.targetHours) <= Math.max(1.5, w.targetHours * 0.2),
        `${name}: week ${w.weekNumber} (${w.phase}) sessions ${total.toFixed(1)}h vs target ${w.targetHours}h`,
      );
    }
  }

  // Race day lands on the race weekday.
  const raceSession = weeks.at(-1)!.sessions.find((s) => s.title.startsWith("RACE DAY"));
  assert.ok(raceSession, `${name}: race session missing`);
  assert.equal(raceSession!.dayOfWeek, isoWeekday(p.raceDate), `${name}: race day weekday`);

  console.log(
    `ok  ${name.padEnd(22)} ${expectWeeks}wk  phases: ` +
      Object.entries(
        weeks.reduce((acc: Record<string, number>, w) => ((acc[w.phase] = (acc[w.phase] ?? 0) + 1), acc), {}),
      )
        .map(([k, v]) => `${k}×${v}`)
        .join(" "),
  );
}

// Sprint vs ironman must differ in taper and intensity mix.
const sprint = generatePlan(params("sprint", START, raceDateAfterWeeks(20)));
const ironman = generatePlan(params("ironman", START, raceDateAfterWeeks(20)));
const titles = (p: { weeks: { sessions: { title: string }[] }[] }) =>
  p.weeks.flatMap((w) => w.sessions.map((s) => s.title)).join("|");
assert.ok(titles(sprint).includes("VO2"), "sprint plan has VO2 work");
assert.ok(!titles(ironman).includes("VO2"), "ironman plan has no VO2 work");
assert.ok(titles(ironman).includes("Tempo"), "ironman plan has tempo work");

// Horizon guards.
assert.throws(() => generatePlan(params("sprint", START, raceDateAfterWeeks(5))), /8–60/);
assert.throws(() => generatePlan(params("sprint", START, raceDateAfterWeeks(70))), /8–60/);

console.log("\nall plan-generator invariants hold");
