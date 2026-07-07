"use client";

import type { LactateStep } from "@/db/schema";
import {
  milliToMmol,
  type LactateBaseline,
  type LactateSport,
  type StepInput,
} from "@/lib/lactate";

import { BaselineEditor } from "./baseline-editor";
import { LactateAnalysisView } from "./lactate-analysis-view";
import { StepEditor } from "./step-editor";

// Client shell: the step editor and baseline editor mutate via server actions +
// router.refresh, so `steps`/`baseline` arrive fresh as props and the analysis
// recomputes from the persisted source of truth on every change.
export function LactateTestDetail({
  testId,
  sport,
  steps,
  baseline,
}: {
  testId: string;
  sport: LactateSport;
  steps: LactateStep[];
  baseline: LactateBaseline;
}) {
  const stepInputs: StepInput[] = steps.map((s) => ({
    value: s.intensityValue,
    lactate: milliToMmol(s.lactate),
    heartRate: s.heartRate,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Steps
        </h2>
        <StepEditor testId={testId} sport={sport} steps={steps} />
        <BaselineEditor testId={testId} sport={sport} baseline={baseline} />
      </div>
      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Thresholds
        </h2>
        <LactateAnalysisView sport={sport} steps={stepInputs} baseline={baseline} />
      </div>
    </div>
  );
}
