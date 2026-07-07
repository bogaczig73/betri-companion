"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { addStep, deleteStep, updateStep } from "@/app/actions/lactate";
import type { LactateStep } from "@/db/schema";
import { formatPaceSeconds, parsePaceInput } from "@/lib/format";
import { milliToMmol, sportIntensity, type LactateSport } from "@/lib/lactate";

// Editable value ↔ stored (sport-native) value. Bike stores/edits watts as a
// plain number; run/swim edit pace as "m:ss" text but store integer seconds.
function intensityToInput(sport: LactateSport, value: number | null): string {
  if (value == null) return "";
  return sport === "bike" ? String(value) : formatPaceSeconds(value);
}
function inputToIntensity(sport: LactateSport, str: string): number | null {
  const s = str.trim();
  if (!s) return null;
  if (sport === "bike") {
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return parsePaceInput(s);
}

type Draft = { intensity: string; lactate: string; heartRate: string };

const emptyDraft: Draft = { intensity: "", lactate: "", heartRate: "" };

export function StepEditor({
  testId,
  sport,
  steps,
}: {
  testId: string;
  sport: LactateSport;
  steps: LactateStep[];
}) {
  const si = sportIntensity(sport);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const commit = (fn: () => Promise<void>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });

  const saveExisting = (step: LactateStep, patch: Partial<Draft>) => {
    const current: Draft = {
      intensity: intensityToInput(sport, step.intensityValue),
      lactate: milliToMmol(step.lactate)?.toString() ?? "",
      heartRate: step.heartRate?.toString() ?? "",
      ...patch,
    };
    commit(() =>
      updateStep(step.id, testId, {
        intensityValue: inputToIntensity(sport, current.intensity),
        lactate: current.lactate === "" ? "" : Number(current.lactate),
        heartRate: current.heartRate === "" ? "" : Number(current.heartRate),
      }),
    );
  };

  const addDraft = () => {
    if (draft.intensity === "" && draft.lactate === "") return;
    commit(async () => {
      await addStep(testId, {
        intensityValue: inputToIntensity(sport, draft.intensity),
        lactate: draft.lactate === "" ? "" : Number(draft.lactate),
        heartRate: draft.heartRate === "" ? "" : Number(draft.heartRate),
      });
    });
    setDraft(emptyDraft);
  };

  const cols = "grid grid-cols-[1.5rem_1fr_1fr_1fr_1.75rem] items-center gap-x-2";
  const paceHint = sport === "bike" ? "watts" : "m:ss";

  return (
    <div>
      <div className="overflow-hidden rounded-lg border">
        <div
          className={`${cols} bg-muted/60 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground`}
        >
          <span>#</span>
          <span>
            {si.valueLabel} {si.valueUnit}
          </span>
          <span>Lactate</span>
          <span>HR</span>
          <span />
        </div>
        <ul className="divide-y">
          {steps.map((step, i) => (
            <li key={step.id} className={`${cols} px-2 py-1.5`}>
              <span className="text-xs font-semibold text-muted-foreground">
                {i + 1}
              </span>
              <Cell
                defaultValue={intensityToInput(sport, step.intensityValue)}
                placeholder={paceHint}
                onCommit={(v) => saveExisting(step, { intensity: v })}
              />
              <Cell
                defaultValue={milliToMmol(step.lactate)?.toString() ?? ""}
                placeholder="mmol/L"
                inputMode="decimal"
                onCommit={(v) => saveExisting(step, { lactate: v })}
              />
              <Cell
                defaultValue={step.heartRate?.toString() ?? ""}
                placeholder="bpm"
                inputMode="numeric"
                onCommit={(v) => saveExisting(step, { heartRate: v })}
              />
              <button
                type="button"
                aria-label={`Remove step ${i + 1}`}
                disabled={pending}
                onClick={() => commit(() => deleteStep(step.id, testId))}
                className="flex h-7 w-7 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X size={15} />
              </button>
            </li>
          ))}

          {/* Draft row for the next step */}
          <li className={`${cols} bg-muted/20 px-2 py-1.5`}>
            <span className="text-xs font-semibold text-muted-foreground">
              {steps.length + 1}
            </span>
            <Cell
              key={`d-int-${steps.length}`}
              value={draft.intensity}
              placeholder={paceHint}
              onChange={(v) => setDraft((d) => ({ ...d, intensity: v }))}
            />
            <Cell
              key={`d-lac-${steps.length}`}
              value={draft.lactate}
              placeholder="mmol/L"
              inputMode="decimal"
              onChange={(v) => setDraft((d) => ({ ...d, lactate: v }))}
            />
            <Cell
              key={`d-hr-${steps.length}`}
              value={draft.heartRate}
              placeholder="bpm"
              inputMode="numeric"
              onChange={(v) => setDraft((d) => ({ ...d, heartRate: v }))}
            />
            <span />
          </li>
        </ul>
      </div>
      <button
        type="button"
        onClick={addDraft}
        disabled={pending}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-dashed py-2 text-xs font-semibold uppercase tracking-wide hover:bg-muted disabled:opacity-50"
      >
        <Plus size={15} /> Add step
      </button>
    </div>
  );
}

// Controlled when `value`/`onChange` given (draft row); uncommitted-until-blur
// when `defaultValue`/`onCommit` given (existing rows).
function Cell({
  value,
  defaultValue,
  placeholder,
  inputMode = "text",
  onChange,
  onCommit,
}: {
  value?: string;
  defaultValue?: string;
  placeholder: string;
  inputMode?: "text" | "numeric" | "decimal";
  onChange?: (v: string) => void;
  onCommit?: (v: string) => void;
}) {
  return (
    <input
      inputMode={inputMode}
      value={value}
      defaultValue={defaultValue}
      placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      onBlur={onCommit ? (e) => onCommit(e.target.value) : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-full rounded-md border bg-background px-2 py-1 text-sm font-semibold tabular-nums outline-none focus:border-ring"
    />
  );
}
