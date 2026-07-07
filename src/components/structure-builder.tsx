"use client";

import { Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  describeTarget,
  flattenSteps,
  stepDurationSec,
  stepIntensityPct,
  totalDurationSec,
  STEP_KINDS,
  TARGET_METRICS,
  type StructureBlock,
  type StructureStep,
  type WorkoutStructure,
} from "@/lib/structure";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_COLORS: Record<StructureStep["kind"], string> = {
  warmup: "bg-amber-400 dark:bg-amber-500",
  active: "bg-rose-500 dark:bg-rose-600",
  recovery: "bg-emerald-400 dark:bg-emerald-500",
  cooldown: "bg-sky-400 dark:bg-sky-500",
  rest: "bg-muted-foreground/30",
};

const smallSelect =
  "border-input bg-transparent h-7 rounded-md border px-1.5 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";
const smallInput = "h-7 px-1.5 text-xs";

// ---------------------------------------------------------------------------
// Read-only profile chart (TrainingPeaks-style bars)
// ---------------------------------------------------------------------------

export function StructureProfile({
  structure,
  className,
}: {
  structure: WorkoutStructure;
  className?: string;
}) {
  const steps = flattenSteps(structure);
  if (steps.length === 0) return null;
  const total = steps.reduce((sum, s) => sum + stepDurationSec(s), 0);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-16 items-end gap-px overflow-hidden rounded-md bg-muted/40 p-1">
        {steps.map((step, i) => (
          <div
            key={i}
            title={`${step.name || step.kind}${describeTarget(step) ? ` · ${describeTarget(step)}` : ""}`}
            className={cn("rounded-[2px]", KIND_COLORS[step.kind])}
            style={{
              width: `${Math.max((stepDurationSec(step) / total) * 100, 1)}%`,
              height: `${stepIntensityPct(step)}%`,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        ~{formatDuration(totalDurationSec(structure))} total
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function newStep(): StructureStep {
  return {
    type: "step",
    kind: "active",
    duration: { unit: "sec", value: 600 },
  };
}

function StepEditor({
  step,
  onChange,
  onDelete,
}: {
  step: StructureStep;
  onChange: (s: StructureStep) => void;
  onDelete: () => void;
}) {
  const durationDisplay =
    step.duration.unit === "sec"
      ? Math.round(step.duration.value / 60)
      : step.duration.value;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          KIND_COLORS[step.kind],
        )}
      />
      <select
        className={smallSelect}
        value={step.kind}
        onChange={(e) =>
          onChange({ ...step, kind: e.target.value as StructureStep["kind"] })
        }
      >
        {STEP_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <Input
        className={cn(smallInput, "w-16")}
        type="number"
        min="0"
        step={step.duration.unit === "sec" ? 1 : 50}
        value={durationDisplay || ""}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange({
            ...step,
            duration: {
              ...step.duration,
              value: step.duration.unit === "sec" ? v * 60 : v,
            },
          });
        }}
      />
      <select
        className={smallSelect}
        value={step.duration.unit}
        onChange={(e) => {
          const unit = e.target.value as "sec" | "m";
          onChange({
            ...step,
            duration: { unit, value: unit === "sec" ? 600 : 1000 },
          });
        }}
      >
        <option value="sec">min</option>
        <option value="m">m</option>
      </select>
      <select
        className={smallSelect}
        value={step.target?.metric ?? ""}
        onChange={(e) => {
          const metric = e.target.value;
          if (!metric) {
            onChange({ ...step, target: undefined });
          } else {
            const isRpe = metric === "rpe";
            onChange({
              ...step,
              target: {
                metric: metric as NonNullable<StructureStep["target"]>["metric"],
                min: step.target?.min ?? (isRpe ? 5 : 70),
                max: step.target?.max ?? (isRpe ? 6 : 80),
              },
            });
          }
        }}
      >
        <option value="">no target</option>
        {TARGET_METRICS.map((m) => (
          <option key={m} value={m}>
            {m === "%pace" ? "% pace" : m === "%ftp" ? "% FTP" : m === "%lthr" ? "% LTHR" : "RPE"}
          </option>
        ))}
      </select>
      {step.target && (
        <>
          <Input
            className={cn(smallInput, "w-14")}
            type="number"
            min="0"
            value={step.target.min || ""}
            onChange={(e) =>
              onChange({
                ...step,
                target: { ...step.target!, min: Number(e.target.value) },
              })
            }
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            className={cn(smallInput, "w-14")}
            type="number"
            min="0"
            value={step.target.max || ""}
            onChange={(e) =>
              onChange({
                ...step,
                target: { ...step.target!, max: Number(e.target.value) },
              })
            }
          />
        </>
      )}
      <button
        type="button"
        title="Remove step"
        className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

export function StructureBuilder({
  name,
  initial,
}: {
  name: string; // form field name carrying the JSON payload
  initial?: WorkoutStructure | null;
}) {
  const [blocks, setBlocks] = useState<StructureBlock[]>(
    initial?.blocks ?? [],
  );

  const update = (i: number, block: StructureBlock) =>
    setBlocks(blocks.map((b, j) => (j === i ? block : b)));
  const remove = (i: number) => setBlocks(blocks.filter((_, j) => j !== i));

  const structure: WorkoutStructure | null =
    blocks.length > 0 ? { blocks } : null;

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name={name}
        value={structure ? JSON.stringify(structure) : ""}
      />
      {structure && <StructureProfile structure={structure} />}
      <div className="space-y-2">
        {blocks.map((block, i) =>
          block.type === "step" ? (
            <StepEditor
              key={i}
              step={block}
              onChange={(s) => update(i, s)}
              onDelete={() => remove(i)}
            />
          ) : (
            <div key={i} className="space-y-1.5 rounded-md border border-dashed p-2">
              <div className="flex items-center gap-1.5">
                <Repeat className="size-3.5 text-muted-foreground" />
                <Input
                  className={cn(smallInput, "w-14")}
                  type="number"
                  min="2"
                  max="100"
                  value={block.count || ""}
                  onChange={(e) =>
                    update(i, { ...block, count: Number(e.target.value) })
                  }
                />
                <span className="text-xs text-muted-foreground">times</span>
                <button
                  type="button"
                  title="Remove repeat"
                  className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <div className="space-y-1.5 pl-5">
                {block.steps.map((s, j) => (
                  <StepEditor
                    key={j}
                    step={s}
                    onChange={(ns) =>
                      update(i, {
                        ...block,
                        steps: block.steps.map((x, k) => (k === j ? ns : x)),
                      })
                    }
                    onDelete={() =>
                      update(i, {
                        ...block,
                        steps: block.steps.filter((_, k) => k !== j),
                      })
                    }
                  />
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    update(i, { ...block, steps: [...block.steps, newStep()] })
                  }
                >
                  <Plus className="size-3" /> step
                </Button>
              </div>
            </div>
          ),
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBlocks([...blocks, newStep()])}
        >
          <Plus className="size-3.5" /> Step
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setBlocks([
              ...blocks,
              {
                type: "repeat",
                count: 4,
                steps: [
                  {
                    type: "step",
                    kind: "active",
                    duration: { unit: "sec", value: 180 },
                  },
                  {
                    type: "step",
                    kind: "recovery",
                    duration: { unit: "sec", value: 120 },
                  },
                ],
              },
            ])
          }
        >
          <Repeat className="size-3.5" /> Repeat
        </Button>
      </div>
    </div>
  );
}
