/**
 * Deterministic training-plan generator (P8) — pure, no db, testable.
 *
 * Lays periodization phases backward from race day: race week ← taper (length
 * by race type) ← peak ← build ← base, with recovery weeks inside base/build
 * per the chosen pattern. Volume ramps by rampPct per progressive week and is
 * capped at a race-type multiple of the starting hours. The horizon is simply
 * startDate → raceDate, so quarter (~13 wk), half-year (~26 wk) and full-year
 * (~52 wk) plans all work; 8–60 weeks accepted.
 *
 * Output maps 1:1 onto plan_weeks (phase) + planned_sessions (structure), so
 * the coach edits the result in the existing plan builder.
 */

import type { StructureStep, WorkoutStructure } from "@/lib/structure";

export type RaceType = "sprint" | "olympic" | "half_ironman" | "ironman";

type GenSport = "swim" | "bike" | "run" | "strength";

export type GeneratorParams = {
  raceType: RaceType;
  raceDate: string; // ISO yyyy-mm-dd
  startDate: string; // ISO yyyy-mm-dd
  startWeeklyHours: number;
  /** % volume increase per progressive week (default 8). */
  rampPct: number;
  /** Progressive weeks per recovery week. */
  buildRecoveryPattern: "3:1" | "2:1";
  sessionsPerWeek: Record<GenSport, number>;
  /** 0 = Monday … 6 = Sunday; the long ride lands here, long run next day. */
  longSessionDay: number;
};

export type GeneratedSession = {
  dayOfWeek: number;
  sport: GenSport;
  title: string;
  description: string;
  plannedDurationSec: number;
  structure: WorkoutStructure | null;
};

export type GeneratedWeek = {
  weekNumber: number;
  phase: "base" | "build" | "peak" | "taper" | "recovery" | "race";
  notes: string | null;
  targetHours: number;
  sessions: GeneratedSession[];
};

export const RACE_TYPES: Record<
  RaceType,
  { label: string; taperWeeks: number; volumeCap: number; raceHours: number }
> = {
  sprint: { label: "Sprint triathlon", taperWeeks: 1, volumeCap: 1.3, raceHours: 1.5 },
  olympic: { label: "Olympic triathlon", taperWeeks: 2, volumeCap: 1.4, raceHours: 3 },
  half_ironman: { label: "Half Ironman 70.3", taperWeeks: 2, volumeCap: 1.5, raceHours: 6 },
  ironman: { label: "Ironman", taperWeeks: 3, volumeCap: 1.6, raceHours: 12 },
};

export const DEFAULT_PARAMS = {
  startWeeklyHours: 8,
  rampPct: 8,
  buildRecoveryPattern: "3:1" as const,
  sessionsPerWeek: { swim: 2, bike: 3, run: 3, strength: 1 },
  longSessionDay: 5,
};

// ---------------------------------------------------------------------------
// Date helpers (UTC, ISO strings)
// ---------------------------------------------------------------------------

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** 0 = Monday … 6 = Sunday. */
export function isoWeekday(iso: string): number {
  return (utc(iso).getUTCDay() + 6) % 7;
}

function mondayOf(iso: string): number {
  const d = utc(iso);
  return d.getTime() - isoWeekday(iso) * 86400_000;
}

/** Monday of the plan's first week, i.e. the assignment start date that makes
 * the final week contain the race. */
export function planStartMonday(params: GeneratorParams): string {
  return new Date(mondayOf(params.startDate)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Session structure archetypes
// ---------------------------------------------------------------------------

type Target = { metric: "%ftp" | "%lthr" | "%pace" | "rpe"; min: number; max: number };

// Intensity bands per sport, aligned with the zone cut fractions in
// src/lib/zones.ts so projected zones land where the name says.
const BANDS: Record<
  "easy" | "endurance" | "tempo" | "vo2" | "openers",
  Record<"bike" | "run" | "swim", [number, number]>
> = {
  easy: { bike: [45, 60], run: [60, 72], swim: [65, 75] },
  endurance: { bike: [60, 75], run: [72, 82], swim: [72, 82] },
  tempo: { bike: [84, 94], run: [87, 95], swim: [85, 95] },
  vo2: { bike: [105, 120], run: [100, 108], swim: [100, 106] },
  openers: { bike: [100, 110], run: [98, 106], swim: [95, 103] },
};

// Race-pace band by race type (shorter race = hotter pace).
const RACE_PACE: Record<RaceType, Record<"bike" | "run" | "swim", [number, number]>> = {
  sprint: { bike: [95, 105], run: [95, 103], swim: [92, 100] },
  olympic: { bike: [90, 100], run: [92, 100], swim: [88, 96] },
  half_ironman: { bike: [80, 88], run: [85, 92], swim: [82, 90] },
  ironman: { bike: [68, 76], run: [76, 84], swim: [75, 85] },
};

function band(sport: GenSport, [min, max]: [number, number]): Target {
  return { metric: sport === "bike" ? "%ftp" : "%pace", min, max };
}

function step(
  kind: StructureStep["kind"],
  seconds: number,
  target?: Target,
): StructureStep {
  return {
    type: "step",
    kind,
    duration: { unit: "sec", value: Math.max(60, Math.round(seconds / 60) * 60) },
    ...(target ? { target } : {}),
  };
}

/** warmup + one steady block + cooldown, totalling ~sec. */
function steadyStructure(
  sport: GenSport,
  sec: number,
  intensity: [number, number],
): WorkoutStructure {
  const warmup = Math.min(15 * 60, sec * 0.15);
  const cooldown = Math.min(10 * 60, sec * 0.1);
  return {
    blocks: [
      step("warmup", warmup, band(sport, BANDS.easy[sport as "bike"] ?? BANDS.easy.run)),
      step("active", sec - warmup - cooldown, band(sport, intensity)),
      step("cooldown", cooldown, band(sport, BANDS.easy[sport as "bike"] ?? BANDS.easy.run)),
    ],
  };
}

/** warmup + N×(work @ intensity / easy recover) + cooldown, fitted into sec. */
function intervalStructure(
  sport: GenSport,
  sec: number,
  workSec: number,
  recoverSec: number,
  intensity: [number, number],
  maxReps = 8,
): WorkoutStructure {
  const warmup = Math.min(15 * 60, sec * 0.2);
  const cooldown = Math.min(10 * 60, sec * 0.12);
  const reps = Math.min(
    maxReps,
    Math.max(2, Math.floor((sec - warmup - cooldown) / (workSec + recoverSec))),
  );
  const easy = BANDS.easy[sport as "bike"] ?? BANDS.easy.run;
  return {
    blocks: [
      step("warmup", warmup, band(sport, easy)),
      {
        type: "repeat",
        count: reps,
        steps: [
          step("active", workSec, band(sport, intensity)),
          step("recovery", recoverSec, band(sport, easy)),
        ],
      },
      step("cooldown", cooldown, band(sport, easy)),
    ],
  };
}

function strengthStructure(sec: number): WorkoutStructure {
  return {
    blocks: [
      step("warmup", 10 * 60, { metric: "rpe", min: 3, max: 4 }),
      step("active", sec - 15 * 60, { metric: "rpe", min: 6, max: 8 }),
      step("cooldown", 5 * 60, { metric: "rpe", min: 2, max: 3 }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Week assembly
// ---------------------------------------------------------------------------

type Phase = GeneratedWeek["phase"];

// Preferred training days per sport; the long ride sits on longSessionDay and
// the long run the day after.
function sportDays(sport: GenSport, longDay: number): number[] {
  switch (sport) {
    case "swim":
      return [0, 3, 4, 2];
    case "bike":
      return [longDay, 2, 4, 1];
    case "run":
      return [(longDay + 1) % 7, 1, 4, 3];
    case "strength":
      return [0, 3];
  }
}

function session(
  sport: GenSport,
  dayOfWeek: number,
  title: string,
  description: string,
  structure: WorkoutStructure,
): GeneratedSession {
  const total = structure.blocks.reduce((sum, b) => {
    if (b.type === "step") return sum + b.duration.value;
    return sum + b.count * b.steps.reduce((s, x) => s + x.duration.value, 0);
  }, 0);
  return {
    dayOfWeek,
    sport,
    title,
    description,
    plannedDurationSec: Math.round(total),
    structure,
  };
}

function minutes(sec: number): number {
  return Math.round(sec / 60);
}

function buildWeekSessions(
  phase: Phase,
  params: GeneratorParams,
  hours: number,
): GeneratedSession[] {
  const { raceType, longSessionDay: longDay } = params;
  const counts = { ...params.sessionsPerWeek };
  if (phase === "recovery" || phase === "taper") counts.strength = 0;

  const strengthSec = counts.strength > 0 ? 45 * 60 * counts.strength : 0;
  const endurance = counts.swim + counts.bike + counts.run;
  if (endurance === 0) return [];
  const budget = hours * 3600 - strengthSec;

  // Long ride ~30 % and long run ~22 % of the endurance budget (taper and
  // recovery weeks have no true long sessions — everything is short).
  const hasLongs = phase === "base" || phase === "build" || phase === "peak";
  const longBike = hasLongs && counts.bike > 0 ? budget * 0.3 : 0;
  const longRun = hasLongs && counts.run > 0 ? budget * 0.22 : 0;
  const shortCount = endurance - (longBike ? 1 : 0) - (longRun ? 1 : 0);
  const shortSec = Math.max(
    30 * 60,
    (budget - longBike - longRun) / Math.max(1, shortCount),
  );

  const quality = phase === "build" || phase === "peak";
  const sharp = raceType === "sprint" || raceType === "olympic";
  const out: GeneratedSession[] = [];

  const push = (
    sport: GenSport,
    slot: number,
    title: string,
    description: string,
    structure: WorkoutStructure,
  ) => out.push(session(sport, sportDays(sport, longDay)[slot % 4], title, description, structure));

  // --- bike ---
  for (let i = 0; i < counts.bike; i++) {
    if (i === 0 && longBike) {
      push("bike", 0, "Long ride", "Aerobic base in Z2 — steady, fueled, low stress.", steadyStructure("bike", longBike, BANDS.endurance.bike));
    } else if (i === 1 && quality) {
      if (phase === "peak") {
        push("bike", 1, "Race-pace intervals", `3×12min at ${RACE_TYPES[raceType].label} effort.`, intervalStructure("bike", shortSec, 12 * 60, 5 * 60, RACE_PACE[raceType].bike, 3));
      } else if (sharp) {
        push("bike", 1, "VO2 intervals", "Short hard repeats — top-end for the short course.", intervalStructure("bike", shortSec, 3 * 60, 3 * 60, BANDS.vo2.bike, 6));
      } else {
        push("bike", 1, "Tempo 2×15min", "Sweet-spot tempo — race-economy work.", intervalStructure("bike", shortSec, 15 * 60, 5 * 60, BANDS.tempo.bike, 3));
      }
    } else if (phase === "taper") {
      push("bike", i, "Openers", "Short spin with a few race-pace pickups.", intervalStructure("bike", Math.min(shortSec, 45 * 60), 60, 2 * 60, BANDS.openers.bike, 4));
    } else if (phase === "recovery") {
      push("bike", i, "Recovery spin", "Truly easy — legs loose, heart rate low.", steadyStructure("bike", Math.min(shortSec, 60 * 60), BANDS.easy.bike));
    } else {
      push("bike", i, "Z2 endurance ride", "Steady aerobic riding.", steadyStructure("bike", shortSec, BANDS.endurance.bike));
    }
  }

  // --- run ---
  for (let i = 0; i < counts.run; i++) {
    if (i === 0 && longRun) {
      push("run", 0, "Long run", "Aerobic long run in Z2 — conversational pace.", steadyStructure("run", longRun, BANDS.endurance.run));
    } else if (i === 1 && quality) {
      if (phase === "peak") {
        push("run", 1, "Race-pace repeats", `3×8min at ${RACE_TYPES[raceType].label} effort.`, intervalStructure("run", shortSec, 8 * 60, 3 * 60, RACE_PACE[raceType].run, 3));
      } else if (sharp) {
        push("run", 1, "VO2 intervals", "Hard 3-minute repeats with equal jog recovery.", intervalStructure("run", shortSec, 3 * 60, 3 * 60, BANDS.vo2.run, 6));
      } else {
        push("run", 1, "Tempo run", "Comfortably-hard continuous tempo blocks.", intervalStructure("run", shortSec, 12 * 60, 4 * 60, BANDS.tempo.run, 3));
      }
    } else if (phase === "taper") {
      push("run", i, "Strides + easy run", "Easy running with short race-pace strides.", intervalStructure("run", Math.min(shortSec, 40 * 60), 60, 2 * 60, BANDS.openers.run, 4));
    } else if (phase === "recovery") {
      push("run", i, "Recovery jog", "Very easy, short. Walk breaks are fine.", steadyStructure("run", Math.min(shortSec, 45 * 60), BANDS.easy.run));
    } else {
      push("run", i, "Z2 endurance run", "Steady aerobic running.", steadyStructure("run", shortSec, BANDS.endurance.run));
    }
  }

  // --- swim ---
  for (let i = 0; i < counts.swim; i++) {
    if (i === 0 && quality) {
      push("swim", 0, "Threshold intervals", "Repeats at threshold pace, short rest.", intervalStructure("swim", shortSec, 4 * 60, 60, phase === "peak" ? RACE_PACE[raceType].swim : BANDS.tempo.swim, 8));
    } else if (phase === "recovery" || phase === "taper") {
      push("swim", i, "Easy swim + drills", "Technique focus, no clock-watching.", steadyStructure("swim", Math.min(shortSec, 45 * 60), BANDS.easy.swim));
    } else {
      push("swim", i, i === 0 ? "Technique + endurance" : "Endurance swim", "Drills up front, then steady aerobic swimming.", steadyStructure("swim", shortSec, BANDS.endurance.swim));
    }
  }

  // --- strength ---
  for (let i = 0; i < counts.strength; i++) {
    push("strength", i, "Strength: full body", "Compound lifts, controlled tempo.", strengthStructure(45 * 60));
  }

  return out;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generatePlan(params: GeneratorParams): {
  weeks: GeneratedWeek[];
  totalWeeks: number;
} {
  const cfg = RACE_TYPES[params.raceType];
  const totalWeeks =
    Math.round((mondayOf(params.raceDate) - mondayOf(params.startDate)) / (7 * 86400_000)) + 1;
  if (totalWeeks < 8 || totalWeeks > 60) {
    throw new Error(
      `Plan must span 8–60 weeks (got ${totalWeeks}). Pick a race date further out or closer in.`,
    );
  }
  if (params.startWeeklyHours < 2 || params.startWeeklyHours > 30) {
    throw new Error("Starting weekly hours must be between 2 and 30.");
  }

  // Phase layout, back to front. Short horizons shrink taper/peak first.
  const taper = Math.min(cfg.taperWeeks, Math.max(1, Math.floor((totalWeeks - 6) / 6)));
  const peak = totalWeeks >= 14 ? 2 : 1;
  const progressive = totalWeeks - 1 - taper - peak; // base + build span
  const build = Math.floor(progressive / 2);
  const base = progressive - build;

  const phases: Phase[] = [];
  const cycle = params.buildRecoveryPattern === "2:1" ? 3 : 4;
  for (let i = 0; i < progressive; i++) {
    // Recovery closes each mesocycle (never the very first week).
    const recovery = i % cycle === cycle - 1;
    phases.push(recovery ? "recovery" : i < base ? "base" : "build");
  }
  for (let i = 0; i < peak; i++) phases.push("peak");
  for (let i = 0; i < taper; i++) phases.push("taper");
  phases.push("race");

  // Volume per week.
  const cap = params.startWeeklyHours * cfg.volumeCap;
  const taperFractions = [0.7, 0.55, 0.4].slice(3 - taper);
  let progressiveHours = params.startWeeklyHours;
  let lastProgressive = progressiveHours;
  let taperIndex = 0;

  const weeks: GeneratedWeek[] = phases.map((phase, i) => {
    let hours: number;
    switch (phase) {
      case "base":
      case "build":
        hours = progressiveHours;
        lastProgressive = progressiveHours;
        progressiveHours = Math.min(progressiveHours * (1 + params.rampPct / 100), cap);
        break;
      case "recovery":
        hours = lastProgressive * 0.65;
        break;
      case "peak":
        hours = Math.min(lastProgressive, cap);
        break;
      case "taper":
        // Off the starting volume, not the peak — taper sessions are short
        // and few by design.
        hours = params.startWeeklyHours * taperFractions[taperIndex++];
        break;
      case "race":
        hours = params.startWeeklyHours * 0.35;
        break;
    }
    hours = Math.round(hours * 2) / 2;

    const sessions = buildWeekSessions(phase, params, hours);
    // Taper sessions are short by design (openers, strides); report the real
    // volume instead of the pre-cap fraction.
    if (phase === "taper") {
      hours =
        Math.round(
          (sessions.reduce((sum, s) => sum + s.plannedDurationSec, 0) / 3600) * 2,
        ) / 2;
    }

    const week: GeneratedWeek = {
      weekNumber: i + 1,
      phase,
      targetHours: hours,
      notes:
        phase === "recovery"
          ? "Recovery week — absorb the training, keep everything easy."
          : phase === "race"
            ? `Race week — ${cfg.label}.`
            : null,
      sessions,
    };
    return week;
  });

  // Race week: strip to short openers + the race itself on the race weekday.
  const raceWeek = weeks[weeks.length - 1];
  const raceDow = isoWeekday(params.raceDate);
  raceWeek.sessions = [
    session("swim", Math.max(0, raceDow - 4), "Easy swim + loosen up", "Short and smooth, feel the water.", steadyStructure("swim", 20 * 60, BANDS.easy.swim)),
    session("run", Math.max(0, raceDow - 2), "Pre-race strides", "10–15min jog with 4 short strides.", intervalStructure("run", 20 * 60, 45, 90, BANDS.openers.run, 4)),
    session("bike", Math.max(0, raceDow - 1), "Bike check + openers", "Gear check; a few short pickups.", intervalStructure("bike", 25 * 60, 60, 2 * 60, BANDS.openers.bike, 3)),
    {
      dayOfWeek: raceDow,
      sport: "bike" as const,
      title: `RACE DAY — ${cfg.label}`,
      description: "Swim, bike, run. Execute the plan, enjoy it.",
      plannedDurationSec: Math.round(cfg.raceHours * 3600),
      structure: null,
    },
  ].filter((s, idx, arr) => arr.findIndex((x) => x.dayOfWeek === s.dayOfWeek) === idx || s.title.startsWith("RACE"));

  return { weeks, totalWeeks };
}

export function describeWeekMinutes(week: GeneratedWeek): number {
  return minutes(week.sessions.reduce((sum, s) => sum + s.plannedDurationSec, 0));
}
