import { z } from "zod";

// TrainingPeaks-style structured workout: an ordered list of blocks, where a
// block is a single step or a repeat group of steps. Stored as JSONB on
// planned_sessions and workouts. Extend by adding step kinds or target
// metrics — consumers must not assume a fixed set.

export const STEP_KINDS = [
  "warmup",
  "active",
  "recovery",
  "cooldown",
  "rest",
] as const;

// Intensity targets are relative to the athlete's thresholds, like
// TrainingPeaks: % of FTP (power), % of LTHR (heart rate), % of threshold
// pace, or absolute RPE.
export const TARGET_METRICS = ["%ftp", "%lthr", "%pace", "rpe"] as const;

export const stepSchema = z.object({
  type: z.literal("step"),
  kind: z.enum(STEP_KINDS),
  name: z.string().trim().max(100).optional(),
  duration: z.object({
    unit: z.enum(["sec", "m"]), // time or distance based
    value: z.number().positive().max(1_000_000),
  }),
  target: z
    .object({
      metric: z.enum(TARGET_METRICS),
      min: z.number().min(0).max(500),
      max: z.number().min(0).max(500),
    })
    .optional(),
});

export const repeatSchema = z.object({
  type: z.literal("repeat"),
  count: z.number().int().min(2).max(100),
  steps: z.array(stepSchema).min(1).max(20),
});

export const workoutStructureSchema = z.object({
  blocks: z
    .array(z.discriminatedUnion("type", [stepSchema, repeatSchema]))
    .min(1)
    .max(50),
});

// The structured-workout editor serializes its blocks into a hidden JSON
// form field; "" means no structure.
export const structureField = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    try {
      return workoutStructureSchema.parse(JSON.parse(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid workout structure" });
      return z.NEVER;
    }
  });

export type StructureStep = z.infer<typeof stepSchema>;
export type StructureRepeat = z.infer<typeof repeatSchema>;
export type StructureBlock = StructureStep | StructureRepeat;
export type WorkoutStructure = z.infer<typeof workoutStructureSchema>;

// Rough pace used only to give distance-based steps a visual width and a
// duration estimate alongside time-based steps (5:00/km ≈ 0.3 s/m).
const APPROX_SEC_PER_METER = 0.3;

export function stepDurationSec(step: StructureStep): number {
  return step.duration.unit === "sec"
    ? step.duration.value
    : step.duration.value * APPROX_SEC_PER_METER;
}

export function totalDurationSec(structure: WorkoutStructure): number {
  let total = 0;
  for (const block of structure.blocks) {
    if (block.type === "step") {
      total += stepDurationSec(block);
    } else {
      total +=
        block.count *
        block.steps.reduce((sum, s) => sum + stepDurationSec(s), 0);
    }
  }
  return Math.round(total);
}

// Flatten repeats into the literal step sequence (for profile rendering).
export function flattenSteps(structure: WorkoutStructure): StructureStep[] {
  const out: StructureStep[] = [];
  for (const block of structure.blocks) {
    if (block.type === "step") {
      out.push(block);
    } else {
      for (let i = 0; i < block.count; i++) out.push(...block.steps);
    }
  }
  return out;
}

// 0–100 visual intensity for the profile chart.
export function stepIntensityPct(step: StructureStep): number {
  if (!step.target) {
    // Sensible defaults per kind so untargeted steps still profile.
    return { warmup: 45, active: 75, recovery: 35, cooldown: 40, rest: 15 }[
      step.kind
    ];
  }
  const mid = (step.target.min + step.target.max) / 2;
  const pct = step.target.metric === "rpe" ? mid * 10 : mid;
  return Math.max(5, Math.min(pct, 130) / 1.3);
}

function describeStepDuration(step: StructureStep): string {
  if (step.duration.unit === "m") return `${step.duration.value} m`;
  const sec = step.duration.value;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}min` : `${m}min ${s}s`;
}

// Plain-text rendering of a structure, one block per line — used to describe
// the prescription to the AI analysis prompts.
export function describeStructure(structure: WorkoutStructure): string {
  const stepLine = (step: StructureStep): string => {
    const target = describeTarget(step);
    return `${step.kind}${step.name ? ` "${step.name}"` : ""} ${describeStepDuration(step)}${target ? ` @ ${target}` : ""}`;
  };
  return structure.blocks
    .map((block) =>
      block.type === "step"
        ? `- ${stepLine(block)}`
        : `- ${block.count}× [ ${block.steps.map(stepLine).join(" ; ")} ]`,
    )
    .join("\n");
}

// Sensible per-sport default target when a step is added or its kind changes:
// bike anchors to FTP, run/swim to threshold *speed* (so warmup 60–75 %pace ≈
// "at or below ~70 % of LT2"), strength to RPE. rest gets no target.
type StepTarget = NonNullable<StructureStep["target"]>;

export const DEFAULT_STEP_TARGETS: Record<
  string,
  Partial<Record<StructureStep["kind"], StepTarget>>
> = {
  bike: {
    warmup: { metric: "%ftp", min: 50, max: 70 },
    active: { metric: "%ftp", min: 76, max: 90 },
    recovery: { metric: "%ftp", min: 45, max: 55 },
    cooldown: { metric: "%ftp", min: 45, max: 60 },
  },
  run: {
    warmup: { metric: "%pace", min: 60, max: 75 },
    active: { metric: "%pace", min: 80, max: 95 },
    recovery: { metric: "%pace", min: 55, max: 70 },
    cooldown: { metric: "%pace", min: 60, max: 70 },
  },
  swim: {
    warmup: { metric: "%pace", min: 70, max: 80 },
    active: { metric: "%pace", min: 85, max: 100 },
    recovery: { metric: "%pace", min: 60, max: 75 },
    cooldown: { metric: "%pace", min: 65, max: 75 },
  },
  strength: {
    warmup: { metric: "rpe", min: 3, max: 4 },
    active: { metric: "rpe", min: 6, max: 8 },
    recovery: { metric: "rpe", min: 2, max: 3 },
    cooldown: { metric: "rpe", min: 2, max: 3 },
  },
};

export function defaultStepTarget(
  sport: string | undefined,
  kind: StructureStep["kind"],
): StepTarget | undefined {
  return sport ? DEFAULT_STEP_TARGETS[sport]?.[kind] : undefined;
}

export function describeTarget(step: StructureStep): string | null {
  if (!step.target) return null;
  const { metric, min, max } = step.target;
  const range = min === max ? `${min}` : `${min}–${max}`;
  switch (metric) {
    case "%ftp":
      return `${range}% FTP`;
    case "%lthr":
      return `${range}% LTHR`;
    case "%pace":
      return `${range}% threshold pace`;
    case "rpe":
      return `RPE ${range}`;
  }
}
